// Admin dashboard (/admin). It has its own email + password sign-in, separate from the portal's
// email-code sign-in. Every /api/admin/* request loads the signed-in user fresh from the database
// and checks their access level here on the server, so hiding buttons in the page is never the
// only protection. Levels: owner (from .env), admin, view (view only).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PAID_SINCE, OPP_FIELDS, lunchIncluded, oppField } from "./documents.js";
import { hashPassword, verifyPassword, burnTime } from "./passwords.js";
import { createSessions } from "./sessions.js";
import { ACCESS, ID_PROOF, PHOTO, validateStaff, fileError, nameError, emailError, passwordError } from "../public/validate.js";
import { parentSteps, MEAL_FIELDS, campInclusions, yesNo } from "./portal.js";
import { ROSTER_COLUMNS as ROSTER, ROSTER_LISTS, familyRows } from "./roster.js";
import { formAnswersOf } from "./enrollform.js";
import { inAudience, afterJoin, saveJoinedAt, validateAnnouncement, ATTACHMENT } from "./announcements.js";
import { LANG_EN } from "../public/chat-i18n.js";
import { createContent } from "./content.js";
import { aiProblem } from "./aistatus.js";
import { serveVideo, AUDIENCES } from "./videos.js";

const SESSION_MS = 12 * 3600_000;
const SETUP_MS = 24 * 3600_000;
const RESET_MS = 3600_000;
const PARENTS_CACHE_MS = 60_000; // at most a minute; page loads, Refresh and Sync read GHL again anyway
// The admin's parents (Parents, parent details, Missing steps, announcements): exactly the Paid (won)
// opportunities in GHL "Winter Camp 2026", one row each, with every shown value read from the
// opportunity. (Sign-in and the parent portal still use PAID_STAGES in lib/documents.js.)
const ADMIN_PAID = { pipelineId: "eXOcuRrWabqKkb20C3KC", stageId: "ef44a5c4-5c0c-47ba-a6c7-e677aca1f0bf" };
const ROW_FIELDS = { email: "23R9W4tgFxSMraNsjro5", phone: "AOdFXJqh5maLJbccrHfS", childName: "pUYmi0vYThlJoeqi8ucX", childAge: "ifkdoMOs26DdZS1ZCuda",
  package: "jFha8u0CpPgP4GKyyffL", campPackage: OPP_FIELDS.package, packageAmount: OPP_FIELDS.packageAmount, lunch: OPP_FIELDS.lunch, sports: OPP_FIELDS.sports,
  extendedCare: "4A81muplpw733oLYkF5X", extendedCareDays: "pxQTuFSDOpXm2dW7GguO", transport: OPP_FIELDS.transport, discountCode: "nT2SuWNGyWH6E5dhWOup",
  location: "coYVcHIc7JCJTsuxbAgo" }; // opportunity.camp_location
// "$400", "400" or 400 -> 400; empty or not a number -> null.
const amountOf = (v) => { const s = String(v ?? "").replace(/[$,\s]/g, ""); return s && Number.isFinite(Number(s)) ? Number(s) : null; };

// A parent's meal plan as saved from the portal's Meal plan page (GHL contact fields).
const mealsOf = (choices) => MEAL_FIELDS.map((m) => ({ meal: m.label, choice: choices[m.key] || "", request: m.request ? choices[m.request] || "" : "" }));
// CSV that Excel opens correctly (UTF-8 mark, every cell quoted).
const csv = (rows) => "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
const MEAL_COLUMNS = MEAL_FIELDS.flatMap((m) => (m.request ? [m.label, `${m.label} special request`] : [m.label]));
const mealCells = (choices) => MEAL_FIELDS.flatMap((m) => (m.request ? [choices[m.key], choices[m.request]] : [choices[m.key]]));
const fileDate = () => new Date().toISOString().slice(0, 10);

// One Parents row from an opportunity. Empty values stay "" (shown as "—"), never "No" or 0.
// Package: the Package field, else the Camp Package text before " - " (website payments leave Package
// empty: "Standard - Weekly (5 days) - $250" -> "Standard"). totalPaid: the opportunity's value.
function oppRow(o) {
  const text = (id) => String(oppField(o, id) ?? "").trim();
  const campPackage = text(ROW_FIELDS.campPackage), lunchRaw = text(ROW_FIELDS.lunch);
  const name = o.contactName || o.name || "";
  return {
    opportunityId: o.id, contactId: o.contactId, name, firstName: name.split(/\s+/)[0] || "",
    // Overwritten from the GHL contact in paidParents (contactDetails); these are only the fallback.
    email: o.contactEmail || text(ROW_FIELDS.email), phone: o.contactPhone || text(ROW_FIELDS.phone),
    childName: text(ROW_FIELDS.childName), childAge: text(ROW_FIELDS.childAge),
    package: text(ROW_FIELDS.package) || campPackage.split(" - ")[0].trim(), campPackage,
    totalPaid: o.value == null || o.value === "" ? null : Number(o.value),
    packageAmount: amountOf(oppField(o, ROW_FIELDS.packageAmount)) ?? (o.value > 0 ? o.value : null) ?? amountOf(/\$\s*([\d,]+(?:\.\d+)?)/.exec(campPackage)?.[1]),
    lunch: lunchIncluded(lunchRaw) ? "Yes" : /^(no|n|false)$/i.test(lunchRaw) ? "No" : lunchRaw,
    lunchRaw, sportsRaw: text(ROW_FIELDS.sports),
    extendedCare: text(ROW_FIELDS.extendedCare), extendedCareDays: amountOf(oppField(o, ROW_FIELDS.extendedCareDays)),
    transport: text(ROW_FIELDS.transport), discountCode: text(ROW_FIELDS.discountCode),
    location: text(ROW_FIELDS.location),
    createdAt: o.createdAt, updatedAt: o.updatedAt, stageChangedAt: o.stageChangedAt,
  };
}
// "Early care (7:00–9:00 AM)" + 6 days -> "Early care · 6 days"; empty or "None" -> "".
function careLabel(care, days) {
  const name = String(care || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (!name || /^none$/i.test(name)) return "";
  return days > 0 ? `${name} · ${days} day${days === 1 ? "" : "s"}` : name;
}
// Name, email and phone always come from the GHL contact (GET /contacts/{id}, read fresh); the row's
// values (the opportunity's contact, then its Email / Phone Number fields) only fill what the contact
// leaves empty.
function contactDetails(row, c) {
  if (!c) return row;
  const name = [c.firstName, c.lastName].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
  return { ...row, name: name || row.name, firstName: String(c.firstName || "").trim() || row.firstName,
    email: String(c.email || "").trim() || row.email, phone: String(c.phone || "").trim() || row.phone };
}
const LEVEL_NAMES = { owner: "Owner", admin: "Admin", view: "View only" };
const DEMO_PASSWORD = "demo-pass-123";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const now = () => new Date().toISOString();
// A plain-text version of an email's HTML: paragraphs and list items on their own lines, links as
// "label: url" (or just the url when the label is the url).
function htmlToText(html) {
  const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return decode(html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => {
      const l = label.replace(/<[^>]+>/g, "").trim();
      return /^tel:/i.test(href) || l === href ? l : `${l}: ${href}`;
    })
    .replace(/<li[^>]*>/gi, "\n- ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|ol|ul|tr|table|h\d)>/gi, "\n\n")
    .replace(/<[^>]+>/g, ""))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n\n(?=- )/g, "\n").trim();
}
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const httpError = (status, message, fields) => Object.assign(new Error(message), { httpStatus: status, fields });
const fullName = (r) => `${r.first_name} ${r.last_name}`.trim();
const num = (v) => (v !== null && v !== undefined && String(v).trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);

// Identifies an upload from its first bytes; the name and declared type can be faked.
function sniff(buf) {
  const starts = (bytes) => bytes.every((b, i) => buf[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

// Runs fn over items, at most `limit` at a time (keeps GHL from rate-limiting a long list).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// Turns a failed GHL email send into a message an admin can act on.
function emailFailure(err, email) {
  const status = err.status || 502;
  const code = err.body?.canonicalCode;
  const ghlMessage = err.body?.message || err.message;
  let reason;
  if (code === "CONVERSATIONS_MSG_INVALID_EMAIL") reason = `GHL won't email ${email}: it says this contact's email address is invalid (it failed GHL's email check). Use a real, working address for this person, then click “Resend setup link”.`;
  else if (status === 401 || status === 403) reason = `GHL refused to send email (${status}). Your Private Integration token needs the “Edit Conversation Messages” scope (conversations/message.write); add it in GHL → Settings → Private Integrations.`;
  else reason = `GHL couldn't send the email (${status}): ${ghlMessage}`;
  return httpError(502, reason);
}

// db / base: the portal database and data folder (server.js keeps demo data separate from live).
// docs: camp documents and notifications (lib/documents.js).
export function createAdmin({ store, db, meals, enrollForm, campFile, clientIp = (req) => req.socket.remoteAddress || "", enrollments, enrollmentSettings, base, docs, oppSync, assistant, announcements, outreach, videos, assessment, acks, root, portalUrl, printLinks = false, send, readBody, readJson }) {
  const demo = !store.live;
  const proofsDir = path.join(base, "id-proofs"), photosDir = path.join(base, "photos");
  fs.mkdirSync(proofsDir, { recursive: true });
  fs.mkdirSync(photosDir, { recursive: true });
  const secureCookie = /^https:/i.test(portalUrl);

  const sessions = createSessions(db, "admin"); // in the database, so a restart keeps admins signed in
  const failures = new Map(); // "ip:..." / "email:..." -> [failed login timestamps]
  const resets = new Map();   // "ip:..." / "email:..." -> [forgot-password request timestamps]
  let parentsCache = { at: 0, list: null };

  // ---------- small DB helpers ----------
  const userById = (id) => db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id);
  const userByEmail = (email) => db.prepare("SELECT * FROM admin_users WHERE email = ?").get(String(email || "").toLowerCase());
  const userByStaff = (staffId) => db.prepare("SELECT * FROM admin_users WHERE staff_id = ?").get(staffId);
  const staffById = (id) => db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
  const adminCount = () => db.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE level IN ('owner', 'admin')").get().n;
  const canManage = (u) => u.level === "owner" || u.level === "admin";
  const content = createContent(root, campFile);

  function log(actor, action, target, details = "") {
    db.prepare("INSERT INTO activity_log (at, user_id, user_name, action, target, details) VALUES (?, ?, ?, ?, ?, ?)")
      .run(now(), actor?.id || null, actor ? fullName(actor) || actor.email : "System", action, target, details);
  }

  function killSessions(userId, exceptSid = "") {
    sessions.removeFor(userId, exceptSid);
  }

  const removeFile = (dir, name) => name && fs.promises.unlink(path.join(dir, name)).catch((err) => {
    if (err.code !== "ENOENT") console.error(`  Could not delete ${name}: ${err.message}`);
  });

  // Emails are HTML files in emails/. The subject is the first line's comment; other comments are
  // notes for whoever edits the wording and are stripped before sending.
  // { subject, html, text }: text is a plain-text version of the HTML (links as "label: url").
  function renderEmail(file, vars) {
    const raw = fs.readFileSync(path.join(root, "emails", file), "utf8");
    const subject = /<!--\s*Subject:\s*(.+?)\s*-->/.exec(raw)?.[1] || "Blackmon Tutoring";
    const html = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? escapeHtml(vars[k]) : m)).trim();
    return { subject, html, text: htmlToText(html) };
  }

  // ---------- sessions + rate limiting ----------
  function cookie(sid, maxAgeSec) {
    return `bt_admin=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secureCookie ? "; Secure" : ""}`;
  }
  function startSession(userId) {
    const sid = sessions.create(userId, SESSION_MS);
    return cookie(sid, SESSION_MS / 1000);
  }
  // The signed-in user, loaded fresh from the database (so access changes apply on the next request).
  function current(req) {
    const m = /(?:^|;\s*)bt_admin=([a-f0-9]{64})/.exec(req.headers.cookie || "");
    const s = m && sessions.get(m[1]);
    if (!s) return null;
    const user = userById(s.subject);
    if (!user || !user.password_hash) { sessions.remove(m[1]); return null; }
    return { sid: m[1], user };
  }

  const LIMITS = { ip: 20, email: 5 };
  const WINDOW = 15 * 60_000;
  const recent = (key) => (failures.get(key) || []).filter((t) => Date.now() - t < WINDOW);
  const locked = (ip, email) => recent(`ip:${ip}`).length >= LIMITS.ip || recent(`email:${email}`).length >= LIMITS.email;
  function noteFailure(ip, email) {
    for (const key of [`ip:${ip}`, `email:${email}`]) failures.set(key, [...recent(key), Date.now()]);
  }

  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // same-origin fetches from older browsers, and curl
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  }

  const SETUP_EXPIRED = "This setup link has expired or was already used. Ask an admin to send a new one.";
  function setupUser(token) {
    if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return null;
    const user = db.prepare("SELECT * FROM admin_users WHERE setup_token_hash = ?").get(sha(token));
    return user && user.setup_expires_at >= Date.now() ? user : null;
  }

  // ---------- serializing for the page ----------
  function publicUser(u) {
    return {
      id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, level: u.level, levelName: LEVEL_NAMES[u.level],
      canManage: canManage(u), mustChangePassword: !!u.must_change_password, linkedStaff: !!u.staff_id,
      photoUrl: u.photo_path ? `/api/admin/users/${u.id}/photo?v=${encodeURIComponent(u.updated_at)}` : null,
    };
  }
  function publicStaff(s, actor) {
    const login = userByStaff(s.id);
    return {
      id: s.id, firstName: s.first_name, lastName: s.last_name, gender: s.gender, email: s.email, phone: s.phone,
      role: s.role, location: s.location, idProofFileName: s.id_proof_file_name,
      access: login?.level || "none", setupPending: !!login && !login.password_hash, isSelf: !!login && login.id === actor.id,
      updatedAt: s.updated_at,
    };
  }

  // ---------- forms ----------
  async function readForm(req, limit, fileField, tooBig) {
    const type = String(req.headers["content-type"] || "");
    if (!type.startsWith("multipart/form-data")) throw httpError(400, "Please send the form as multipart/form-data.");
    if (Number(req.headers["content-length"]) > limit) throw httpError(413, tooBig, { [fileField]: tooBig });
    try {
      return await new Response(await readBody(req, limit), { headers: { "content-type": type } }).formData();
    } catch (err) {
      if (err.status === 413) throw httpError(413, tooBig, { [fileField]: tooBig });
      throw httpError(400, "We couldn't read that form. Please try again.");
    }
  }
  // Returns { error } or { file: { buffer, mime, name } | null } for one upload field.
  async function readUpload(form, field, rules, required) {
    const v = form.get(field);
    const blob = v && typeof v !== "string" && v.size ? v : null;
    const err = fileError(blob, rules, { required });
    if (err) return { error: err };
    if (!blob) return { file: null };
    const buffer = Buffer.from(await blob.arrayBuffer());
    const mime = sniff(buffer);
    const ext = blob.name.split(".").pop().toLowerCase().replace("jpeg", "jpg");
    if (!mime || !rules.types[mime]) return { error: `That file isn't a real ${rules.label} file.` };
    if (rules.types[mime] !== ext) return { error: `That file's contents don't match its .${ext} name.` };
    return { file: { buffer, mime, name: blob.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) } };
  }
  async function saveFile(dir, file, ext) {
    const name = `${crypto.randomUUID()}.${ext}`;
    await fs.promises.writeFile(path.join(dir, name), file.buffer, { flag: "wx", mode: 0o600 });
    return name;
  }

  // ---------- GHL ----------
  // Creates or updates the staff member's GHL contact so they can sign in to the staff/tutor portal.
  // A contact that's already a Parent is never turned into staff.
  async function syncStaffToGhl(v, contactId) {
    let contact = contactId ? await store.getContact(contactId).catch(() => null) : null;
    if (!contact) contact = await store.findByEmail(v.email);
    if (contact?.fields?.portal__role === "Parent") {
      throw httpError(409, "This email belongs to a parent in the portal. Use a different email for this staff member.", { email: "This email belongs to a parent in the portal." });
    }
    const fields = { portal__role: v.role, portal__location: v.location, portal__access_granted: "Yes", portal__jordan_approved: "Yes" };
    try {
      if (contact) {
        await store.updateContact(contact.id, { firstName: v.firstName, lastName: v.lastName, phone: v.phone, email: v.email }, fields);
        return contact.id;
      }
      return (await store.createContact(v.email, fields, [], { firstName: v.firstName, lastName: v.lastName, phone: v.phone })).id;
    } catch (err) {
      if (err.status === 400 || err.status === 422) throw httpError(409, "GHL didn't accept these details (the email or phone may already be on another contact).");
      throw err;
    }
  }

  // Emails a one-time password setup link. Sent exactly like the portal's sign-in code email
  // (store.sendEmail: GHL Conversations, by contact ID), after making sure the contact exists.
  async function sendSetupLink(login, staff) {
    const contactId = await syncStaffToGhl({
      firstName: staff.first_name, lastName: staff.last_name, phone: staff.phone, email: staff.email, role: staff.role, location: staff.location,
    }, staff.ghl_contact_id);
    if (contactId !== staff.ghl_contact_id) db.prepare("UPDATE staff SET ghl_contact_id = ? WHERE id = ?").run(contactId, staff.id);
    const contact = await store.getContact(contactId);

    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("UPDATE admin_users SET setup_token_hash = ?, setup_expires_at = ?, updated_at = ? WHERE id = ?")
      .run(sha(token), Date.now() + SETUP_MS, now(), login.id);
    const setupUrl = `${portalUrl}/admin/setup?token=${token}`;
    if (printLinks) console.log(`\n  Dashboard setup link for ${staff.email} (${LEVEL_NAMES[login.level]}), valid 24 hours:\n  ${setupUrl}\n  (printed because DEV_PRINT_CODES=1)\n`);
    const { subject, html } = renderEmail("admin-setup.html", {
      first_name: staff.first_name, access: LEVEL_NAMES[login.level], setup_url: setupUrl, admin_url: `${portalUrl}/admin`,
    });
    try {
      await store.sendEmail(contact, subject, html);
    } catch (err) {
      throw emailFailure(err, staff.email);
    }
  }

  // An admin sets (or replaces) someone's dashboard password. It's stored hashed only; they're
  // asked to change it at their next sign-in, and any sessions they have are ended.
  async function setLoginPassword(actor, login, staff, password) {
    db.prepare(`UPDATE admin_users SET password_hash = ?, must_change_password = 1, setup_token_hash = NULL, setup_expires_at = NULL,
      updated_at = ? WHERE id = ?`).run(await hashPassword(password), now(), login.id);
    killSessions(login.id);
    log(actor, login.password_hash ? "Changed dashboard password" : "Set dashboard password", fullName(staff), `by ${fullName(actor) || actor.email}`);
  }

  // Forgot password. Uses the person's existing GHL contact (it never creates one); without a
  // contact the link can only be printed (DEV_PRINT_CODES=1).
  async function sendResetLink(user) {
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("UPDATE admin_users SET setup_token_hash = ?, setup_expires_at = ?, updated_at = ? WHERE id = ?")
      .run(sha(token), Date.now() + RESET_MS, now(), user.id);
    const resetUrl = `${portalUrl}/admin/setup?token=${token}`;
    if (printLinks) console.log(`\n  Password reset link for ${user.email}, valid 1 hour:\n  ${resetUrl}\n  (printed because DEV_PRINT_CODES=1)\n`);
    const st = user.staff_id && staffById(user.staff_id);
    const contact = (st?.ghl_contact_id && await store.getContact(st.ghl_contact_id).catch(() => null)) || await store.findByEmail(user.email);
    if (!contact) throw new Error("no GHL contact with this email, so the link can't be emailed");
    const { subject, html } = renderEmail("admin-reset.html", { first_name: user.first_name || "there", reset_url: resetUrl, admin_url: `${portalUrl}/admin` });
    try { await store.sendEmail(contact, subject, html); }
    catch (err) { throw emailFailure(err, user.email); }
  }

  // Grants, changes or removes a staff member's dashboard access. With `password`, the admin sets
  // their password directly (no email needed); without it, a new login gets an emailed setup link.
  // Returns a warning string if that setup email couldn't be sent (access is still granted).
  async function setAccess(actor, staff, level, { password } = {}) {
    const login = userByStaff(staff.id);
    const from = login?.level || "none";
    if (from === level) {
      if (password && login) await setLoginPassword(actor, login, staff, password);
      return null;
    }
    if (login && login.id === actor.id) throw httpError(403, "You can't change your own dashboard access.");
    if (from === "owner") throw httpError(403, "The Owner's access can't be changed.");
    if ((from === "admin" || from === "owner") && level !== "admin" && adminCount() <= 1) throw httpError(409, "There must always be at least one admin.");

    let warning = null;
    if (level === "none") {
      db.prepare("DELETE FROM admin_users WHERE id = ?").run(login.id);
      killSessions(login.id);
      await removeFile(photosDir, login.photo_path);
    } else if (!login) {
      const clash = userByEmail(staff.email);
      if (clash) throw httpError(409, "Another dashboard user already signs in with this email.");
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO admin_users (id, email, first_name, last_name, level, staff_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, staff.email, staff.first_name, staff.last_name, level, staff.id, now(), now());
      if (password) await setLoginPassword(actor, userById(id), staff, password);
      else try { await sendSetupLink(userById(id), staff); }
      catch (err) {
        console.error(`  Setup email to ${staff.email} failed: ${err.message}`);
        warning = `Access granted, but the setup email couldn't be sent. ${err.httpStatus ? err.message : "Please try “Resend setup link”."}`;
      }
    } else {
      db.prepare("UPDATE admin_users SET level = ?, updated_at = ? WHERE id = ?").run(level, now(), login.id);
      killSessions(login.id);
      if (password) await setLoginPassword(actor, userById(login.id), staff, password);
    }
    log(actor, "Changed dashboard access", fullName(staff), `${ACCESS[from] || LEVEL_NAMES[from]} → ${ACCESS[level]}`);
    return warning;
  }

  // ---------- parents ----------
  async function paidParents(force = false) {
    if (!force && parentsCache.list && Date.now() - parentsCache.at < PARENTS_CACHE_MS) return parentsCache.list;
    let opps, oppDefs;
    try {
      [opps, oppDefs] = await Promise.all([store.searchOpportunities(ADMIN_PAID), store.fieldDefinitions("opportunity")]);
    } catch (err) {
      console.error(`  Admin parents: GHL opportunity search failed: ${err.message}`);
      throw httpError(502, `Couldn't load the Winter Camp 2026 Paid (won) opportunities from GHL: ${err.message}`);
    }
    opps.sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0));
    const oppOf = new Map(); // contact -> their newest of these opportunities (documents, invites)
    for (const o of opps) if (!oppOf.has(o.contactId)) oppOf.set(o.contactId, o);
    // When each became a parent: their earliest of these opportunities' createdAt (backfills joined_at).
    const created = new Map();
    for (const o of opps) created.set(o.contactId, [...(created.get(o.contactId) || []), o.createdAt]);
    const joinedAt = new Map([...created].map(([id, dates]) => [id, saveJoinedAt(db, id, dates)]));
    // Each contact is read fresh: name, email and phone come from it (contactDetails), plus portal
    // status (Role, Access Granted, E-Sign Status), the Missing steps checks and invites.
    const contacts = new Map((await mapLimit([...oppOf.keys()], 5, (id) => store.getContact(id).catch((err) => {
      console.error(`  Admin parents: couldn't load contact ${id}: ${err.message}`);
      return null;
    }))).filter(Boolean).map((c) => [c.id, c]));
    const list = buildRows(opps, contacts, joinedAt);
    parentsCache = { at: Date.now(), list, opps: oppOf, contacts };
    return list;
  }

  // The Parents rows for these (live) opportunities. contacts: contactId -> GHL contact (read fresh);
  // joinedAt: contactId -> when they became a parent.
  function buildRows(opps, contacts, joinedAt) {
    // Sports Included: GHL's value is saved per opportunity; when GHL's is empty the saved one is used.
    const savedSports = new Map(db.prepare("SELECT opportunity_id, sports FROM opportunity_sports").all().map((r) => [r.opportunity_id, r.sports]));
    const keepSports = db.prepare(`INSERT INTO opportunity_sports (opportunity_id, contact_id, sports, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (opportunity_id) DO UPDATE SET sports = excluded.sports, contact_id = excluded.contact_id, updated_at = excluded.updated_at WHERE sports != excluded.sports`);
    // Extended Care, its days, Transportation and Discount Code: the same, field by field.
    const savedExtras = new Map(db.prepare("SELECT * FROM opportunity_extras").all().map((r) => [r.opportunity_id, r]));
    const keepExtras = db.prepare(`INSERT INTO opportunity_extras (opportunity_id, contact_id, extended_care, extended_care_days, transportation, discount_code, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (opportunity_id) DO UPDATE SET contact_id = excluded.contact_id,
      extended_care = COALESCE(excluded.extended_care, extended_care), extended_care_days = COALESCE(excluded.extended_care_days, extended_care_days),
      transportation = COALESCE(excluded.transportation, transportation), discount_code = COALESCE(excluded.discount_code, discount_code),
      updated_at = excluded.updated_at`);
    return opps.map((o) => {
      const c = contacts.get(o.contactId), row = contactDetails(oppRow(o), c);
      // Location: the opportunity's Camp Location, else the contact's WC26 - Camp Location, else Portal - Location.
      row.location ||= String(c?.fields.wc26__camp_location || c?.fields.portal__location || "").trim();
      const was = savedExtras.get(o.id) || {}, orNull = (v) => (v === "" || v == null ? null : v);
      const fresh = [orNull(row.extendedCare), row.extendedCareDays ?? null, orNull(row.transport), orNull(row.discountCode)];
      if (fresh.some((v) => v != null)) keepExtras.run(o.id, o.contactId, ...fresh, now());
      row.extendedCare ||= was.extended_care || ""; row.extendedCareDays ??= was.extended_care_days ?? null;
      row.transport ||= was.transportation || ""; row.discountCode ||= was.discount_code || "";
      const fromGhl = yesNo(row.sportsRaw);
      if (fromGhl) keepSports.run(o.id, o.contactId, fromGhl, now());
      const tier = row.package || /^\s*(Premium|Standard|Basic)\b/i.exec(row.campPackage)?.[1] || "";
      const inc = campInclusions(tier, row.lunchRaw, fromGhl || savedSports.get(o.id) || "");
      return {
        ...row,
        lunch: inc.pending ? "Pending enrollment form" : row.lunch,
        sports: inc.pending ? "Pending enrollment form" : inc.sports || "",
        extendedCareLabel: careLabel(row.extendedCare, row.extendedCareDays),
        transport: /^(none|no|0)$/i.test(row.transport) ? "" : row.transport,
        enrollFormMissing: inc.formMissing,
        role: c?.fields.portal__role || "", accessGranted: c?.fields.portal__access_granted || "",
        esign: !c ? "" : c.fields.esign_status === "Completed" || c.fields.docs_signed === "Yes" ? "Completed" : c.fields.esign_status || "Not Sent",
        // Which announcements the parent sees in their portal follows their portal location, so
        // location announcements are matched on it. Not shown in any list.
        portalLocation: c?.fields.portal__location || "",
        joinedAt: joinedAt.get(o.contactId) || null,
        ...mealPlanOf(c || { id: o.contactId }, inc.pending ? "pending" : row.lunch, tier),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Gives every paid parent their documents (and adds/removes the Meal Plan as Lunch Included changes).
  async function syncAllDocuments(force) {
    const list = await paidParents(force);
    let added = 0, removed = 0;
    for (const p of list) {
      const r = docs.syncAssignments(p.contactId, parentsCache.opps.get(p.contactId));
      added += r.added.length; removed += r.removed.length;
    }
    return { parents: list.length, added, removed };
  }

  // Document status counts for the Parents list.
  function docSummary(contactId) {
    const list = docs.list(contactId);
    const waivers = list.filter((d) => d.type === "sign");
    return { total: list.length, waivers: waivers.length, signed: waivers.filter((d) => d.status === "signed").length, unopened: list.filter((d) => d.status === "new").length };
  }

  // One parent's Winter Camp 2026 Paid (won) opportunities (the same fields as the Parents list,
  // plus the opportunity's other custom fields), their portal status and their documents.
  // A contact with their enrollment form answers: its own contact.wc26__ fields, or, when it has none,
  // the answers of the latest form submission with its email (GHL may have saved that submission on
  // a second contact with the same email). sub: that submission, if known.
  async function withFormAnswers(contact, sub) {
    if (!contact) return { contact, source: null };
    if (Object.keys(formAnswersOf(contact.fields)).length) return { contact, source: "contact" };
    const answers = sub ? await enrollForm.answersOf(sub) : {};
    if (!Object.keys(answers).length) return { contact, source: null };
    return { contact: { ...contact, fields: { ...contact.fields, ...answers } }, source: "submission" };
  }

  // Read live every time the page opens (and on "Reload from GHL"): this parent's Winter Camp 2026
  // Paid (won) opportunities (GET /opportunities/{id}) and their contact (GET /contacts/{id}).
  async function parentDetail(id) {
    let opps, fresh, oppDefs;
    try {
      [opps, fresh, oppDefs] = await Promise.all([store.searchOpportunities({ ...ADMIN_PAID, contactId: id }), store.getContact(id), store.fieldDefinitions("opportunity")]);
    } catch (err) {
      console.error(`  Parent detail ${id}: GHL read failed: ${err.message}`);
      throw httpError(502, `Couldn't load this parent from GHL: ${err.message}`);
    }
    if (!opps.length) throw httpError(404, "This contact has no Paid (won) opportunity in Winter Camp 2026.");
    opps.sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0));
    const syncedAt = now();
    const rows = buildRows(opps, new Map([[id, fresh]]), new Map([[id, saveJoinedAt(db, id, opps.map((o) => o.createdAt))]]));
    // Keep the Parents list's copy of this parent current too.
    if (parentsCache.list) {
      parentsCache.contacts.set(id, fresh); parentsCache.opps.set(id, opps[0]);
      parentsCache.list = [...parentsCache.list.filter((x) => x.contactId !== id), ...rows].sort((a, b) => a.name.localeCompare(b.name));
    }
    const shown = new Set(Object.values(ROW_FIELDS));
    const other = (o) => oppDefs.filter((d) => !shown.has(d.id)).map((d) => ({ name: d.name, value: String(oppField(o, d.id) ?? "").trim() }))
      .filter((f) => f.value).sort((a, b) => a.name.localeCompare(b.name));
    const state = parentState(id), invites = inviteState().byContact.get(id);
    // The meal plan is saved in the portal (lib/meals.js), so it shows as soon as the parent saves it.
    const plan = meals.of(fresh || { id });
    // The GHL enrollment form: submitted (tag or a submission with their email) and the answers, as
    // on the Roster (one row per child).
    const sub = await enrollForm.latestFor(fresh?.email).catch(() => null);
    const { contact: answered, source } = await withFormAnswers(fresh, sub);
    const submitted = !!sub || (fresh?.tags || []).includes("enrollment-submitted") || source === "contact";
    return {
      enrollment: submitted ? { camp: "Winter Camp 2026", submittedAt: sub?.createdAt || null, source, columns: ROSTER,
        children: source ? familyRows(rows[0], answered) : [] } : null,
      syncedAt,
      parent: { ...rows[0], inviteSentAt: state?.invite_sent_at || null, inviteTestAt: state?.test_invite_at || null, hidden: !!state?.hidden_at,
        inviteCount: invites?.count || (state?.invite_sent_at ? 1 : 0), inviteMessageId: invites?.last?.message_id || null,
        inviteSms: invites?.last?.sms_status || null, inviteSmsNote: invites?.last?.sms_note || null },
      meals: mealsOf(plan.choices), mealsSavedAt: plan.savedAt, mealsSource: plan.source,
      opportunities: rows.map((r) => ({ ...r, otherFields: other(opps.find((o) => o.id === r.opportunityId)) })),
      documents: docs.list(id),
    };
  }
  const parentState = (id) => db.prepare("SELECT * FROM parent_access WHERE contact_id = ?").get(id);
  function upsertParent(id, cols) {
    const row = { invite_sent_at: null, hidden_at: null, test_invite_at: null, ...parentState(id), ...cols };
    db.prepare(`INSERT INTO parent_access (contact_id, invite_sent_at, hidden_at, test_invite_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (contact_id) DO UPDATE SET invite_sent_at = excluded.invite_sent_at, hidden_at = excluded.hidden_at,
        test_invite_at = excluded.test_invite_at, updated_at = excluded.updated_at`)
      .run(id, row.invite_sent_at, row.hidden_at, row.test_invite_at, now());
  }
  // A parent the admin may act on: in the paid list (re-checked against GHL if not cached) and not removed.
  async function findParent(id) {
    const p = (await paidParents()).find((x) => x.contactId === id) || (await paidParents(true)).find((x) => x.contactId === id);
    if (!p || parentState(id)?.hidden_at) throw httpError(404, "This parent isn't in the Winter Camp 2026 paid list.");
    return p;
  }

  // ---------- messages to parents (lib/outreach.js) ----------
  // Paid parents still in the portal (not removed by an admin).
  // One entry per family (a contact with two of these opportunities is messaged once).
  async function activeParents(force = false) {
    const list = await paidParents(force);
    const hidden = new Set(db.prepare("SELECT contact_id FROM parent_access WHERE hidden_at IS NOT NULL").all().map((r) => r.contact_id));
    const seen = new Set();
    return list.filter((p) => !hidden.has(p.contactId) && !seen.has(p.contactId) && seen.add(p.contactId));
  }
  // Announcements to one location go to the families whose portal shows that location.
  // Emails / SMS follow the portal: only parents who had joined when it's sent (a: the announcement).
  const inAudienceOf = (audience, p, a = null) => inAudience(audience, { ...p, location: p.portalLocation })
    && afterJoin({ sent_at: a?.sent_at || new Date().toISOString() }, p);

  // The Parents "Meal plan" column: the plan the parent saved on the portal's Meal plan page (lib/meals.js,
  // the same source as "Export meal plans"). lunch: the row's Lunch ("Yes" / "No" / "" / "pending").
  // Premium includes lunch, so an empty Lunch Included counts as lunch there; Basic never has lunch.
  // mealState: "submitted" | "missing" (lunch, no plan) | "pending" (Standard, no enrollment form) | "none" (no lunch).
  function mealPlanOf(contact, lunch, tier) {
    const plan = meals.of(contact);
    const lunchIncluded = lunch === "Yes" || (!lunch && /^premium$/i.test(tier));
    const items = mealsOf(plan.choices).filter((x) => x.choice || x.request);
    const mealState = plan.source ? "submitted" : lunch === "pending" ? "pending" : lunchIncluded ? "missing" : "none";
    return { lunchIncluded, mealState, mealSavedAt: plan.savedAt, mealItems: items };
  }

  // A Standard family that hasn't answered lunch / sports yet hasn't submitted the enrollment form.
  const withForm = (steps, p) => (p.enrollFormMissing ? { ...steps, enroll: false } : steps);

  // A parent's row on the Missing steps page.
  function followup(p, contact, reminded) {
    return {
      contactId: p.contactId, name: p.name, firstName: p.firstName, email: p.email, phone: p.phone, location: p.location, lunch: p.lunch,
      childName: p.childName, language: outreach.languageOf(p.contactId),
      // The checks themselves (enrollment form sent, meals chosen) are portal status on the contact.
      steps: withForm(parentSteps(contact || { fields: {}, tags: [] }, { lunch: p.lunchIncluded, waivers: docSummary(p.contactId), meal: p.mealState === "submitted" }), p),
      lastReminded: reminded.get(p.contactId) || null,
    };
  }

  // Sends one announcement (now, or when its scheduled time comes): portal for everyone in the
  // audience, plus email / SMS in each parent's language.
  const sending = new Set();
  async function publish(id, actor = null) {
    if (sending.has(id) || !announcements.claim(id)) return null;
    sending.add(id);
    try {
      const a = announcements.get(id);
      const parents = (await activeParents(true)).filter((p) => inAudienceOf(a.audience, p, a)); // current email / phone
      const langs = [...new Set(["en", ...parents.map((p) => outreach.languageOf(p.contactId))])];
      const translations = {};
      for (const lang of langs) {
        try { translations[lang] = await outreach.announcementIn(lang, a.title, a.body); }
        catch (err) { console.error(`  Announcement ${id}: ${LANG_EN[lang]} translation failed (${err.message}); sending English.`); }
      }
      announcements.saveTranslations(id, translations);
      const summary = { recipients: parents.length, email: 0, sms: 0, failed: 0, skipped: 0, live: outreach.live };
      const channels = a.channels.filter((c) => c !== "portal");
      const files = announcements.fileCount(id);
      if (channels.length) {
        await mapLimit(parents, 3, async (p) => {
          const lang = translations[outreach.languageOf(p.contactId)] ? outreach.languageOf(p.contactId) : "en";
          const r = await outreach.deliver(p, lang, outreach.announcementEmail(lang, translations[lang] || { title: a.title, body: a.body, sms: `Blackmon Tutoring: ${a.title}` }, files), channels, { kind: "announcement", ref: id });
          for (const [ch, st] of Object.entries(r)) { if (st === "sent") summary[ch]++; else summary[st]++; }
        });
      }
      announcements.saveSummary(id, summary);
      log(actor, a.send_at && !actor ? "Sent scheduled announcement" : "Sent announcement", a.title,
        `${parents.length} ${parents.length === 1 ? "family" : "families"}${channels.length ? ` · ${summary.email} emails, ${summary.sms} texts${summary.failed ? `, ${summary.failed} failed` : ""}${outreach.live ? "" : " (test mode)"}` : " · portal only"}`);
      return summary;
    } finally { sending.delete(id); }
  }
  // ---------- portal invites ----------
  // Sends "Your Blackmon Portal is ready" to the parent's own email (the one on their GHL contact),
  // whatever PARENT_MESSAGES is: invites are never redirected to a test inbox. Sets their Portal - Role
  // and Access Granted, and records invite_sent_at. how: "manual" (admin button) or "automatic".
  async function invite(contact, how = "manual") {
    // Until the portal is hosted, PORTAL_URL is localhost: the invite still goes to the parent (as asked),
    // but its link only opens on this computer. In production (NODE_ENV=production) that's refused.
    if (!/^https:\/\//.test(portalUrl)) {
      if (process.env.NODE_ENV === "production" && /^http:\/\/localhost/i.test(portalUrl))
        throw httpError(409, `PORTAL_URL is ${portalUrl}. Invites aren't sent with a localhost link in production: set PORTAL_URL to the portal's https address.`);
      console.log(`  Invite: WARNING, ${contact.email} gets a link to ${portalUrl}, which they can't open. Set PORTAL_URL to the portal's https address.`);
    }
    const { subject, html, text } = renderEmail("portal-ready.html", { first_name: contact.firstName || "there", email: contact.email, portal_url: portalUrl });
    await store.updateFields(contact.id, { portal__role: "Parent", portal__access_granted: "Yes" });
    const sent = await store.sendEmail(contact, subject, html, text);
    const at = now();
    upsertParent(contact.id, { invite_sent_at: at });
    console.log(`  Invite: SENT to ${contact.email} at ${at} (${how}; GHL message id ${sent?.messageId || "not returned"}; link ${portalUrl}).`);
    const sms = await inviteSms(contact);
    db.prepare("INSERT INTO invite_log (contact_id, email, message_id, how, sent_at, sms_status, sms_message_id, sms_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(contact.id, String(contact.email || "").toLowerCase(), sent?.messageId || null, how, at, sms.status, sms.messageId || null, sms.note || null);
    return "parent";
  }

  // The text sent with the invite, to the same GHL contact. Only when they have a phone and haven't
  // opted out of SMS (DND); with PARENT_MESSAGES=test it goes to the test phone (ADMIN_ALERT_PHONE)
  // instead. Never throws. Returns { status: sent | test | skipped | failed, messageId, note }.
  async function inviteSms(contact) {
    let raw;
    try { raw = await store.getContactRaw(contact.id); }
    catch (err) { console.error(`  Invite SMS: FAILED for ${contact.email}: couldn't read the contact (${err.message}).`); return { status: "failed", note: err.message }; }
    const skipped = (note) => { console.log(`  Invite SMS: SMS skipped for ${contact.email}: ${note}.`); return { status: "skipped", note }; };
    if (!String(raw?.phone || "").trim()) return skipped("no phone number on the GHL contact");
    if (raw.dnd === true || raw.dndSettings?.SMS?.status === "active") return skipped("the contact has opted out of SMS (DND)");
    const message = `Hi ${contact.firstName || raw.firstName || "there"}, thanks for registering for Blackmon Winter Camp 2026! Your parent portal is ready: ${portalUrl}. `
      + `Sign in with ${contact.email} and complete the enrollment form + waivers. Questions? 469-261-1625. Reply STOP to opt out.`;
    try {
      if (!outreach.live) {
        const test = await outreach.testContact();
        const r = await store.sendSms(test, `[TEST for ${contact.email}] ${message}`);
        console.log(`  Invite SMS: REDIRECTED to the test phone (${process.env.ADMIN_ALERT_PHONE || test.phone}) for ${contact.email} (PARENT_MESSAGES=test; GHL message id ${r?.messageId || "not returned"}).`);
        return { status: "test", messageId: r?.messageId, note: `test phone ${process.env.ADMIN_ALERT_PHONE || ""}`.trim() };
      }
      const r = await store.sendSms({ ...contact, id: contact.id }, message);
      console.log(`  Invite SMS: SENT to ${contact.email}'s phone (GHL message id ${r?.messageId || "not returned"}).`);
      return { status: "sent", messageId: r?.messageId };
    } catch (err) {
      console.error(`  Invite SMS: FAILED for ${contact.email}: ${err.message}`);
      return { status: "failed", note: err.message };
    }
  }
  // The latest invite per contact, and every email that was ever invited.
  function inviteState() {
    const rows = db.prepare("SELECT * FROM invite_log ORDER BY sent_at").all();
    const byContact = new Map(), emails = new Map();
    for (const r of rows) {
      const c = byContact.get(r.contact_id) || { count: 0 };
      byContact.set(r.contact_id, { count: c.count + 1, last: r });
      if (r.email) emails.set(r.email, r);
    }
    return { byContact, emails };
  }

  // Automatic invites (on unless AUTO_INVITE=0): every 5 minutes, every contact whose Winter Camp 2026
  // opportunity is in Paid (won) (the Parents list, whatever product they bought) gets the invite once.
  // PAID_SINCE (optional) leaves out opportunities that reached Paid (won) before that date. Each
  // contact's decision is logged, and repeated only when it changes.
  const inviteDecision = new Map(); // contactId -> last logged reason
  const note = (p, reason) => {
    if (inviteDecision.get(p.contactId) === reason) return;
    inviteDecision.set(p.contactId, reason);
    console.log(`  Invite: skipped ${p.email || p.name} (${p.contactId}): ${reason}.`);
  };
  let inviting = false;
  async function autoInvite() {
    if (inviting) return; // the previous run is still going
    inviting = true;
    try { await inviteRun(); } finally { inviting = false; }
  }
  async function inviteRun() {
    await paidParents(true);
    const seen = new Set(), count = { sent: 0, skipped: 0, failed: 0 };
    const skip = (p, reason) => { count.skipped++; note(p, reason); };
    // Emails already invited: from the log, and from contacts invited before the log existed.
    const invites = inviteState(), emailInvited = new Map();
    for (const x of parentsCache.list) {
      const at = parentState(x.contactId)?.invite_sent_at, email = String(parentsCache.contacts.get(x.contactId)?.email || x.email || "").toLowerCase();
      if (at && email && !emailInvited.has(email)) emailInvited.set(email, at);
    }
    for (const p of parentsCache.list) {
      if (seen.has(p.contactId)) continue;
      seen.add(p.contactId);
      const contact = parentsCache.contacts.get(p.contactId), state = parentState(p.contactId);
      if (!contact) { skip(p, "couldn't load the GHL contact"); continue; }
      if (!contact.email) { skip(p, "the contact has no email"); continue; }
      if (state?.hidden_at) { skip(p, "removed from the portal by an admin"); continue; }
      if (p.accessGranted === "No") { skip(p, "Portal - Access Granted = No"); continue; }
      if (p.role && p.role !== "Parent") { skip(p, `Portal - Role is ${p.role}`); continue; }
      if (PAID_SINCE && p.stageChangedAt && p.stageChangedAt.slice(0, 10) < PAID_SINCE) { skip(p, `reached Paid (won) ${p.stageChangedAt.slice(0, 10)}, before PAID_SINCE ${PAID_SINCE}`); continue; }
      if (state?.invite_sent_at) { skip(p, `already invited ${state.invite_sent_at.slice(0, 16).replace("T", " ")} UTC`); continue; }
      // Paid again with the same email (on another GHL contact): not invited again automatically.
      const before = invites.emails.get(String(contact.email).toLowerCase()) || emailInvited.get(String(contact.email).toLowerCase());
      if (before) { skip(p, `paid again: ${contact.email} was already invited ${String(before.sent_at || before).slice(0, 16).replace("T", " ")} UTC`); continue; }
      try {
        const to = await invite(contact, "automatic");
        inviteDecision.delete(p.contactId);
        count.sent++;
        log(null, "Sent portal invite automatically", p.name, p.email);
      } catch (err) { count.failed++; console.error(`  Invite: FAILED for ${contact.email}: ${err.message}`); }
    }
    console.log(`  Auto-invite run: ${seen.size} paid parent${seen.size === 1 ? "" : "s"} in Winter Camp 2026 Paid (won); sent ${count.sent}, skipped ${count.skipped}, failed ${count.failed}.`);
  }
  if (process.env.AUTO_INVITE !== "0" && store.live) {
    console.log(`  Auto-invite: on (every 5 minutes; invites go to each paid parent's own email; link ${portalUrl}).`);
    // First run as soon as the server has started (catches anyone who paid while it was off).
    setTimeout(() => autoInvite().catch((err) => console.error(`  Auto-invite failed: ${err.message}`)), 3_000).unref();
    setInterval(() => autoInvite().catch((err) => console.error(`  Auto-invite failed: ${err.message}`)), 5 * 60_000).unref();
  } else if (store.live) console.log("  Auto-invite: off (AUTO_INVITE=0). Invites go out only from the admin Parents page.");

  // Scheduled announcements go out within a minute of their time.
  setInterval(() => {
    for (const id of announcements.due()) publish(id).catch((err) => console.error(`  Scheduled announcement ${id} failed: ${err.message}`));
  }, 60_000).unref();

  // ---------- startup: Owner from .env, sample data in demo mode ----------
  async function seedOwner() {
    if (db.prepare("SELECT 1 FROM admin_users WHERE level = 'owner'").get()) return;
    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(), password = process.env.ADMIN_PASSWORD || "";
    if (!email || !password) {
      console.log("  Admin: set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then restart, to create the Owner account.");
      return;
    }
    const first = email.split("@")[0].replace(/[^\p{L}]+/gu, " ").trim().split(" ")[0] || "Owner";
    db.prepare(`INSERT INTO admin_users (id, email, first_name, last_name, level, password_hash, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, '', 'owner', ?, 1, ?, ?)`).run(crypto.randomUUID(), email, first[0].toUpperCase() + first.slice(1), await hashPassword(password), now(), now());
    console.log(`  Admin: created the Owner account for ${email} (from .env).`);
  }

  async function seedDemoStaff() {
    if (db.prepare("SELECT 1 FROM staff").get()) return;
    const pdf = Buffer.from("%PDF-1.4\n% demo identity proof\n");
    const people = [
      { first: "Priya", last: "Shah", gender: "Female", email: "view@demo.test", phone: "+14695550201", role: "Camp Staff", location: "Little Elm", level: "view" },
      { first: "Marcus", last: "Lee", gender: "Male", email: "admin@demo.test", phone: "+14695550202", role: "Tutor", location: "Little Elm", level: "admin" },
      { first: "Ella", last: "Moreno", gender: "Female", email: "ella@demo.test", phone: "+14695550203", role: "Camp Staff", location: "Little Elm", level: null },
    ];
    for (const p of people) {
      const id = crypto.randomUUID();
      const contactId = await syncStaffToGhl({ firstName: p.first, lastName: p.last, phone: p.phone, email: p.email, role: p.role, location: p.location });
      const file = await saveFile(proofsDir, { buffer: pdf }, "pdf");
      db.prepare(`INSERT INTO staff (id, first_name, last_name, gender, email, phone, role, location, id_proof_path, id_proof_file_name,
        id_proof_mime, ghl_contact_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'id-proof.pdf', 'application/pdf', ?, ?, ?)`)
        .run(id, p.first, p.last, p.gender, p.email, p.phone, p.role, p.location, file, contactId, now(), now());
      if (p.level) {
        db.prepare(`INSERT INTO admin_users (id, email, first_name, last_name, level, password_hash, staff_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), p.email, p.first, p.last, p.level, await hashPassword(DEMO_PASSWORD), id, now(), now());
      }
    }
  }

  const ready = (async () => {
    await seedOwner();
    if (demo) {
      await seedDemoStaff();
      console.log(`  Admin demo sign-ins (password ${DEMO_PASSWORD}): admin@demo.test (Admin), view@demo.test (View only)`);
    }
  })().catch((err) => console.error("  Admin setup failed:", err.message));

  // ---------- API ----------
  async function route(req, res, url) {
    const m = req.method, p = url.pathname;
    const ip = clientIp(req);

    // Changes may only come from the portal's own pages (no cross-site form posts).
    if (m !== "GET" && !sameOrigin(req)) return send(res, 403, { error: "Not allowed." });

    if (m === "GET" && p === "/api/admin/status") {
      return send(res, 200, { demo, aiProblem: aiProblem(), demoLogins: demo ? { password: DEMO_PASSWORD, accounts: ["admin@demo.test (Admin)", "view@demo.test (View only)"] } : undefined });
    }

    if (m === "POST" && p === "/api/admin/login") {
      const { email: raw, password } = await readJson(req);
      const email = String(raw || "").trim().toLowerCase();
      if (!email || !password) return send(res, 400, { error: "Enter your email and password." });
      if (locked(ip, email)) return send(res, 429, { error: "Too many failed sign-in attempts. Please wait 15 minutes and try again." });
      const user = userByEmail(email);
      const ok = user?.password_hash ? await verifyPassword(password, user.password_hash) : (await burnTime(password), false);
      if (!ok) {
        noteFailure(ip, email);
        if (!user && db.prepare("SELECT 1 FROM staff WHERE email = ?").get(email)) {
          return send(res, 403, { error: "You don't have access to the admin dashboard. Ask an admin if you need it." });
        }
        const pending = user && !user.password_hash;
        return send(res, 401, { error: pending ? "Your account isn't set up yet. Use the link in your setup email, or ask an admin to resend it." : "That email and password don't match." });
      }
      failures.delete(`email:${email}`);
      return send(res, 200, { ok: true }, { "Set-Cookie": startSession(user.id) });
    }

    if (m === "POST" && p === "/api/admin/logout") {
      const s = current(req);
      if (s) sessions.remove(s.sid);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookie("", 0) });
    }

    // One-time password setup / reset link. The POST that sets the password is handled by finishSetup().
    if (m === "GET" && p === "/api/admin/setup") {
      const user = setupUser(url.searchParams.get("token"));
      if (!user) return send(res, 400, { error: SETUP_EXPIRED });
      return send(res, 200, { email: user.email, firstName: user.first_name, level: LEVEL_NAMES[user.level], reset: !!user.password_hash });
    }

    // Forgot password: emails a one-hour reset link. The reply is the same whether or not the
    // email has dashboard access, so the form can't be used to find out who does.
    if (m === "POST" && p === "/api/admin/forgot") {
      const email = String((await readJson(req)).email || "").trim().toLowerCase();
      if (emailError(email)) return send(res, 400, { error: "Please enter a valid email address." });
      const recentResets = (key) => (resets.get(key) || []).filter((t) => Date.now() - t < 3600_000);
      if (recentResets(`ip:${ip}`).length >= 10 || recentResets(`email:${email}`).length >= 3) {
        return send(res, 429, { error: "Too many reset requests. Please wait an hour and try again." });
      }
      for (const key of [`ip:${ip}`, `email:${email}`]) resets.set(key, [...recentResets(key), Date.now()]);
      const user = userByEmail(email);
      if (user) await sendResetLink(user).catch((err) => console.error(`  Password reset email to ${email} failed: ${err.message}`));
      else console.log(`  Password reset requested for ${email}: no dashboard user with that email.`);
      return send(res, 200, { ok: true });
    }

    const s = current(req);
    if (!s) return send(res, 401, { error: "Please sign in." });
    const me = s.user;
    const manage = () => { if (!canManage(me)) throw httpError(403, "You have view-only access, so you can't make changes."); };

    if (p === "/api/admin/me") {
      if (m === "GET") return send(res, 200, { user: publicUser(me), demo, unreadNotifications: docs.unreadCount(me.id) });
      if (m === "PUT") {
        const body = await readJson(req);
        const firstName = String(body.firstName || "").trim().replace(/\s+/g, " "), lastName = String(body.lastName || "").trim().replace(/\s+/g, " ");
        const email = String(body.email ?? me.email).trim().toLowerCase();
        const fields = {};
        const fe = nameError(firstName, "first name"), le = nameError(lastName, "last name");
        if (fe) fields.firstName = fe;
        if (le) fields.lastName = le;
        if (email !== me.email) {
          if (!canManage(me)) fields.email = "Only admins can change their email.";
          else if (me.staff_id) fields.email = "Your email is part of your staff record. Change it from the Staff page.";
          else if (emailError(email)) fields.email = emailError(email);
          else if (userByEmail(email)) fields.email = "Another dashboard user already uses this email.";
        }
        if (Object.keys(fields).length) throw httpError(400, "Please fix the highlighted fields.", fields);
        if (me.staff_id) {
          const st = staffById(me.staff_id);
          if (st.ghl_contact_id) await store.updateContact(st.ghl_contact_id, { firstName, lastName }, {});
          db.prepare("UPDATE staff SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?").run(firstName, lastName, now(), st.id);
        }
        db.prepare("UPDATE admin_users SET first_name = ?, last_name = ?, email = ?, updated_at = ? WHERE id = ?").run(firstName, lastName, email, now(), me.id);
        log(me, "Updated their profile", `${firstName} ${lastName}`.trim());
        return send(res, 200, { user: publicUser(userById(me.id)) });
      }
    }

    if (m === "POST" && p === "/api/admin/me/password") {
      const { current: cur, password, confirm } = await readJson(req);
      const fields = {};
      if (!(await verifyPassword(cur || "", me.password_hash))) fields.current = "That isn't your current password.";
      const pe = passwordError(password || "", me.email);
      if (pe) fields.password = pe;
      else if (password === cur) fields.password = "Choose a password different from your current one.";
      if (!fields.password && password !== confirm) fields.confirm = "The two passwords don't match.";
      if (Object.keys(fields).length) throw httpError(400, "Please fix the highlighted fields.", fields);
      db.prepare("UPDATE admin_users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?").run(await hashPassword(password), now(), me.id);
      killSessions(me.id, s.sid); // signs out their other devices
      log(me, "Changed their password", fullName(me) || me.email);
      return send(res, 200, { user: publicUser(userById(me.id)) });
    }

    if (m === "POST" && p === "/api/admin/me/photo") {
      const tooBig = "That photo is over 2 MB. Please choose a smaller one.";
      const form = await readForm(req, PHOTO.maxBytes + 16 * 1024, "photo", tooBig);
      const up = await readUpload(form, "photo", PHOTO, true);
      if (up.error) throw httpError(400, up.error, { photo: up.error });
      const name = await saveFile(photosDir, up.file, PHOTO.types[up.file.mime]);
      db.prepare("UPDATE admin_users SET photo_path = ?, updated_at = ? WHERE id = ?").run(name, now(), me.id);
      await removeFile(photosDir, me.photo_path);
      return send(res, 200, { user: publicUser(userById(me.id)) });
    }

    if (m === "DELETE" && p === "/api/admin/me/photo") {
      db.prepare("UPDATE admin_users SET photo_path = NULL, updated_at = ? WHERE id = ?").run(now(), me.id);
      await removeFile(photosDir, me.photo_path);
      return send(res, 200, { user: publicUser(userById(me.id)) });
    }

    const photo = /^\/api\/admin\/users\/([0-9a-f-]{36})\/photo$/.exec(p);
    if (m === "GET" && photo) {
      const u = userById(photo[1]);
      if (!u?.photo_path) return send(res, 404, { error: "No photo." });
      let data;
      try { data = await fs.promises.readFile(path.join(photosDir, u.photo_path)); } catch { return send(res, 404, { error: "No photo." }); }
      res.writeHead(200, { "Content-Type": u.photo_path.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
      return res.end(data);
    }

    // ----- parents -----
    if (m === "GET" && p === "/api/admin/parents") {
      const refresh = url.searchParams.get("refresh") === "1";
      // Refresh by an admin also brings every parent's documents up to date (view only just reloads).
      // fresh=1 (opening the page): read the opportunities again from GHL, without the document sync.
      const list = refresh && canManage(me) ? (await syncAllDocuments(true), parentsCache.list) : await paidParents(refresh || url.searchParams.get("fresh") === "1");
      const states = new Map(db.prepare("SELECT * FROM parent_access").all().map((r) => [r.contact_id, r]));
      const { byContact } = inviteState();
      // Paid again: this opportunity reached Paid (won) after the contact's invite, or it's another
      // GHL contact with an email that was already invited. Never re-invited automatically; shown in the column.
      const invitedAt = new Map();
      for (const x of list) {
        const at = states.get(x.contactId)?.invite_sent_at, e = String(x.email || "").toLowerCase();
        if (at && e && (!invitedAt.has(e) || at < invitedAt.get(e))) invitedAt.set(e, at);
      }
      return send(res, 200, {
        parents: list.filter((x) => !states.get(x.contactId)?.hidden_at).map((x) => {
          const own = states.get(x.contactId)?.invite_sent_at || null, first = invitedAt.get(String(x.email || "").toLowerCase()) || null;
          const paidAt = [x.stageChangedAt, x.createdAt].filter(Boolean).sort().pop() || null;
          const log = byContact.get(x.contactId);
          return { ...x, inviteSentAt: own, inviteTestAt: states.get(x.contactId)?.test_invite_at || null,
            inviteCount: log?.count || (own ? 1 : 0), inviteMessageId: log?.last?.message_id || null,
            inviteSms: log?.last?.sms_status || null, inviteSmsNote: log?.last?.sms_note || null,
            paidAgain: own ? !!(paidAt && Date.parse(paidAt) - Date.parse(own) > 60_000) : !!first,
            firstInviteAt: first, docs: docSummary(x.contactId) };
        }),
        loadedAt: new Date(parentsCache.at).toISOString(),
      });
    }

    // ----- "Sync from Winter Camp 2026": re-read the Paid (won) opportunities from GHL (no cache) -----
    if (m === "POST" && p === "/api/admin/opportunities/sync-child") {
      manage();
      const r = await syncAllDocuments(true);
      log(me, "Synced parents from Winter Camp 2026", `${r.parents} Paid (won) opportunities`, `documents: ${r.added} added, ${r.removed} removed`);
      return send(res, 200, r);
    }

    // ----- documents + notifications -----
    if (m === "POST" && p === "/api/admin/documents/sync") {
      manage();
      const r = await syncAllDocuments(true);
      log(me, "Synced parent documents", `${r.parents} paid families`, `${r.added} added, ${r.removed} removed`);
      return send(res, 200, r);
    }
    if (p === "/api/admin/notifications") {
      if (m === "GET") return send(res, 200, { notifications: docs.notifications(me.id), unread: docs.unreadCount(me.id) });
      if (m === "POST") { // mark read: { ids: [..] } or { all: true }
        const body = await readJson(req);
        docs.markRead(me.id, body.all ? "all" : (Array.isArray(body.ids) ? body.ids.map(Number) : []));
        return send(res, 200, { unread: docs.unreadCount(me.id) });
      }
    }
    // ----- training videos (admins upload; camp staff / tutors watch them on their Training page) -----
    if (p === "/api/admin/training") {
      if (m === "GET") {
        const audience = AUDIENCES.includes(url.searchParams.get("audience")) ? url.searchParams.get("audience") : "Camp Staff";
        return send(res, 200, { videos: videos.trainingList(audience), people: db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = ?").get(audience).n });
      }
      if (m === "POST") { // the video itself is the request body; the details come in the URL
        manage();
        if (!String(req.headers["content-type"] || "").startsWith("video/")) throw httpError(400, "Please choose a video file.");
        const q = url.searchParams;
        const added = await videos.addTraining(req, { audience: q.get("audience"), title: q.get("title"), description: q.get("description"),
          fileName: decodeURIComponent(String(req.headers["x-file-name"] || "")), by: fullName(me) || me.email });
        const v = added[0];
        log(me, "Uploaded training video", v.title, `${added.length > 1 ? "Camp staff and tutors" : v.audience === "Tutor" ? "Tutors" : "Camp staff"} · ${(v.size / 1048576).toFixed(1)} MB`);
        return send(res, 201, { video: v, videos: added });
      }
    }
    const tr = /^\/api\/admin\/training\/(\d+)(\/file|\/move)?$/.exec(p);
    if (tr) {
      if (m === "GET" && tr[2] === "/file") {
        const f = videos.trainingFile(tr[1]);
        if (!f) throw httpError(404, "Video not found.");
        return serveVideo(req, res, f.file, f.mime, f.name, url.searchParams.get("download") === "1");
      }
      manage();
      if (m === "POST" && tr[2] === "/move") { videos.moveTraining(tr[1], Number((await readJson(req)).dir)); return send(res, 200, { ok: true }); }
      if (m === "PUT" && !tr[2]) {
        const v = videos.updateTraining(tr[1], await readJson(req));
        log(me, "Edited training video", v.title);
        return send(res, 200, { video: v });
      }
      if (m === "DELETE" && !tr[2]) {
        const v = videos.removeTraining(tr[1]);
        log(me, "Deleted training video", v.title, v.audience === "Tutor" ? "Tutors" : "Camp staff");
        return send(res, 200, { ok: true });
      }
    }
    // ----- intro videos (uploaded by camp staff / tutors in their portal) -----
    if (m === "GET" && p === "/api/admin/intro-videos") {
      const intros = videos.intros(), byEmail = new Map(intros.map((v) => [v.email.toLowerCase(), v]));
      const list = db.prepare("SELECT * FROM staff ORDER BY first_name, last_name").all().map((s) => {
        const v = byEmail.get(s.email.toLowerCase());
        byEmail.delete(s.email.toLowerCase());
        return { name: `${s.first_name} ${s.last_name}`, email: s.email, phone: s.phone, gender: s.gender, role: s.role, location: s.location,
          video: v ? { contactId: v.contact_id, fileName: v.file_name, size: v.size, uploadedAt: v.uploaded_at } : null };
      });
      // Videos from people no longer on the Camp staff / Tutors pages.
      for (const v of byEmail.values()) list.push({ name: v.email, email: v.email, phone: "", gender: "", role: "Removed from staff", location: "",
        video: { contactId: v.contact_id, fileName: v.file_name, size: v.size, uploadedAt: v.uploaded_at } });
      return send(res, 200, { people: list });
    }
    // ----- knowledge assessment (camp staff take it in their portal after the training videos) -----
    if (m === "GET" && p === "/api/admin/assessments") {
      const all = assessment.byEmail(), signed = acks.byEmail();
      const list = db.prepare("SELECT * FROM staff WHERE role = 'Camp Staff' ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE").all().map((s) => {
        const a = all.get(s.email.toLowerCase());
        all.delete(s.email.toLowerCase());
        return { name: `${s.first_name} ${s.last_name}`.trim(), email: s.email, location: s.location, attempts: a?.attempts || [],
          acknowledgment: signed.get(s.email.toLowerCase()) || null };
      });
      // Attempts from people no longer on the Camp staff page.
      for (const a of all.values()) list.push({ name: a.name || a.email, email: a.email, location: "", removed: true, attempts: a.attempts,
        acknowledgment: signed.get(a.email.toLowerCase()) || null });
      return send(res, 200, { people: list, ...assessment.questions() });
    }
    // A camp staff member's signed Training Acknowledgment (admins only, like signed waivers).
    const ak = /^\/api\/admin\/acknowledgments\/([0-9a-f-]{36})\/file$/.exec(p);
    if (ak && m === "GET") {
      manage();
      const f = acks.fileById(ak[1]);
      if (!f) throw httpError(404, "That signed acknowledgment doesn't exist.");
      let data;
      try { data = await fs.promises.readFile(f.file); } catch { return send(res, 404, { error: "The signed file is missing." }); }
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${f.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      return res.end(data);
    }
    const iv = /^\/api\/admin\/intro-videos\/([\w-]+)\/file$/.exec(p);
    if (iv && m === "GET") {
      const v = videos.intro(iv[1]);
      if (!v) throw httpError(404, "Video not found.");
      return serveVideo(req, res, v.file, v.mime, v.name, url.searchParams.get("download") === "1");
    }

    // ----- camp content (Camp info and This week, shown in every parent's portal) -----
    if (p === "/api/admin/content" && m === "GET") return send(res, 200, content.load());
    if (m === "PUT" && p === "/api/admin/content/camp") {
      manage();
      const { version, campInfo } = await readJson(req);
      const out = content.saveCampInfo(version, campInfo);
      log(me, "Edited camp info", out.campInfo.title);
      return send(res, 200, out);
    }
    const wk = /^\/api\/admin\/content\/week\/(\w+)$/.exec(p);
    if (wk && m === "PUT") {
      manage();
      const { version, week } = await readJson(req);
      const out = content.saveWeek(version, wk[1], week);
      log(me, "Edited this week", out.locations[wk[1]] || wk[1], out.weeks[wk[1]].label);
      return send(res, 200, out);
    }
    // ----- announcements (portal Notifications, plus email / SMS in each parent's language) -----
    const mode = () => ({ live: outreach.live, testEmail: outreach.testEmail });
    if (p === "/api/admin/announcements") {
      if (m === "GET") return send(res, 200, { announcements: announcements.all(), mode: mode() });
      if (m === "POST") {
        manage();
        const a = announcements.create(await readJson(req), fullName(me) || me.email);
        if (a.send_at) log(me, "Scheduled announcement", a.title, `for ${a.send_at}`);
        else await publish(a.id, me);
        return send(res, 200, { announcement: announcements.view(a.id) });
      }
    }
    // Attachments: uploaded first (one per request), then listed by id when the announcement is saved.
    if (m === "POST" && p === "/api/admin/announcements/files") {
      manage();
      const tooBig = `That file is over ${ATTACHMENT.maxBytes / 1048576} MB. Please choose a smaller one.`;
      const form = await readForm(req, ATTACHMENT.maxBytes + 64 * 1024, "file", tooBig);
      const up = await readUpload(form, "file", ATTACHMENT, true);
      if (up.error) throw httpError(400, up.error, { attachments: up.error });
      return send(res, 200, { file: await announcements.addFile(up.file, fullName(me) || me.email) });
    }
    const annFile = /^\/api\/admin\/announcements\/files\/([\w-]+)$/.exec(p);
    if (annFile && m === "GET") {
      const f = announcements.file(annFile[1]);
      if (!f) throw httpError(404, "File not found.");
      let data;
      try { data = await fs.promises.readFile(f.path); } catch { throw httpError(404, "The file is missing."); }
      res.writeHead(200, { "Content-Type": f.mime, "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
      return res.end(data);
    }
    // What parents will get, before posting: who's in the audience and the text in each of their languages.
    if (m === "POST" && p === "/api/admin/announcements/preview") {
      manage();
      const body = await readJson(req);
      const v = validateAnnouncement({ ...body, sendAt: null });
      const parents = (await activeParents()).filter((x) => inAudienceOf(v.audience, x));
      const count = new Map();
      for (const x of parents) { const l = outreach.languageOf(x.contactId); count.set(l, (count.get(l) || 0) + 1); }
      if (!count.has("en")) count.set("en", 0);
      const languages = [];
      for (const [code, n] of [...count].sort((x, y) => (x[0] === "en" ? -1 : y[0] === "en" ? 1 : y[1] - x[1]))) {
        languages.push({ code, name: LANG_EN[code], families: n, ...(await outreach.announcementIn(code, v.title, v.body)) });
      }
      return send(res, 200, { recipients: parents.length, languages, mode: mode() });
    }
    const ann = /^\/api\/admin\/announcements\/(\d+)$/.exec(p);
    if (ann) {
      manage();
      const id = Number(ann[1]);
      if (m === "PUT") {
        const before = announcements.get(id);
        if (!before) throw httpError(404, "Announcement not found.");
        const a = announcements.update(id, await readJson(req));
        log(me, "Edited announcement", a.title);
        if (before.sent_at) { // already sent: re-translate the new wording for the portal (no new email/SMS)
          const translations = {};
          for (const lang of Object.keys(before.translations)) {
            translations[lang] = await outreach.announcementIn(lang, a.title, a.body).catch(() => ({ title: a.title, body: a.body }));
          }
          announcements.saveTranslations(id, translations);
        } else if (!a.send_at) await publish(id, me);
        return send(res, 200, { announcement: announcements.view(id) });
      }
      if (m === "DELETE") {
        const a = announcements.remove(id);
        log(me, "Deleted announcement", a.title);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "Method not allowed" });
    }

    // ----- missing steps: what each family still has to do, and reminders in their language -----
    if (m === "GET" && p === "/api/admin/followups") {
      const list = await activeParents(true); // Missing steps: contact details read fresh on every load
      const reminded = outreach.lastReminded();
      return send(res, 200, {
        parents: list.map((x) => followup(x, parentsCache.contacts.get(x.contactId), reminded)),
        loadedAt: new Date(parentsCache.at).toISOString(), mode: mode(),
      });
    }
    if (m === "POST" && p === "/api/admin/followups/remind") {
      manage();
      const body = await readJson(req);
      const channels = ["email", "sms"].filter((c) => (body.channels || []).includes(c));
      if (!channels.length) throw httpError(400, "Choose email, text message, or both.");
      const ids = new Set((Array.isArray(body.contactIds) ? body.contactIds : []).map(String));
      if (!ids.size) throw httpError(400, "Choose at least one family.");
      if (ids.size > 500) throw httpError(400, "Choose at most 500 families at a time.");
      const chosen = (await activeParents(true)).filter((x) => ids.has(x.contactId)); // send to their current email / phone
      const results = { families: 0, email: 0, sms: 0, failed: 0, skipped: 0, nothingMissing: 0, live: outreach.live };
      await mapLimit(chosen, 3, async (x) => {
        // Fresh from GHL, so a step done in the last few minutes isn't reminded about.
        const contact = await store.getContact(x.contactId).catch(() => parentsCache.contacts.get(x.contactId));
        if (!contact) { results.failed++; return; }
        const row = followup(x, contact, new Map());
        const lang = row.language;
        const msg = await outreach.reminderFor(row, lang);
        if (!msg.missing.length) { results.nothingMissing++; return; }
        results.families++;
        const r = await outreach.deliver(x, lang, msg, channels, { kind: "reminder" });
        for (const [ch, st] of Object.entries(r)) { if (st === "sent") results[ch]++; else results[st]++; }
      });
      log(me, "Sent missing-step reminders", `${results.families} ${results.families === 1 ? "family" : "families"}`,
        `${results.email} emails, ${results.sms} texts${results.failed ? `, ${results.failed} failed` : ""}${outreach.live ? "" : " (test mode)"}`);
      const reminded = outreach.lastReminded();
      return send(res, 200, { ...results, lastReminded: Object.fromEntries(chosen.map((x) => [x.contactId, reminded.get(x.contactId) || null])) });
    }

    // "Ask Blackmon" chats a parent handed off ("talk to a person"): full transcript, and mark handled.
    const chat = /^\/api\/admin\/chats\/([0-9a-f-]{36})(\/handled)?$/.exec(p);
    if (chat) {
      const found = assistant.conversation(chat[1]);
      if (!found) throw httpError(404, "Chat not found.");
      if (m === "GET" && !chat[2]) return send(res, 200, found);
      if (m === "POST" && chat[2]) {
        if (assistant.markHandled(chat[1], fullName(me) || me.email)) log(me, "Marked chat handled", found.conversation.parentName, found.conversation.parentEmail);
        return send(res, 200, assistant.conversation(chat[1]));
      }
      return send(res, 405, { error: "Method not allowed" });
    }

    const nu = /^\/api\/admin\/notifications\/(\d+)\/unread$/.exec(p);
    if (m === "POST" && nu) { docs.markUnread(me.id, Number(nu[1])); return send(res, 200, { unread: docs.unreadCount(me.id) }); }

    // ----- roster: every child, one row each (spec section 4), from the GHL enrollment form's answers
    // on each paid parent's contact (wc26__*), with their Winter Camp 2026 opportunity where it's blank.
    // Camp = the contact's camp tag ("winter 2026"); "all" = every paid family.
    if (m === "GET" && (p === "/api/admin/roster" || p === "/api/admin/roster.csv")) {
      const q = url.searchParams, settings = enrollmentSettings();
      const parents = await activeParents(true), subs = await enrollForm.latestByEmail(true).catch(() => new Map());
      const all = (await Promise.all(parents.map(async (x) => {
        const c = parentsCache.contacts.get(x.contactId);
        return familyRows(x, (await withFormAnswers(c, subs.get(String(c?.email || x.email || "").toLowerCase()))).contact);
      }))).flat();
      const campCount = new Map();
      for (const r of all) for (const c of new Set(r.camps)) campCount.set(c, (campCount.get(c) || 0) + 1);
      const camps = [...campCount].map(([camp, n]) => ({ camp, n })).sort((a, b) => a.camp.localeCompare(b.camp));
      const want = q.get("camp") || (campCount.has(settings.tag) ? settings.tag : "all");
      const camp = want === "all" || campCount.has(want) ? want : "all";
      const list = ROSTER_LISTS[q.get("list")] || ROSTER_LISTS.all;
      const rows = all.filter((r) => (camp === "all" || r.camps.includes(camp)) && (!q.get("location") || r.location === q.get("location"))
        && (!q.get("session") || r.sessionWeeks.includes(q.get("session"))) && list.keep(r))
        .sort((a, b) => a.child.localeCompare(b.child));
      if (p === "/api/admin/roster.csv") {
        log(me, "Exported roster", `${camp === "all" ? "All camps" : camp} · ${list.label}`, `${rows.length} ${rows.length === 1 ? "child" : "children"}`);
        const slug = `${camp === "all" ? "all-camps" : camp}-${q.get("list") || "roster"}${q.get("location") ? `-${q.get("location")}` : ""}${q.get("session") ? `-${q.get("session")}` : ""}`.toLowerCase().replace(/[^\w-]+/g, "-");
        res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="blackmon-${slug}-${fileDate()}.csv"`, "Cache-Control": "private, no-store" });
        return res.end(csv([ROSTER.map(([, label]) => label), ...rows.map((r) => ROSTER.map(([k]) => r[k] || ""))]));
      }
      const columns = list.columns.map((k) => ROSTER.find(([key]) => key === k));
      return send(res, 200, {
        camp, camps: [{ camp: "all", n: all.length }, ...camps], columns, rows,
        lists: Object.entries(ROSTER_LISTS).map(([key, l]) => ({ key, label: l.label })),
        locations: [...new Set(all.map((r) => r.location).filter(Boolean))].sort().map((v) => ({ value: v, label: v })),
        sessions: settings.sessions, submitted: rows.filter((r) => r.formSubmitted).length, total: rows.length,
      });
    }

    // Every family's meal plan, read fresh from GHL, as a spreadsheet.
    if (m === "GET" && p === "/api/admin/meals.csv") {
      const list = await activeParents(true);
      const rows = list.map((x) => [x.name, x.email, x.phone, x.childName, x.childAge, x.lunch, x.location, ...mealCells(meals.of(parentsCache.contacts.get(x.contactId) || { id: x.contactId }).choices)]);
      log(me, "Exported meal plans", `${list.length} ${list.length === 1 ? "family" : "families"}`);
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="blackmon-meal-plans-${fileDate()}.csv"`, "Cache-Control": "private, no-store" });
      return res.end(csv([["Parent", "Email", "Phone", "Child", "Child age", "Lunch", "Location", ...MEAL_COLUMNS], ...rows]));
    }

    const parent = /^\/api\/admin\/parents\/([\w-]{1,64})(?:\/(notify|sync|meals\.csv|documents\/([\w-]{1,64})\/(signed|reset)))?$/.exec(p);
    if (parent) {
      const [, id, action, docId, docAction] = parent;
      if (m === "GET" && !action) return send(res, 200, await parentDetail(id)); // view only may look
      if (m === "GET" && action === "meals.csv") {
        const d = await parentDetail(id), x = d.parent;
        const name = (x.name || "parent").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "parent";
        res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="meal-plan-${name}-${fileDate()}.csv"`, "Cache-Control": "private, no-store" });
        return res.end(csv([["Parent", "Email", "Phone", "Child", "Child age", "Meal", "Choice", "Special request"],
          ...d.meals.map((ml) => [x.name, x.email, x.phone, x.childName, x.childAge, ml.meal, ml.choice, ml.request])]));
      }
      manage(); // everything else changes data or opens a signed copy
      if (m === "GET" && docAction === "signed") {
        const f = docs.signedFile(id, docId);
        if (!f) return send(res, 404, { error: "There's no signed copy of this document." });
        let data;
        try { data = await fs.promises.readFile(f.file); } catch { return send(res, 404, { error: "The signed file is missing." }); }
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${f.name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
        return res.end(data);
      }
      if (m === "POST" && docAction === "reset") {
        const r = docs.reset(id, docId, fullName(me) || me.email);
        log(me, "Reset waiver", `${r.title} · ${r.parentName}`, "The parent can sign it again; the old signed copy is kept.");
        return send(res, 200, { documents: docs.list(id) });
      }
      if (m === "POST" && action === "sync") {
        const opp = await docs.paidOpportunity(id, true);
        if (!opp) throw httpError(404, "This contact has no paid opportunity (“Paid (won)”).");
        const r = docs.syncAssignments(id, opp);
        if (r.added.length || r.removed.length) log(me, "Synced parent documents", id, `${r.added.length} added, ${r.removed.length} removed`);
        return send(res, 200, { ...r, documents: docs.list(id) });
      }
      const pa = await findParent(id);
      if (m === "POST" && action === "notify") {
        if (pa.role && pa.role !== "Parent") throw httpError(409, `This contact is set up as ${pa.role} in the portal, so they can't also be invited as a parent.`);
        if (!pa.email) throw httpError(400, "This contact has no email address in GHL.");
        const resend = !!parentState(id)?.invite_sent_at;
        const contact = await store.getContact(id);
        const to = await invite(contact, `manual, by ${me.email}`);
        if (to === "parent") Object.assign(pa, { role: "Parent", accessGranted: "Yes" });
        log(me, resend ? "Resent portal invite" : "Sent portal invite", pa.name, pa.email);
        const last = inviteState().byContact.get(id);
        return send(res, 200, { ok: true, inviteSentAt: parentState(id).invite_sent_at, inviteCount: last?.count || 1, inviteMessageId: last?.last?.message_id || null,
          inviteSms: last?.last?.sms_status || null, inviteSmsNote: last?.last?.sms_note || null, sentTo: to });
      }
      if (m === "DELETE" && !action) {
        await store.updateFields(id, { portal__access_granted: "No" });
        upsertParent(id, { hidden_at: now(), invite_sent_at: null });
        pa.accessGranted = "No";
        log(me, "Removed parent's portal access", pa.name, pa.email);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "Method not allowed" });
    }

    // ----- staff -----
    if (p === "/api/admin/staff") {
      if (m === "GET") {
        return send(res, 200, { staff: db.prepare("SELECT * FROM staff ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE").all().map((r) => publicStaff(r, me)) });
      }
      if (m === "POST") {
        manage();
        return saveStaff(req, res, me, null);
      }
    }

    const st = /^\/api\/admin\/staff\/([0-9a-f-]{36})(\/id-proof|\/access|\/setup-link)?$/.exec(p);
    if (st) {
      const staff = staffById(st[1]);
      if (!staff) return send(res, 404, { error: "That staff member doesn't exist." });
      manage(); // everything below changes data or opens a private file
      const sub = st[2] || "";

      if (m === "GET" && sub === "/id-proof") {
        let data;
        try { data = await fs.promises.readFile(path.join(proofsDir, staff.id_proof_path)); } catch { return send(res, 404, "The file is missing."); }
        res.writeHead(200, {
          "Content-Type": staff.id_proof_mime, "Content-Disposition": `inline; filename="${staff.id_proof_file_name.replace(/"/g, "")}"`,
          "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        });
        return res.end(data);
      }
      if (m === "PUT" && sub === "/access") {
        const { access } = await readJson(req);
        if (!ACCESS[access]) return send(res, 400, { error: "Choose No access, View only or Admin." });
        const warning = await setAccess(me, staff, access);
        return send(res, 200, { staff: publicStaff(staffById(staff.id), me), warning });
      }
      if (m === "POST" && sub === "/setup-link") {
        const login = userByStaff(staff.id);
        if (!login) return send(res, 400, { error: "This person has no dashboard access. Give them access first." });
        await sendSetupLink(login, staff);
        log(me, "Sent dashboard setup link", fullName(staff), staff.email);
        return send(res, 200, { ok: true });
      }
      if (m === "PUT" && !sub) return saveStaff(req, res, me, staff);
      if (m === "DELETE" && !sub) {
        const login = userByStaff(staff.id);
        if (login?.id === me.id) throw httpError(403, "You can't delete your own staff record.");
        if (login?.level === "admin" && adminCount() <= 1) throw httpError(409, "There must always be at least one admin.");
        if (staff.ghl_contact_id) {
          await store.updateFields(staff.ghl_contact_id, { portal__access_granted: "No" }).catch((err) => {
            console.error(`  Couldn't remove portal access for ${staff.email} in GHL: ${err.message}`);
            throw httpError(502, "Couldn't update GHL, so nothing was deleted. Please try again.");
          });
        }
        if (login) { killSessions(login.id); await removeFile(photosDir, login.photo_path); }
        db.prepare("DELETE FROM staff WHERE id = ?").run(staff.id); // also deletes their dashboard login
        await removeFile(proofsDir, staff.id_proof_path);
        log(me, "Deleted staff member", fullName(staff), `${staff.role} · ${staff.email}`);
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: "Method not allowed" });
    }

    if (m === "GET" && p === "/api/admin/activity") {
      manage();
      return send(res, 200, { activity: db.prepare("SELECT at, user_name, action, target, details FROM activity_log ORDER BY id DESC LIMIT 200").all() });
    }

    return send(res, 404, { error: "Not found" });
  }

  // Add (staff = null) or edit a staff member from the multipart form.
  async function saveStaff(req, res, me, staff) {
    const tooBig = "That file is over 5 MB. Please choose a smaller one.";
    const form = await readForm(req, ID_PROOF.maxBytes + 64 * 1024, "idProof", tooBig);
    const text = Object.fromEntries([...form].filter(([, v]) => typeof v === "string"));
    const { values, errors } = validateStaff(text);
    const login = staff && userByStaff(staff.id);
    if (staff && !text.access) values.access = login?.level || "none"; // field left out = access unchanged
    const up = await readUpload(form, "idProof", ID_PROOF, !staff);
    if (up.error) errors.idProof = up.error;
    if (!errors.email && db.prepare("SELECT 1 FROM staff WHERE email = ? AND id != ?").get(values.email, staff?.id || "")) {
      errors.email = "Another staff member already uses this email.";
    }
    if (!errors.email && userByEmail(values.email) && userByEmail(values.email).id !== login?.id) {
      errors.email = "This email is already used by another dashboard user.";
    }
    // Dashboard password set by the admin: required when adding someone with access, optional
    // when editing (blank keeps the current one). Your own password is changed in Settings instead.
    const isSelf = !!login && login.id === me.id;
    const password = String(text.password || ""), confirm = String(text.confirm || "");
    const setsPassword = values.access !== "none" && !isSelf && !!password;
    if (values.access !== "none" && !isSelf) {
      if (!staff && !password) errors.password = "Enter a password, or click “Generate password”.";
      else if (password) {
        const pe = passwordError(password, values.email);
        if (pe) errors.password = pe;
        else if (password !== confirm) errors.confirm = "The two passwords don't match.";
      }
    }
    if (Object.keys(errors).length) {
      const conflict = errors.email && /already/.test(errors.email) && Object.keys(errors).length === 1;
      throw httpError(conflict ? 409 : 400, conflict ? errors.email : "Please fix the highlighted fields.", errors);
    }
    // Access rules are checked before anything is saved, so a refused change saves nothing.
    if (isSelf && values.access !== login.level) throw httpError(403, "You can't change your own dashboard access.", { access: "You can't change your own access." });

    const contactId = await syncStaffToGhl(values, staff?.ghl_contact_id);
    const saved = up.file ? await saveFile(proofsDir, up.file, ID_PROOF.types[up.file.mime]) : null;
    const id = staff?.id || crypto.randomUUID();
    try {
      if (!staff) {
        db.prepare(`INSERT INTO staff (id, first_name, last_name, gender, email, phone, role, location, id_proof_path, id_proof_file_name,
          id_proof_mime, ghl_contact_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, values.firstName, values.lastName, values.gender, values.email, values.phone, values.role, values.location,
            saved, up.file.name, up.file.mime, contactId, now(), now());
      } else {
        db.prepare(`UPDATE staff SET first_name = ?, last_name = ?, gender = ?, email = ?, phone = ?, role = ?, location = ?,
          id_proof_path = ?, id_proof_file_name = ?, id_proof_mime = ?, ghl_contact_id = ?, updated_at = ? WHERE id = ?`)
          .run(values.firstName, values.lastName, values.gender, values.email, values.phone, values.role, values.location,
            saved || staff.id_proof_path, up.file ? up.file.name : staff.id_proof_file_name, up.file ? up.file.mime : staff.id_proof_mime,
            contactId, now(), id);
        if (login) db.prepare("UPDATE admin_users SET first_name = ?, last_name = ?, email = ?, updated_at = ? WHERE id = ?").run(values.firstName, values.lastName, values.email, now(), login.id);
      }
    } catch (err) {
      if (saved) await removeFile(proofsDir, saved);
      if (/UNIQUE constraint failed: staff\.email/.test(err.message)) throw httpError(409, "Another staff member already uses this email.", { email: "Another staff member already uses this email." });
      throw err;
    }
    if (saved && staff) await removeFile(proofsDir, staff.id_proof_path);
    log(me, staff ? "Edited staff member" : "Added staff member", `${values.firstName} ${values.lastName}`, `${values.role} · ${values.location}`);

    const warning = await setAccess(me, staffById(id), values.access, { password: setsPassword ? password : null });
    return send(res, staff ? 200 : 201, { staff: publicStaff(staffById(id), me), warning });
  }

  // ---------- staff / tutor portal: their own details (Settings) ----------
  // They can change only their phone, location and ID proof. Name, email, gender, role, dashboard
  // access and password stay with the admin. Changes save to the same staff record the admin
  // dashboard shows, and to their GHL contact.
  const selfView = (s) => ({
    firstName: s.first_name, lastName: s.last_name, email: s.email, gender: s.gender, role: s.role,
    phone: s.phone, location: s.location, idProofFileName: s.id_proof_file_name, access: userByStaff(s.id)?.level || "none", updatedAt: s.updated_at,
  });
  async function profile(req, res, url, email) {
    const staff = db.prepare("SELECT * FROM staff WHERE email = ? COLLATE NOCASE").get(email);
    if (!staff) throw httpError(404, "We couldn't find your staff record. Please contact Blackmon Tutoring.");
    const m = req.method;
    if (m === "GET" && url.pathname === "/api/profile") return send(res, 200, { profile: selfView(staff) });
    if (m === "GET" && url.pathname === "/api/profile/id-proof") {
      let data;
      try { data = await fs.promises.readFile(path.join(proofsDir, staff.id_proof_path)); } catch { throw httpError(404, "The file is missing."); }
      res.writeHead(200, { "Content-Type": staff.id_proof_mime, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(staff.id_proof_file_name)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      return res.end(data);
    }
    if (m === "PUT" && url.pathname === "/api/profile") {
      if (!sameOrigin(req)) return send(res, 403, { error: "Not allowed." });
      const tooBig = `That file is over ${ID_PROOF.maxBytes / 1048576} MB. Please choose a smaller one.`;
      const form = await readForm(req, ID_PROOF.maxBytes + 64 * 1024, "idProof", tooBig);
      const text = Object.fromEntries([...form].filter(([, v]) => typeof v === "string"));
      // Everything else comes from their record, so only phone and location can change here.
      const { values, errors } = validateStaff({
        firstName: staff.first_name, lastName: staff.last_name, gender: staff.gender, email: staff.email, role: staff.role,
        phone: text.phone, location: text.location,
      });
      const up = await readUpload(form, "idProof", ID_PROOF, false);
      if (up.error) errors.idProof = up.error;
      if (Object.keys(errors).length) throw httpError(400, "Please fix the highlighted fields.", errors);
      const changed = [values.phone !== staff.phone && "phone", values.location !== staff.location && "location", up.file && "ID proof"].filter(Boolean);
      if (!changed.length) return send(res, 200, { profile: selfView(staff), changed });

      const contactId = await syncStaffToGhl(values, staff.ghl_contact_id);
      const saved = up.file ? await saveFile(proofsDir, up.file, ID_PROOF.types[up.file.mime]) : null;
      db.prepare(`UPDATE staff SET phone = ?, location = ?, id_proof_path = ?, id_proof_file_name = ?, id_proof_mime = ?, ghl_contact_id = ?, updated_at = ? WHERE id = ?`)
        .run(values.phone, values.location, saved || staff.id_proof_path, up.file ? up.file.name : staff.id_proof_file_name,
          up.file ? up.file.mime : staff.id_proof_mime, contactId, now(), staff.id);
      if (saved) await removeFile(proofsDir, staff.id_proof_path);
      db.prepare("INSERT INTO activity_log (at, user_id, user_name, action, target, details) VALUES (?, NULL, ?, ?, ?, ?)")
        .run(now(), `${staff.first_name} ${staff.last_name} (${staff.role === "Tutor" ? "tutor" : "camp staff"} portal)`, "Updated their own details",
          `${staff.first_name} ${staff.last_name}`, `Changed ${changed.join(", ")}`);
      return send(res, 200, { profile: selfView(staffById(staff.id)), changed });
    }
    throw httpError(404, "Not found.");
  }

  return {
    ready,
    async profile(req, res, url, email) {
      await ready;
      try { return await profile(req, res, url, email); }
      catch (err) {
        if (err.httpStatus) return send(res, err.httpStatus, { error: err.message, fields: err.fields });
        throw err;
      }
    },
    async api(req, res, url) {
      await ready;
      try {
        // Password setup needs the parsed body, so it's finished here rather than in route().
        if (req.method === "POST" && url.pathname === "/api/admin/setup") return await finishSetup(req, res);
        return await route(req, res, url);
      } catch (err) {
        if (err.httpStatus) return send(res, err.httpStatus, { error: err.message, fields: err.fields });
        throw err;
      }
    },
  };

  async function finishSetup(req, res) {
    if (!sameOrigin(req)) return send(res, 403, { error: "Not allowed." });
    const { token, password, confirm } = await readJson(req);
    const user = setupUser(token);
    if (!user) return send(res, 400, { error: SETUP_EXPIRED });
    const pe = passwordError(password || "", user.email);
    if (pe) throw httpError(400, "Please fix the highlighted fields.", { password: pe });
    if (password !== confirm) throw httpError(400, "Please fix the highlighted fields.", { confirm: "The two passwords don't match." });
    db.prepare("UPDATE admin_users SET password_hash = ?, setup_token_hash = NULL, setup_expires_at = NULL, must_change_password = 0, updated_at = ? WHERE id = ?")
      .run(await hashPassword(password), now(), user.id);
    killSessions(user.id);
    failures.delete(`email:${user.email}`); // a fresh password clears earlier failed attempts
    log(user, user.password_hash ? "Reset their password (forgot password)" : "Set their dashboard password", fullName(user));
    return send(res, 200, { ok: true }, { "Set-Cookie": startSession(user.id) });
  }
}
