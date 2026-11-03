// Camp documents for paid Winter Camp 2026 parents: which documents each parent gets (the
// opportunity's Lunch Included decides the Meal Plan), viewing, waiver signing (a signed copy is
// built with pdf-lib: the original PDF plus a signature page), and the admin notifications that
// signatures create. The document list itself lives in content/documents.json.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { validateSignature } from "../public/validate.js";

// Which opportunities count as paid. Default: "Paid (won)" in the "Winter Camp" pipeline (where the
// published Payment Received workflow puts live payments) and in "Winter Camp 2026" (test contacts).
// Override in .env: PAID_STAGES=pipelineId:stageId,pipelineId:stageId
const DEFAULT_PAID = [
  { pipelineId: "KI5wP7tlO3m2TQecWW7x", stageId: "37f27262-4e8c-4fda-b068-716dfcf252a9" }, // Winter Camp
  { pipelineId: "eXOcuRrWabqKkb20C3KC", stageId: "ef44a5c4-5c0c-47ba-a6c7-e677aca1f0bf" }, // Winter Camp 2026
];
const fromEnv = String(process.env.PAID_STAGES || "").split(",").map((s) => s.trim().split(":")).filter((p) => p.length === 2 && p[0] && p[1])
  .map(([pipelineId, stageId]) => ({ pipelineId, stageId }));
export const PAID_STAGES = fromEnv.length ? fromEnv : DEFAULT_PAID;
export const PAID_PIPELINES = [...new Set(PAID_STAGES.map((s) => s.pipelineId))];
// PAID_SINCE=YYYY-MM-DD: only opportunities that reached Paid (won) on or after this date count
// (the pipeline may hold earlier seasons). Empty = every paid opportunity counts. Also the date
// automatic portal invites need before they go to real families (lib/admin.js).
export const PAID_SINCE = Date.parse(process.env.PAID_SINCE || "") || null;
const paidAt = (o) => Date.parse(o.stageChangedAt || o.createdAt || "") || 0;
export const isPaidOpp = (o) => !!o && PAID_STAGES.some((s) => s.pipelineId === o.pipelineId && s.stageId === o.stageId)
  && (!PAID_SINCE || paidAt(o) >= PAID_SINCE);
// Paid opportunities across every paid stage, newest first. extra: { contactId } or { q }.
export async function searchPaid(store, extra = {}) {
  const lists = await Promise.all(PAID_STAGES.map((s) => store.searchOpportunities({ ...s, ...extra })));
  return lists.flat().filter(isPaidOpp).sort((a, b) => paidAt(b) - paidAt(a));
}
// Contacts tagged portal-test are the only ones the portal emails or changes automatically before launch.
export const PORTAL_TEST_TAG = "portal-test";
// Opportunity custom fields: opportunity.lunch_included and opportunity.child_name.
export const OPP_FIELDS = { lunch: "6TXpnRke5ZmEqe3r9Rzb", child: "pUYmi0vYThlJoeqi8ucX",
  package: "h1rnZpVWWVMlFzrdkMu3", packageAmount: "BFkNFdq93TyS0lYCFF5g", // opportunity.camp_package, opportunity.package_amount
  sports: "5pPdYwI9qj4ABWiQlCFs", tier: "jFha8u0CpPgP4GKyyffL", transport: "JAEUtXidfYfzoPT9ElE3" }; // opportunity.sports_included, opportunity.package (Basic / Standard / Premium)

// Lunch Included is a free-text field: yes / y / true (any case) means yes, anything else no.
export const lunchIncluded = (v) => /^(yes|y|true)$/i.test(String(v ?? "").trim());
export const oppField = (opp, id) => opp?.customFields?.find((f) => f.id === id)?.value ?? null;

// Contact fields that hold the child's details (filled by the enrollment form).
export const CHILD_CONTACT_KEYS = { name: ["child_name", "childs_name"], age: ["childs_age", "child_age"] };

// The child's name and age: the contact's fields first, the opportunity's Child name if the contact
// has none. fields = contact custom field values by key. Each part is { value, source } or null.
export function childOf(fields, opp) {
  const first = (keys) => keys.map((k) => String(fields?.[k] ?? "").trim()).find(Boolean);
  const contactName = first(CHILD_CONTACT_KEYS.name), oppName = String(oppField(opp, OPP_FIELDS.child) ?? "").trim();
  const age = first(CHILD_CONTACT_KEYS.age);
  return {
    name: contactName ? { value: contactName, source: "contact" } : oppName ? { value: oppName, source: "opportunity" } : null,
    age: age ? { value: age, source: "contact" } : null,
  };
}

const now = () => new Date().toISOString();
const httpError = (status, message, fields) => Object.assign(new Error(message), { httpStatus: status, fields });
// pdf-lib's built-in fonts only cover Latin-1; other characters become "?" so the page still builds.
export const latin1 = (s) => String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
export const central = (d) => `${d.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "short" })} (Central)`;

// The original PDF with one page added: who signed, for which child, when, from where, and the
// typed (and optional drawn) signature.
async function buildSignedPdf(original, r) {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  await addSignaturePage(pdf, {
    title: r.title, signature: r.signature, drawing: r.drawing, signedAt: r.signedAt,
    agree: "I have read and agree to this document.",
    rows: [
      ["Document", r.title],
      ["Signed by (parent / guardian)", r.parentName],
      ["Relationship to child", r.relationship],
      ["Child", r.childName],
      ["Parent email", r.email],
      ["Signed on", central(r.signedAt)],
      ["Signed at (UTC)", r.signedAt.toISOString()],
      ["IP address", r.ip || "unknown"],
      ["Browser / device", (r.userAgent || "unknown").slice(0, 80)],
      ["Record ID", r.id],
    ],
  });
  return Buffer.from(await pdf.save());
}

// Adds the "Electronic signature record" page to a loaded PDF: the rows ([label, value]), the
// agreement line, and the typed (and optional drawn, PNG buffer) signature. Also used for the
// camp staff training acknowledgment (lib/acknowledgment.js).
export async function addSignaturePage(pdf, r) {
  const page = pdf.addPage([612, 792]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const navy = rgb(0.043, 0.122, 0.247), muted = rgb(0.35, 0.4, 0.47), line = rgb(0.85, 0.87, 0.91);
  let y = 736;
  const text = (s, x, size, font = reg, color = navy) => page.drawText(latin1(s), { x, y, size, font, color });
  const rule = () => { page.drawLine({ start: { x: 56, y }, end: { x: 556, y }, thickness: 1, color: line }); };

  text("BLACKMON TUTORING", 56, 10, bold, muted); y -= 30;
  text("Electronic signature record", 56, 22, bold); y -= 20;
  text(r.title, 56, 13, reg, muted); y -= 18;
  rule(); y -= 28;

  for (const [label, value] of r.rows) {
    text(label, 56, 10, bold, muted);
    let v = latin1(String(value).slice(0, 80));
    while (v.length > 1 && reg.widthOfTextAtSize(v, 11) > 326) v = v.slice(0, -1); // keep it on the page
    text(v, 230, 11);
    y -= 22;
  }
  y -= 8; rule(); y -= 28;
  text("Agreement", 56, 12, bold); y -= 20;
  text(`[X]  ${r.agree}`, 56, 11); y -= 36;
  text("Typed signature", 56, 10, bold, muted); y -= 34;
  text(r.signature, 56, 28, script); y -= 14;
  page.drawLine({ start: { x: 56, y }, end: { x: 356, y }, thickness: 0.75, color: muted }); y -= 30;

  if (r.drawing) {
    text("Drawn signature", 56, 10, bold, muted); y -= 10;
    const img = await pdf.embedPng(r.drawing);
    const scale = Math.min(300 / img.width, 100 / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: 56, y: y - h, width: w, height: h });
    y -= h + 20;
  }
  y = 56;
  text("This page was added by the Blackmon Portal when the document was signed electronically.", 56, 8, reg, muted); y -= 11;
  text(r.footer || "The pages before it are the original document, unchanged.", 56, 8, reg, muted);

  pdf.setTitle(`${latin1(r.title)} (signed)`);
  pdf.setProducer("Blackmon Portal");
  pdf.setModificationDate(r.signedAt);
}

// A drawn signature from the sign form: a PNG data URL, at most ~300 KB. Returns a Buffer or null.
export function readDrawing(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m || m[1].length > 400_000) throw httpError(400, "Please fix the highlighted fields.", { drawing: "That drawn signature couldn't be read. Clear it and try again." });
  const buf = Buffer.from(m[1], "base64");
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw httpError(400, "Please fix the highlighted fields.", { drawing: "That drawn signature couldn't be read. Clear it and try again." });
  }
  return buf;
}

export function createDocuments({ db, store, root, base }) {
  const docsDir = path.join(root, "documents");
  const signedDir = path.join(base, "signed");
  fs.mkdirSync(signedDir, { recursive: true });
  const oppCache = new Map(); // contactId -> { at, opp }

  // Says loudly at startup if a document in documents.json has no file in app/documents/.
  for (const d of config()) {
    if (!fs.existsSync(path.join(docsDir, path.basename(d.file)))) {
      console.error(`\n  DOCUMENT FILE MISSING: "${d.title}" (id ${d.id}) expects app/documents/${d.file}. Add the file or fix content/documents.json.\n`);
    }
  }

  // Read on every use, so edits to documents.json apply without a restart.
  function config() {
    const raw = JSON.parse(fs.readFileSync(path.join(root, "content", "documents.json"), "utf8"));
    return (raw.documents || []).filter((d) => d.id && d.title && d.file && (d.type === "read" || d.type === "sign"));
  }
  const docById = (id) => config().find((d) => d.id === id) || null;
  const assignment = (contactId, docId) => db.prepare("SELECT * FROM doc_assignments WHERE contact_id = ? AND doc_id = ?").get(contactId, docId);
  const activeSignature = (assignmentId) => db.prepare("SELECT * FROM doc_signatures WHERE assignment_id = ? AND reset_at IS NULL").get(assignmentId);

  function logActivity(userName, action, target, details = "") {
    db.prepare("INSERT INTO activity_log (at, user_id, user_name, action, target, details) VALUES (?, NULL, ?, ?, ?, ?)").run(now(), userName, action, target, details);
  }

  // The contact's newest paid opportunity (see PAID_STAGES), read live from GHL, or null. Kept for
  // at most 60 seconds.
  async function paidOpportunity(contactId, force = false) {
    const hit = oppCache.get(contactId);
    if (!force && hit && Date.now() - hit.at < 60_000) return hit.opp;
    const opp = (await searchPaid(store, { contactId }))[0] || null;
    oppCache.set(contactId, { at: Date.now(), opp });
    return opp;
  }

  // Gives a paid parent every document they should have and takes the Meal Plan away again if
  // Lunch Included was turned off (never a signed document). Never duplicates. Returns doc ids.
  function syncAssignments(contactId, opp) {
    const added = [], removed = [];
    if (!opp) return { added, removed };
    const lunch = lunchIncluded(oppField(opp, OPP_FIELDS.lunch));
    for (const d of config()) {
      const wanted = !d.lunchOnly || lunch;
      if (wanted) {
        const r = db.prepare("INSERT OR IGNORE INTO doc_assignments (id, contact_id, doc_id, assigned_at) VALUES (?, ?, ?, ?)")
          .run(crypto.randomUUID(), contactId, d.id, now());
        if (r.changes) added.push(d.id);
      } else if (d.lunchOnly) {
        const row = assignment(contactId, d.id);
        if (row && !activeSignature(row.id)) { db.prepare("DELETE FROM doc_assignments WHERE id = ?").run(row.id); removed.push(d.id); }
      }
    }
    return { added, removed };
  }

  async function syncContact(contactId, { force = false } = {}) {
    const opp = await paidOpportunity(contactId, force);
    return { opp, ...syncAssignments(contactId, opp) };
  }

  // A parent's documents with status: "new" (not opened yet), "viewed", or "signed".
  function list(contactId) {
    const rows = new Map(db.prepare("SELECT * FROM doc_assignments WHERE contact_id = ?").all(contactId).map((r) => [r.doc_id, r]));
    return config().filter((d) => rows.has(d.id)).map((d) => {
      const a = rows.get(d.id);
      const sig = d.type === "sign" ? activeSignature(a.id) : null;
      return {
        id: d.id, title: d.title, type: d.type, lunchOnly: !!d.lunchOnly, assignedAt: a.assigned_at, viewedAt: a.viewed_at,
        noticeDismissed: !!a.notice_dismissed_at,
        status: sig ? "signed" : a.viewed_at ? "viewed" : "new", signedAt: sig?.signed_at || null,
        signature: sig ? { parentName: sig.parent_name, childName: sig.child_name, relationship: sig.relationship } : null,
      };
    });
  }

  // The parent removed the document's notification (x). The document stays under Documents.
  function dismissNotice(contactId, docId) {
    return db.prepare("UPDATE doc_assignments SET notice_dismissed_at = COALESCE(notice_dismissed_at, ?) WHERE contact_id = ? AND doc_id = ?").run(now(), contactId, docId).changes > 0;
  }

  function markViewed(contactId, docId) {
    db.prepare("UPDATE doc_assignments SET viewed_at = COALESCE(viewed_at, ?) WHERE contact_id = ? AND doc_id = ?").run(now(), contactId, docId);
  }

  // Path of a document's original PDF, if it's assigned to this contact.
  function originalFile(contactId, docId) {
    const d = docById(docId);
    if (!d || !assignment(contactId, docId)) return null;
    const file = path.join(docsDir, path.basename(d.file));
    if (!fs.existsSync(file)) console.error(`  DOCUMENT FILE MISSING: ${file} (document "${d.title}") was requested by contact ${contactId}.`);
    return { file, name: path.basename(d.file) };
  }

  function signedFile(contactId, docId) {
    const a = assignment(contactId, docId);
    const s = a && activeSignature(a.id);
    return s ? { file: path.join(signedDir, s.file_path), name: `${docId}-signed-${s.signed_at.slice(0, 10)}.pdf` } : null;
  }

  // ----- admin notifications (read state is per dashboard user) -----
  function notify(kind, title, { contactId = null, docId = null, signatureId = null, conversationId = null } = {}) {
    db.prepare("INSERT INTO admin_notifications (at, kind, title, contact_id, doc_id, signature_id, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(now(), kind, title, contactId, docId, signatureId, conversationId);
  }
  function notifications(userId, limit = 200) {
    return db.prepare(`SELECT n.*, r.read_at FROM admin_notifications n
      LEFT JOIN admin_notification_reads r ON r.notification_id = n.id AND r.user_id = ? ORDER BY n.id DESC LIMIT ?`).all(userId, limit)
      .map((n) => ({ id: n.id, at: n.at, kind: n.kind, title: n.title, contactId: n.contact_id, docId: n.doc_id, conversationId: n.conversation_id, read: !!n.read_at,
        ackId: n.kind === "acknowledgment_signed" ? n.signature_id : null, // camp staff training acknowledgment (lib/acknowledgment.js)
        // only link to a signed copy while that signature is still the active one
        signedActive: !!(n.signature_id && db.prepare("SELECT 1 FROM doc_signatures WHERE id = ? AND reset_at IS NULL").get(n.signature_id)) }));
  }
  const unreadCount = (userId) => db.prepare(`SELECT COUNT(*) AS n FROM admin_notifications n
    WHERE NOT EXISTS (SELECT 1 FROM admin_notification_reads r WHERE r.notification_id = n.id AND r.user_id = ?)`).get(userId).n;
  function markRead(userId, ids) {
    const all = ids === "all" ? db.prepare("SELECT id FROM admin_notifications").all().map((r) => r.id) : ids;
    const ins = db.prepare("INSERT OR IGNORE INTO admin_notification_reads (notification_id, user_id, read_at) VALUES (?, ?, ?)");
    for (const id of all) if (Number.isInteger(id)) ins.run(id, userId, now());
  }
  const markUnread = (userId, id) => db.prepare("DELETE FROM admin_notification_reads WHERE notification_id = ? AND user_id = ?").run(id, userId);

  // ----- signing -----
  async function sign(contact, docId, input, { ip, userAgent }) {
    const d = docById(docId);
    const a = assignment(contact.id, docId);
    if (!d || !a) throw httpError(404, "This document isn't in your portal.");
    if (d.type !== "sign") throw httpError(400, "This document doesn't need a signature.");
    if (activeSignature(a.id)) throw httpError(409, "You've already signed this document.");
    const { values, errors } = validateSignature(input);
    let drawing = null;
    try { drawing = readDrawing(input?.drawing); } catch (err) { Object.assign(errors, err.fields); }
    if (Object.keys(errors).length) throw httpError(400, "Please fix the highlighted fields.", errors);

    const id = crypto.randomUUID(), signedAt = new Date();
    const original = await fs.promises.readFile(path.join(docsDir, path.basename(d.file)));
    const pdf = await buildSignedPdf(original, { ...values, id, title: d.title, email: contact.email, signedAt, ip, userAgent, drawing });
    const fileName = `${id}.pdf`;
    await fs.promises.writeFile(path.join(signedDir, fileName), pdf, { flag: "wx", mode: 0o600 });
    try {
      db.prepare(`INSERT INTO doc_signatures (id, assignment_id, contact_id, doc_id, parent_name, child_name, relationship, typed_signature,
        has_drawing, ip, user_agent, signed_at, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, a.id, contact.id, docId, values.parentName, values.childName, values.relationship, values.signature,
          drawing ? 1 : 0, ip || null, String(userAgent || "").slice(0, 300), signedAt.toISOString(), fileName);
    } catch (err) {
      await fs.promises.unlink(path.join(signedDir, fileName)).catch(() => {});
      if (/UNIQUE constraint failed/.test(err.message)) throw httpError(409, "You've already signed this document.");
      throw err;
    }
    markViewed(contact.id, docId);
    notify("waiver_signed", `${values.parentName} signed the ${d.title}`, { contactId: contact.id, docId, signatureId: id });
    logActivity(values.parentName, "Signed waiver", d.title, `${contact.email} · child: ${values.childName}`);
    // A note on the GHL contact, best effort (the signed PDF itself stays in the portal).
    store.addNote(contact.id, `Signed ${d.title} on ${central(signedAt)} in the Blackmon Portal. Signed by ${values.parentName} (${values.relationship}) for ${values.childName}. The signed copy is stored in the portal admin dashboard.`)
      .catch((err) => console.error(`  Couldn't add the GHL note for ${contact.email}: ${err.message}`));
    // Every waiver signed: tell GHL (E-Sign Status only offers Not Sent / Sent / Completed). Best effort;
    // the portal itself unlocks from its own signatures, so a GHL failure doesn't block the parent.
    if (waiversSigned(contact.id)) {
      store.updateFields(contact.id, { esign_status: "Completed", docs_signed: "Yes" })
        .then(() => logActivity(values.parentName, "All waivers signed", contact.email, "GHL: E-Sign Status = Completed, Docs Signed = Yes"))
        .catch((err) => console.error(`  Couldn't set E-Sign Status for ${contact.email}: ${err.message}`));
    }
    return list(contact.id).find((x) => x.id === docId);
  }

  // Admin: lets the parent sign again. The old signature and its PDF are kept for the record.
  function reset(contactId, docId, actorName) {
    const d = docById(docId);
    const a = assignment(contactId, docId);
    const s = a && activeSignature(a.id);
    if (!d || !s) throw httpError(404, "There's no signed copy of this document to reset.");
    db.prepare("UPDATE doc_signatures SET reset_at = ?, reset_by = ? WHERE id = ?").run(now(), actorName, s.id);
    // Not every waiver is signed any more, so GHL goes back to Sent / No (best effort).
    store.updateFields(contactId, { esign_status: "Sent", docs_signed: "No" })
      .catch((err) => console.error(`  Couldn't reset E-Sign Status for contact ${contactId}: ${err.message}`));
    return { title: d.title, parentName: s.parent_name };
  }

  // The parent has waivers in the portal and has signed every one of them.
  function waiversSigned(contactId) {
    const waivers = list(contactId).filter((x) => x.type === "sign");
    return waivers.length > 0 && waivers.every((x) => x.status === "signed");
  }

  return {
    config, docById, paidOpportunity, syncAssignments, syncContact, list, dismissNotice, markViewed, originalFile, signedFile,
    sign, reset, waiversSigned, notify, notifications, unreadCount, markRead, markUnread,
  };
}
