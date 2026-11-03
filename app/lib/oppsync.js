// Copies the child's details and the parent's email/phone from a GHL contact onto their Winter Camp
// 2026 opportunity. Only empty opportunity fields are filled, so a value someone typed on the
// opportunity is never overwritten. Opportunity fields are found by key, so one that doesn't exist
// in GHL yet is simply skipped until it's created.

import { PAID_PIPELINES, PORTAL_TEST_TAG, oppField } from "./documents.js";

// opportunity field key -> its value on the contact (portal contact model: fields by key)
const SOURCES = {
  child_name: (c) => c.fields.child_name,
  child_age: (c) => c.fields.childs_age,
  email: (c) => c.email,
  phone_number: (c) => c.phone,
};
const filled = (v) => String(v ?? "").trim() !== "";
export const SCOPE_MESSAGE = "GHL refused to update opportunities: your Private Integration token needs the “Edit Opportunities” scope (opportunities.write). Add it in GHL → Settings → Private Integrations, then try again.";
const denied = (err) => err?.status === 401 || err?.status === 403;

// testOnly (before launch): only contacts tagged portal-test have their opportunities changed.
export function createOppSync({ store, db, testOnly = false }) {
  // After GHL refuses for lack of scope, automatic syncs pause for 10 minutes instead of retrying
  // on every page load. The admin button always tries.
  let pausedUntil = 0;
  // who: the admin's name, "Automatic sync", or the parent's name for the enrollment form.
  function log(who, action, target, details = "") {
    db.prepare("INSERT INTO activity_log (at, user_id, user_name, action, target, details) VALUES (?, NULL, ?, ?, ?, ?)")
      .run(new Date().toISOString(), who, action, target, details);
  }

  async function fieldsByKey() {
    return Object.fromEntries((await store.fieldDefinitions("opportunity")).map((d) => [d.key, d]));
  }

  // Opportunity fields this sync uses that don't exist in GHL yet (by key).
  async function missingFields() {
    const byKey = await fieldsByKey();
    return Object.keys(SOURCES).filter((k) => !byKey[k]);
  }

  // Fills one opportunity's empty fields from its contact. Returns the names of the fields set.
  async function syncOpportunity(opp, contact, who = "Automatic sync", { force = false } = {}) {
    if (!opp || !contact || (!force && Date.now() < pausedUntil)) return [];
    if (testOnly && !(contact.tags || []).includes(PORTAL_TEST_TAG)) return [];
    const byKey = await fieldsByKey();
    const updates = [];
    for (const [key, from] of Object.entries(SOURCES)) {
      const def = byKey[key];
      const value = String(from(contact) ?? "").trim();
      if (def && value && !filled(oppField(opp, def.id))) updates.push({ def, value });
    }
    if (!updates.length) return [];
    try {
      await store.updateOpportunityFields(opp.id, Object.fromEntries(updates.map((u) => [u.def.id, u.value])));
    } catch (err) {
      if (denied(err)) { pausedUntil = Date.now() + 10 * 60_000; throw Object.assign(new Error(SCOPE_MESSAGE), { status: err.status, scope: true }); }
      throw err;
    }
    // Keep the copy in hand current so pages show the new values without another GHL call.
    opp.customFields = [...(opp.customFields || []).filter((f) => !updates.some((u) => u.def.id === f.id)), ...updates.map((u) => ({ id: u.def.id, value: u.value }))];
    log(who, "Synced child info to opportunity", opp.name || opp.id, updates.map((u) => `${u.def.name}: ${u.value}`).join(", "));
    return updates.map((u) => u.def.name);
  }

  // Every opportunity in the paid pipelines (all stages). Returns counts for the admin.
  async function syncPipeline(who) {
    const opps = (await Promise.all(PAID_PIPELINES.map((pipelineId) => store.searchOpportunities({ pipelineId })))).flat();
    const contacts = new Map();
    let updated = 0, failed = 0;
    for (const opp of opps) {
      try {
        if (!contacts.has(opp.contactId)) contacts.set(opp.contactId, await store.getContact(opp.contactId).catch(() => null));
        if ((await syncOpportunity(opp, contacts.get(opp.contactId), who, { force: true })).length) updated++;
      } catch (err) {
        if (err.scope) throw err; // every other opportunity would fail the same way
        failed++;
        console.error(`  Child info sync failed for opportunity ${opp.id}: ${err.message}`);
      }
    }
    return { opportunities: opps.length, updated, failed, missing: await missingFields() };
  }

  // A contact's opportunities in the paid pipelines (all stages), e.g. right after the enrollment form.
  async function syncContact(contact, who) {
    const opps = (await Promise.all(PAID_PIPELINES.map((pipelineId) => store.searchOpportunities({ pipelineId, contactId: contact.id })))).flat();
    let updated = 0;
    for (const opp of opps) if ((await syncOpportunity(opp, contact, who, { force: true })).length) updated++;
    return updated;
  }

  return { syncOpportunity, syncPipeline, syncContact, missingFields };
}
