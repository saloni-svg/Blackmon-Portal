// Live GoHighLevel store. Talks to the GHL v2 API with a Private Integration token.
// Every portal read/write goes through here; the token never leaves the server.

const API = "https://services.leadconnectorhq.com";

// Portal custom value names in GHL -> keys the portal uses
const LINK_NAMES = {
  "Portal Login Link": "portalLogin",
  "Portal Payment Link": "payment",
  "Portal Intro Video Form Link": "introVideoForm",
  "Portal WhatsApp Little Elm Link": "whatsappLittleElm",
  "Portal Wise Invite Link": "wiseInvite",
};

// An opportunity custom field's value; GHL puts it in a type-specific property.
function oppFieldValue(cf) {
  const v = cf.fieldValueString ?? cf.fieldValueNumber ?? cf.fieldValueArray ?? cf.fieldValueBoolean ?? cf.fieldValueDate ?? cf.fieldValue ?? cf.value ?? null;
  return Array.isArray(v) ? v.join(", ") : v;
}

// An opportunity from /opportunities/search or GET /opportunities/{id}, in the portal's shape.
function toOpportunity(o) {
  return {
    id: o.id, name: o.name || "", status: o.status || "", contactId: o.contactId || o.contact?.id, contactEmail: o.contact?.email || "", contactName: o.contact?.name || "", contactPhone: o.contact?.phone || "", value: o.monetaryValue ?? null,
    pipelineId: o.pipelineId, stageId: o.pipelineStageId, createdAt: o.createdAt || null, updatedAt: o.updatedAt || null, stageChangedAt: o.lastStageChangeAt || null,
    customFields: (o.customFields || []).map((cf) => ({ id: cf.id, value: oppFieldValue(cf) })),
  };
}
// Runs fn over items, at most `limit` at a time, keeping their order.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export function createGhlStore({ token, locationId }) {
  let fieldDefs = null; // { byKey: {key: def}, byId: {id: def} }
  let linksCache = { at: 0, value: null };
  const defsByModel = new Map(); // model -> { at, list }
  const stagesCache = new Map(); // pipelineId -> { at, value }

  async function call(method, path, { body, version = "2021-07-28", form } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Version: version, Accept: "application/json" };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(API + path, { method, headers, body: payload });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      console.error(`  GHL ${method} ${path.split("?")[0]} -> ${res.status}. Full response body:\n${text}`);
      const err = new Error(`GHL ${method} ${path.split("?")[0]} failed: ${res.status} ${data?.message || text.slice(0, 200)}`);
      err.status = res.status;
      err.body = data; // GHL's parsed response, e.g. { message, canonicalCode }
      throw err;
    }
    return data;
  }

  async function defs() {
    if (fieldDefs) return fieldDefs;
    const data = await call("GET", `/locations/${locationId}/customFields?model=contact`);
    const byKey = {}, byId = {};
    for (const f of data.customFields || []) {
      const key = (f.fieldKey || "").replace(/^contact\./, "");
      const def = { id: f.id, key, name: f.name, type: f.dataType, options: f.picklistOptions || [] };
      byKey[key] = def;
      byId[f.id] = def;
    }
    fieldDefs = { byKey, byId };
    return fieldDefs;
  }

  async function toModel(c) {
    const { byId } = await defs();
    const fields = {};
    for (const cf of c.customFields || []) {
      const def = byId[cf.id];
      if (def) fields[def.key] = cf.value ?? cf.fieldValue ?? null;
    }
    return {
      id: c.id,
      firstName: c.firstName || c.firstNameRaw || "",
      lastName: c.lastName || "",
      email: c.email || "",
      phone: c.phone || "",
      tags: c.tags || [],
      fields,
    };
  }

  return {
    live: true,

    async findByEmail(email) {
      const q = new URLSearchParams({ locationId, email });
      const data = await call("GET", `/contacts/search/duplicate?${q}`);
      if (!data?.contact?.id) return null;
      return this.getContact(data.contact.id);
    },

    // Every contact with this email (GHL allows duplicates), up to 10, as portal contact models.
    async findAllByEmail(email) {
      const data = await call("POST", "/contacts/search", {
        body: { locationId, pageLimit: 10, filters: [{ field: "email", operator: "eq", value: email }] },
      });
      const ids = (data.contacts || []).map((c) => c.id);
      return Promise.all(ids.map((cid) => this.getContact(cid)));
    },

    async getContact(id) {
      const data = await call("GET", `/contacts/${encodeURIComponent(id)}`);
      return toModel(data.contact);
    },

    async fieldOptions(key) {
      const { byKey } = await defs();
      return byKey[key]?.options || [];
    },

    async updateFields(id, values) {
      const { byKey } = await defs();
      const customFields = [];
      for (const [key, value] of Object.entries(values)) {
        const def = byKey[key];
        if (!def) throw new Error(`Unknown GHL field: ${key}`);
        customFields.push({ id: def.id, field_value: value });
      }
      await call("PUT", `/contacts/${encodeURIComponent(id)}`, { body: { customFields } });
    },

    // Updates standard fields (firstName, lastName, phone) and custom fields together.
    async updateContact(id, standard, values) {
      const { byKey } = await defs();
      const customFields = Object.entries(values).map(([key, value]) => {
        if (!byKey[key]) throw new Error(`Unknown GHL field: ${key}`);
        return { id: byKey[key].id, field_value: value };
      });
      await call("PUT", `/contacts/${encodeURIComponent(id)}`, { body: { ...standard, customFields } });
    },

    // Creates an invoice for an existing contact, marks it sent without GHL emailing or texting
    // anyone ("send_manually"), and returns its public payment page URL.
    async createInvoice(contact, { program, amount, dueDate, liveMode, userId }) {
      const created = await call("POST", "/invoices/", {
        body: {
          altId: locationId, altType: "location",
          name: `Camp installment – ${program}`,
          businessDetails: { name: "Blackmon Tutoring", phoneNo: "+14692611625", website: "https://www.blackmontutoring.com" },
          currency: "USD",
          items: [{ name: `${program} – installment`, currency: "USD", amount, qty: 1, type: "one_time" }],
          discount: { type: "fixed", value: 0 },
          contactDetails: {
            id: contact.id,
            name: `${contact.firstName} ${contact.lastName}`.trim(),
            phoneNo: contact.phone || "",
            email: contact.email,
          },
          issueDate: new Date().toISOString().slice(0, 10),
          dueDate,
          sentTo: { email: [contact.email] },
          liveMode,
        },
      });
      const invoiceId = created?._id;
      if (!invoiceId) throw new Error(`GHL did not return an invoice ID: ${JSON.stringify(created)}`);
      await call("POST", `/invoices/${invoiceId}/send`, {
        body: { altId: locationId, altType: "location", userId, action: "send_manually", liveMode },
      });
      return { invoiceId, url: `https://link.msgsndr.com/invoice/${invoiceId}` };
    },

    // standard: optional firstName / lastName / phone for the new contact.
    async createContact(email, values, tags, standard = {}) {
      const { byKey } = await defs();
      const customFields = Object.entries(values).map(([key, value]) => {
        if (!byKey[key]) throw new Error(`Unknown GHL field: ${key}`);
        return { id: byKey[key].id, field_value: value };
      });
      const data = await call("POST", "/contacts/", { body: { locationId, ...standard, email, tags, customFields } });
      return this.getContact(data.contact.id);
    },

    // Opportunities in a pipeline, optionally narrowed to one stage and/or one contact.
    //
    // /opportunities/search is only used to FIND which opportunities exist: its values (custom
    // fields, stage, monetaryValue) can lag behind GHL by up to about an hour. So by default (live)
    // every opportunity it finds is read again with GET /opportunities/{id} and that live record is
    // what's returned; the stage is checked on the live record too, so the search isn't narrowed to
    // the stage (an opportunity that just moved to Paid (won) may not be in the stage's search yet).
    // live: false skips the re-read (only where just the ids / contact are needed).
    //
    // GHL wants the search filters in snake_case (location_id, pipeline_id, pipeline_stage_id,
    // contact_id) but the page cursor in camelCase (startAfter, startAfterId from the previous page's
    // meta); start_after / start_after_id are rejected with a 422. `q` is GHL's fuzzy text search, so
    // callers must filter exactly.
    async searchOpportunities({ pipelineId, stageId, contactId, q: text, live = true }) {
      const out = [];
      let cursor = null;
      for (let page = 0; page < 100; page++) {
        const q = new URLSearchParams({ location_id: locationId, pipeline_id: pipelineId, limit: "100" });
        if (stageId && !live) q.set("pipeline_stage_id", stageId);
        if (contactId) q.set("contact_id", contactId);
        if (text) q.set("q", text);
        if (cursor) { q.set("startAfter", cursor.startAfter); q.set("startAfterId", cursor.startAfterId); }
        const data = await call("GET", `/opportunities/search?${q}`);
        const list = data.opportunities || [];
        out.push(...list.map(toOpportunity));
        const total = data.meta?.total ?? 0;
        if (!list.length || out.length >= total || !data.meta?.startAfterId) break;
        cursor = { startAfter: String(data.meta.startAfter), startAfterId: data.meta.startAfterId };
      }
      const found = live ? (await mapLimit(out, 5, (o) => this.getOpportunity(o.id).then((fresh) => fresh && { ...o, ...fresh,
        // GET by id doesn't always carry the contact's name / email / phone; keep the search's then.
        contactName: fresh.contactName || o.contactName, contactEmail: fresh.contactEmail || o.contactEmail, contactPhone: fresh.contactPhone || o.contactPhone })
        .catch((err) => { console.error(`  GHL: couldn't read opportunity ${o.id} live (${err.message}); using the search copy.`); return o; }))).filter(Boolean) : out;
      return found.filter((o) => o.contactId && o.pipelineId === pipelineId && (!stageId || o.stageId === stageId) && (!contactId || o.contactId === contactId));
    },

    // One opportunity, live (GET /opportunities/{id}), in the same shape as searchOpportunities.
    // null if GHL no longer has it.
    async getOpportunity(id) {
      try { return toOpportunity((await call("GET", `/opportunities/${encodeURIComponent(id)}`)).opportunity); }
      catch (err) { if (err.status === 404) return null; throw err; }
    },

    // A contact's invoices, with their line items and totals (read only).
    async invoicesFor(contactId) {
      const data = await call("GET", `/invoices/?altId=${locationId}&altType=location&contactId=${encodeURIComponent(contactId)}&limit=20&offset=0`);
      return data.invoices || [];
    },

    // A contact's payment orders (payment-link / funnel purchases) with their items (read only).
    // Needs the payments/orders.readonly scope on the token.
    async ordersFor(contactId) {
      const alt = `altId=${locationId}&altType=location`;
      const data = await call("GET", `/payments/orders?${alt}&contactId=${encodeURIComponent(contactId)}&limit=50`);
      return Promise.all((data.data || []).map((o) => call("GET", `/payments/orders/${encodeURIComponent(o._id)}?${alt}`).then((d) => d.order || d)));
    },

    // The contact exactly as GHL returns it (address, source, tags, every custom field, ...).
    async getContactRaw(id) {
      return (await call("GET", `/contacts/${encodeURIComponent(id)}`)).contact;
    },

    // Custom field names for "contact" or "opportunity", cached for 5 minutes.
    async fieldDefinitions(model) {
      const hit = defsByModel.get(model);
      if (hit && Date.now() - hit.at < 300_000) return hit.list;
      const data = await call("GET", `/locations/${locationId}/customFields?model=${encodeURIComponent(model)}`);
      const list = (data.customFields || []).map((f) => ({ id: f.id, key: (f.fieldKey || "").replace(/^\w+\./, ""), name: (f.name || "").trim(), type: f.dataType, position: f.position ?? 0 }));
      defsByModel.set(model, { at: Date.now(), list });
      return list;
    },

    // { name, stages: { stageId: stageName } } for a pipeline. This endpoint wants camelCase locationId.
    async pipelineInfo(pipelineId) {
      const hit = stagesCache.get(pipelineId);
      if (hit && Date.now() - hit.at < 600_000) return hit.value;
      const data = await call("GET", `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`);
      const p = (data.pipelines || []).find((x) => x.id === pipelineId);
      const value = { name: p?.name || "", stages: Object.fromEntries((p?.stages || []).map((s) => [s.id, s.name])) };
      stagesCache.set(pipelineId, { at: Date.now(), value });
      return value;
    },

    // Sets opportunity custom fields: values = { fieldId: value }. Other fields are left as they are.
    // Opportunities need "fieldValue"; GHL accepts "field_value" here but silently ignores it.
    async updateOpportunityFields(id, values) {
      const customFields = Object.entries(values).map(([fid, value]) => ({ id: fid, fieldValue: value }));
      await call("PUT", `/opportunities/${encodeURIComponent(id)}`, { body: { customFields } });
    },

    async addNote(contactId, body) {
      await call("POST", `/contacts/${encodeURIComponent(contactId)}/notes`, { body: { body } });
    },

    async addTags(id, tags) {
      await call("POST", `/contacts/${encodeURIComponent(id)}/tags`, { body: { tags } });
    },

    async uploadToField(id, key, file) {
      const { byKey } = await defs();
      const def = byKey[key];
      if (!def) throw new Error(`Unknown GHL field: ${key}`);
      const form = new FormData();
      form.append(`${def.id}_${crypto.randomUUID()}`, new Blob([file.buffer], { type: file.type }), file.name);
      const q = new URLSearchParams({ contactId: id, locationId });
      await call("POST", `/forms/upload-custom-files?${q}`, { form });
    },

    async links() {
      if (linksCache.value && Date.now() - linksCache.at < 60_000) return linksCache.value;
      const data = await call("GET", `/locations/${locationId}/customValues`);
      const out = {};
      for (const cv of data.customValues || []) {
        if (LINK_NAMES[cv.name]) out[LINK_NAMES[cv.name]] = cv.value || "";
      }
      linksCache = { at: Date.now(), value: out };
      return out;
    },

    // Emails a contact through GHL Conversations (shows in their GHL conversation history).
    // text: an optional plain-text version (sent as the message body next to the HTML). Returns
    // GHL's message id.
    async sendEmail(contact, subject, html, text) {
      const data = await call("POST", "/conversations/messages", {
        version: "2021-04-15",
        body: { type: "Email", contactId: contact.id, subject, html, ...(text ? { message: text } : {}) },
      });
      return { messageId: data?.messageId || data?.emailMessageId || data?.id || null, conversationId: data?.conversationId || null };
    },

    // Texts a contact through GHL Conversations (uses the location's GHL phone number).
    // Returns GHL's message id.
    async sendSms(contact, message) {
      if (contact.smsContact === false) throw new Error(`${contact.email} has no phone that can be texted`);
      const data = await call("POST", "/conversations/messages", {
        version: "2021-04-15",
        body: { type: "SMS", contactId: (contact.smsContact || contact).id, message },
      });
      return { messageId: data?.messageId || data?.id || null };
    },

    // The GHL contact that receives portal admin alerts (e.g. "talk to a person"). Reuses the
    // contact with this email, keeping its phone up to date; otherwise creates one, tagged
    // portal-admin-alerts so it's never mistaken for a parent. When several contacts have the
    // email (e.g. a test parent with the same address), the portal-admin-alerts one is used.
    // GHL allows one contact per phone: if another contact already has the phone, the email still
    // goes to this contact and texts go to that one (smsContact), instead of nothing being sent.
    // contactId (ADMIN_ALERT_CONTACT_ID): use exactly that GHL contact, read only (its tags and phone
    // are never changed); texts go to its own phone from the location's default number.
    async ensureAlertContact(email, phone, contactId = "") {
      if (contactId) return this.getContact(contactId);
      const digits = (p) => String(p || "").replace(/\D/g, "");
      const all = await this.findAllByEmail(email).catch(() => []);
      const found = all.find((c) => (c.tags || []).includes("portal-admin-alerts"))
        || all.find((c) => phone && digits(c.phone) === digits(phone)) || all[0] || await this.findByEmail(email);
      if (found && (!phone || digits(found.phone) === digits(phone))) return found;
      const contact = found
        ? await this.updateContact(found.id, { phone }, {}).then(() => ({ ...found, phone }), (err) => ({ ...found, phoneError: err }))
        : await this.createContact(email, {}, ["portal-admin-alerts"], { firstName: "Blackmon", lastName: "Admin Alerts", phone })
          .then((c) => c, (err) => this.createContact(email, {}, ["portal-admin-alerts"], { firstName: "Blackmon", lastName: "Admin Alerts" }).then((c) => ({ ...c, phoneError: err })));
      if (!contact.phoneError) return contact;
      const owner = await this.findByPhone(phone).catch(() => null);
      console.error(`  Alerts: couldn't set ${phone} on ${email} (${contact.phoneError.message.slice(0, 120)}); ${owner ? `texts go to contact ${owner.id}, which has that phone` : "no texts can be sent"}.`);
      return { ...contact, smsContact: owner || false };
    },

    // The contact with this phone number, or null.
    async findByPhone(phone) {
      const q = new URLSearchParams({ locationId, number: phone });
      const data = await call("GET", `/contacts/search/duplicate?${q}`);
      return data?.contact?.id ? { id: data.contact.id, phone: data.contact.phone } : null;
    },

    // portalUrl: the portal's address (PORTAL_URL), shown as the place to enter the code.
    async sendCode(contact, code, portalUrl = "") {
      const hi = `Hi ${contact.firstName || "there"},`;
      await this.sendEmail(contact, `Your Blackmon Portal sign-in code: ${code}`,
        `<div style="font-family:Arial,sans-serif;font-size:16px;color:#0B1F3F">` +
        `<p>${escapeHtml(hi)}</p>` +
        `<p>Your Blackmon Portal sign-in code is:</p>` +
        `<p style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</p>` +
        (portalUrl ? `<p>Enter it at <a href="${escapeHtml(portalUrl)}" style="color:#1F6FAE">${escapeHtml(portalUrl)}</a>.</p>` : "") +
        `<p>It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>` +
        `<p>Blackmon Tutoring</p></div>`,
        [hi, "", "Your Blackmon Portal sign-in code is:", "", code, "", portalUrl ? `Enter it at ${portalUrl}` : "",
          "It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.", "", "Blackmon Tutoring"].filter((l, i, a) => l || a[i - 1]).join("\n"));
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
