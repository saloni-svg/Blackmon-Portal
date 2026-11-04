// Blackmon Portal server. Run with:  npm start   (from the app/ folder)
// No GHL_TOKEN in .env -> demo data. With GHL_TOKEN -> live GoHighLevel data.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGhlStore } from "./lib/ghl.js";
import { createDemoStore } from "./lib/demo.js";
import { buildView, roleOf, nextInstallment, campPackage, campInclusions, yesNo, MEAL_FIELDS, ENROLLMENT_TAG, ONBOARDING } from "./lib/portal.js";
import { createVideos, serveVideo } from "./lib/videos.js";
import { createAssessment } from "./lib/assessment.js";
import { createAcknowledgments, ACK_STATEMENT, ACK_TITLE } from "./lib/acknowledgment.js";
import { createAdmin } from "./lib/admin.js";
import { openDb } from "./lib/db.js";
import { createSessions } from "./lib/sessions.js";
import { createDocuments, childOf, searchPaid, PORTAL_TEST_TAG, OPP_FIELDS, oppField, lunchIncluded } from "./lib/documents.js";
import { createAssistant } from "./lib/assistant.js";
import { createAnnouncements, inAudience, afterJoin, saveJoinedAt } from "./lib/announcements.js";
import { createOutreach } from "./lib/outreach.js";
import { createVoice, MAX_TURN_BYTES } from "./lib/voice.js";
import { createMeals, mealChosen } from "./lib/meals.js";
import { enrollmentSettings, checkEnrollment, createEnrollments } from "./lib/enrollment.js";
import { chatText } from "./public/chat-i18n.js";
import { createOppSync } from "./lib/oppsync.js";
import { createChildCheck } from "./lib/childcheck.js";
import { registrationsFor } from "./lib/receipts.js";
import { enrollPrefill } from "./lib/enroll-prefill.js";
import { createEnrollForm } from "./lib/enrollform.js";
import { createLive } from "./lib/live.js";
import { createParentAccounts, PORTAL_PARENT_TAG } from "./lib/parentaccount.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const IMAGES = path.join(ROOT, "..", "assets", "images");
const LOGOS = path.join(ROOT, "..", "assets", "logo");
const PORT = Number(process.env.PORT) || 3000;
// Testing switches. Never on in production (NODE_ENV=production): codes are always emailed there
// (DEV_PRINT_CODES is on unless "0" locally) and only real paid families / added staff can sign in.
const PRINT_CODES = process.env.NODE_ENV !== "production" && process.env.DEV_PRINT_CODES !== "0";
const ALLOW_ANY_EMAIL = process.env.NODE_ENV !== "production" && process.env.DEV_ALLOW_ANY_EMAIL === "1";
const TEST_ROLES = { parent: "Parent", staff: "Camp Staff", tutor: "Tutor" };
const TAB_NAMES = { parent: "Parent", staff: "Camp staff", tutor: "Tutor" }; // as labelled on the sign-in tabs
// API routes each role may use; anyone else gets 403.
const PARENT_ONLY = new Set(["POST /api/pay", "POST /api/enrollment", "POST /api/meals"]);
const STAFF_ONLY = new Set(["POST /api/video"]);
const PAYMENT_MODE = process.env.GHL_PAYMENT_MODE === "live" ? "live" : "test";
const GHL_USER_ID = process.env.GHL_USER_ID || ""; // GHL user the invoices are sent from

// Portal - Next Due Date as YYYY-MM-DD (GHL may return a date string or a timestamp); today if missing.
function dueDateOf(v) {
  const d = v == null || v === "" ? new Date() : new Date(/^\d+$/.test(String(v)) ? Number(v) : v);
  return (isNaN(d) ? new Date() : d).toISOString().slice(0, 10);
}

// GHL Private Integration token: GHL_TOKEN (or GHL_API_KEY, the same thing).
const GHL_TOKEN = process.env.GHL_TOKEN || process.env.GHL_API_KEY || "";
// NODE_ENV=production on the host: HTTPS only (behind the host's proxy), Secure cookies, and the
// visitor's IP from X-Forwarded-For (TRUST_PROXY=1 does that part without production).
const PRODUCTION = process.env.NODE_ENV === "production";
const TRUST_PROXY = process.env.TRUST_PROXY ? process.env.TRUST_PROXY === "1" : PRODUCTION;
if (GHL_TOKEN && !process.env.GHL_LOCATION_ID) {
  console.error("\n  GHL_LOCATION_ID is missing from app/.env. Add the Blackmon sub-account ID, then start again.\n");
  process.exit(1);
}
const store = GHL_TOKEN
  ? createGhlStore({ token: GHL_TOKEN, locationId: process.env.GHL_LOCATION_ID })
  : createDemoStore();

const loadContent = () => JSON.parse(fs.readFileSync(CAMP_FILE, "utf8"));

// The portal's own database and files (admin users, staff, documents, signed waivers). Demo mode
// uses data/demo/ so sample data never mixes with live data. On a host, DATA_DIR must be a persistent disk.
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || "data");
const DATA_BASE = store.live ? DATA_DIR : path.join(DATA_DIR, "demo");
// Moving to a new host: data uploaded through the one-time import (PUT /_import, see below) waits in
// DATA_BASE/import-staging and is put in place here, on the next start, before the database opens.
const STAGING = path.join(DATA_BASE, "import-staging");
if (fs.existsSync(path.join(STAGING, "portal.db"))) {
  for (const f of ["portal.db", "portal.db-wal", "portal.db-shm"]) fs.rmSync(path.join(DATA_BASE, f), { force: true });
  for (const name of fs.readdirSync(STAGING)) {
    fs.rmSync(path.join(DATA_BASE, name), { recursive: true, force: true });
    fs.renameSync(path.join(STAGING, name), path.join(DATA_BASE, name));
  }
  fs.rmSync(STAGING, { recursive: true, force: true });
  console.log(`  Import: moved the uploaded data into ${DATA_BASE} (database, waivers, uploads, camp content).`);
}
const db = openDb(path.join(DATA_BASE, "portal.db"), path.join(ROOT, "migrations"));
// camp.json is edited from the admin dashboard (Camp info, This week), so the live copy is kept with
// the data (on the host's persistent disk), not in the app folder that's replaced on every deploy.
// It starts as a copy of content/camp.json the first time.
const CAMP_FILE = path.join(DATA_BASE, "content", "camp.json");
if (!fs.existsSync(CAMP_FILE)) {
  fs.mkdirSync(path.dirname(CAMP_FILE), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "content", "camp.json"), CAMP_FILE);
  console.log(`  Camp content: copied content/camp.json to ${CAMP_FILE} (admin edits are saved there).`);
}
// Camp is only in Little Elm now: the Plano camp, its week schedule and its team are removed from the
// live camp.json (once; admins' other edits stay as they are).
{
  const camp = JSON.parse(fs.readFileSync(CAMP_FILE, "utf8"));
  const had = ["locations", "weeks", "teams"].filter((k) => camp[k]?.plano);
  if (had.length) {
    for (const k of had) delete camp[k].plano;
    fs.writeFileSync(CAMP_FILE, JSON.stringify(camp, null, 2) + "\n");
    console.log(`  Camp content: removed Plano (${had.join(", ")}) from ${CAMP_FILE}.`);
  }
}
const docs = createDocuments({ db, store, root: ROOT, base: DATA_BASE });
const enrollForm = createEnrollForm(store);
// Before launch (PARENT_MESSAGES isn't "live"), the portal changes and emails real GHL contacts only
// when they're tagged portal-test; everyone else is left alone until launch.
const LIVE = process.env.PARENT_MESSAGES === "live";
const mayChange = (contact) => LIVE || (contact?.tags || []).includes(PORTAL_TEST_TAG);
// Fills empty opportunity fields (child name/age, email, phone) from the contact.
const oppSync = createOppSync({ store, db, testOnly: !LIVE });
// Enrollment form: the child's name and age must match their Winter Camp registration in GHL.
const childCheck = createChildCheck({ store });
function childCheckWarning(contact, text) {
  console.warn(`  Enrollment child check for ${contact.email}: ${text}`);
  db.prepare("INSERT INTO activity_log (at, user_id, user_name, action, target, details) VALUES (?, NULL, ?, ?, ?, ?)")
    .run(new Date().toISOString(), "System", "Enrollment child check skipped", contact.email, text);
}

// Admin dashboard at /admin (separate email + password sign-in). PORTAL_URL is used in emailed links.
// The portal's address: every emailed / texted link is built from it (no trailing slash).
const PORTAL_URL = (process.env.PORTAL_URL || "https://portal.blackmontutoring.com").replace(/\/+$/, "");
// Production: the one address the portal answers on. Any other host (e.g. the service's own
// *.onrender.com address) is 301-redirected to the same path on PORTAL_URL.
const CANONICAL_HOST = new URL(PORTAL_URL).host;
// Cookies are Secure (sent over HTTPS only) whenever the portal is served over https.
const SECURE_COOKIE = /^https:/i.test(PORTAL_URL) ? "; Secure" : "";
// In production (NODE_ENV=production on the host) emails never carry a localhost link: invites are
// refused, and the sign-in code email goes without the link.
const LOCAL_LINK_BLOCKED = process.env.NODE_ENV === "production" && /^http:\/\/localhost/i.test(PORTAL_URL);
// "Ask Blackmon" parent chat. Handoffs ("talk to a person") email + text ADMIN_ALERT_EMAIL / _PHONE
// through GHL; with ADMIN_ALERT_CONTACT_ID they go to exactly that GHL contact (left unchanged).
const ALERT_CONTACT_ID = (process.env.ADMIN_ALERT_CONTACT_ID || "").trim();
const assistant = createAssistant({
  db, root: ROOT, dataDir: DATA_DIR, campFile: CAMP_FILE, loadContent, store, notify: docs.notify, portalUrl: PORTAL_URL,
  alertEmail: process.env.ADMIN_ALERT_EMAIL || "", alertPhone: process.env.ADMIN_ALERT_PHONE || "", alertContactId: ALERT_CONTACT_ID,
});
const voice = createVoice({ assistant, apiKey: process.env.OPENAI_API_KEY || "" });
const announcements = createAnnouncements(db, DATA_BASE);
const videos = createVideos(db, DATA_BASE);
// Camp staff knowledge assessment, taken after the training videos (content/assessment.json).
const assessment = createAssessment(db, path.join(ROOT, "content", "assessment.json"));
// Training Acknowledgment, signed after passing the assessment; signing notifies the admin dashboard.
const acks = createAcknowledgments({ db, root: ROOT, base: DATA_BASE, notify: docs.notify, store });
// What goes on their acknowledgment form: training completion date (when they finished the
// training videos, else when they passed) and their passing assessment score.
function ackDetails(contact) {
  const pass = assessment.attempts(contact.id).find((t) => t.passed);
  const watched = db.prepare("SELECT MAX(watched_at) AS at FROM training_progress WHERE contact_id = ?").get(contact.id).at;
  const done = watched || pass?.submittedAt;
  return {
    name: `${contact.firstName} ${contact.lastName}`.trim(), role: "Camp Staff", location: contact.fields.portal__location || "",
    trainingDate: done ? new Date(done).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" }) : "",
    score: pass ? `${pass.score} / ${pass.total} (${pass.percent}%)` : "",
  };
}
// Camp staff must watch every training video in the portal before the assessment (and the steps
// after it) open, whatever GHL's onboarding status says. Only while no videos are uploaded yet does
// GHL's "Training Complete" count. Someone who already passed the assessment has finished training:
// videos an admin uploads (or replaces) afterwards don't lock them out again.
function trainingDone(contact) {
  if (assessment.passed(contact.id)) return true;
  const list = videos.trainingFor("Camp Staff", contact.id);
  if (list.length) return list.every((v) => v.watched);
  return Math.max(0, ONBOARDING.indexOf(contact.fields.portal__onboarding_status || "Not Started")) >= ONBOARDING.indexOf("Training Complete");
}
// Reminders and announcements by email / SMS. Test mode (the default) sends them all to the
// ADMIN_ALERT_EMAIL / ADMIN_ALERT_PHONE test contact instead of parents.
const outreach = createOutreach({ db, store, apiKey: process.env.OPENAI_API_KEY || "", portalUrl: PORTAL_URL,
  testEmail: process.env.ADMIN_ALERT_EMAIL || "", testPhone: process.env.ADMIN_ALERT_PHONE || "", testContactId: ALERT_CONTACT_ID, live: LIVE });
const meals = createMeals(db);
const enrollments = createEnrollments(db);
const live = createLive();
const parentAccounts = createParentAccounts({ store, db, mayChange });
const admin = createAdmin({ store, db, live, parentAccounts, meals, enrollForm, campFile: CAMP_FILE, clientIp, enrollments, enrollmentSettings: () => enrollmentSettings(ROOT), base: DATA_BASE, docs, oppSync, assistant, announcements, outreach, videos, assessment, acks, root: ROOT, portalUrl: PORTAL_URL, printLinks: PRINT_CODES, send, readBody, readJson });

// GHL allows several contacts with the same email. Sign-in uses the one that matters: on the Parent
// tab, the contact with the Winter Camp 2026 "Paid (won)" opportunity (that's where documents and
// the invite live); otherwise one whose Portal - Role matches the tab, then any with a role.
async function findPortalContact(email, picked) {
  let all = [];
  try { all = (await store.findAllByEmail(email)).filter(Boolean); }
  catch (err) { console.error(`  Contact search for ${email} failed (${err.message}); using GHL's duplicate lookup.`); }
  if (all.length <= 1) return all[0] || (await store.findByEmail(email));
  let chosen = null;
  if (picked === "parent") {
    for (const c of all) if (await docs.paidOpportunity(c.id).catch(() => null)) { chosen = c; break; }
  }
  chosen ||= all.find((c) => roleOf(c) === picked) || all.find((c) => roleOf(c))
    || (picked === "parent" && all.find((c) => (c.tags || []).includes(PORTAL_PARENT_TAG))) || all[0];
  console.log(`  ${all.length} GHL contacts share ${email} (${all.map((c) => c.id).join(", ")}); signing in with ${chosen.id}.`);
  return chosen;
}

// Parents may only sign in with an email on a Winter Camp 2026 "Paid (won)" opportunity: the
// opportunity's contact email, or else its Parent Email field. Filtered on the stage, not status
// (paid opportunities are still "open" in GHL). Throws if GHL can't be reached.
const OPP_PARENT_EMAIL = "23R9W4tgFxSMraNsjro5";
async function hasPaidOpportunity(email) {
  const opps = await searchPaid(store, { q: email });
  return opps.some((o) => (normEmail(o.contactEmail) === email
    || normEmail(o.customFields.find((cf) => cf.id === OPP_PARENT_EMAIL)?.value) === email));
}
const NOT_PAID = "Please enter correct email id.";
// A parent an admin removed from Winter Camp 2026 (admin Parents → Delete / Remove from camp).
const removedParent = (contactId) => !!db.prepare("SELECT 1 FROM parent_access WHERE contact_id = ? AND removed_at IS NOT NULL").get(contactId);
const NOT_STAFF = { staff: "Incorrect email. Please sign in with the email Blackmon Tutoring added you with as camp staff.",
  tutor: "Incorrect email. Please sign in with the email Blackmon Tutoring added you with as a tutor." };

// The GHL "Portal - Winter Camp 2026 Enrollment Form": a GHL workflow copies the answers onto the
// parent's Winter Camp 2026 opportunity, so a filled Camp Session means the form was received.
const ENROLL_FIELDS = { session: "lmjPhe7MPyK2Cl8tfgLS", location: "coYVcHIc7JCJTsuxbAgo", early: "2p2kAPhTfFprkKT85HMq", late: "nBeBDzuz65plpDvFOU55",
  transport: "JAEUtXidfYfzoPT9ElE3", lunch: OPP_FIELDS.lunch, child: OPP_FIELDS.child, age: "ifkdoMOs26DdZS1ZCuda" };
// oppField reads fieldValue (GET by id) and fieldValueString / fieldValueNumber (search); empty, null
// and undefined all count as not filled.
function enrollmentStatus(opp) {
  const v = Object.fromEntries(Object.entries(ENROLL_FIELDS).map(([k, id]) => [k, String(oppField(opp, id) ?? "").trim()]));
  return { found: !!opp, opportunityId: opp?.id || null, submitted: !!v.session, ...v };
}
// The parent's Winter Camp 2026 opportunity in any stage: by contact id, else by any contact with
// their sign-in email (GHL can hold several). The most recently updated one wins.
const WC26_PIPELINE = "eXOcuRrWabqKkb20C3KC";
async function winterCampOpportunity(contact) {
  const newest = (list) => list.sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0))[0] || null;
  const byId = await store.searchOpportunities({ pipelineId: WC26_PIPELINE, contactId: contact.id });
  if (byId.length) return { opp: newest(byId), matchedBy: "contact id" };
  const others = (await store.findAllByEmail(contact.email)).filter((c) => c && c.id !== contact.id && normEmail(c.email) === normEmail(contact.email));
  const byEmail = (await Promise.all(others.map((c) => store.searchOpportunities({ pipelineId: WC26_PIPELINE, contactId: c.id })))).flat();
  return { opp: newest(byEmail), matchedBy: byEmail.length ? "email" : "none" };
}

// What "Ask Blackmon" knows about the signed-in parent: their own portal data only. No ID or
// payment links; camp team phone numbers only for the voice agent ("who do I call?").
async function parentFacts(contact, { teamPhones = false } = {}) {
  const view = await buildView(contact, store, loadContent());
  if (docs.waiversSigned(contact.id)) view.unlocked = true; // signed in the portal, as on GET /api/me
  const mealStep = view.checklist.find((s) => s.id === "meal");
  if (mealStep) mealStep.done = mealChosen(meals.of(contact).choices);
  const opp = await docs.paidOpportunity(contact.id).catch(() => null);
  const lunch = oppField(opp, OPP_FIELDS.lunch);
  const p = view.plan;
  const pkg = campPackage(opp, contact.fields, loadContent(), OPP_FIELDS.package, OPP_FIELDS.packageAmount);
  return {
    locationName: view.locationName || "",
    parent: `${contact.firstName} ${contact.lastName}`.trim(),
    child: view.child || childOf(contact.fields, opp).name?.value || "",
    camp: view.camp ? `${view.camp.name}, ${view.camp.address}` : "Not chosen yet (set in the enrollment form)",
    lunchIncluded: opp ? (lunchIncluded(lunch) ? "Yes" : "No") : "Unknown",
    dashboardUnlocked: view.unlocked ? "Yes" : "No (unlocks after both waivers are signed in the portal under Documents)",
    enrollmentFormAsks: "Parent/guardian details and home address (the email is the sign-in email and can't be changed), a second parent/guardian (optional); one or two emergency contacts; for each child (siblings can be added): full name, date of birth, age, grade, T-shirt size, allergies, medical conditions, medications during camp, special needs, camp location, weeks, package, lunch (included or packed) and dietary restrictions, early drop-off, late pick-up and transportation; friends to be grouped with; adults allowed to pick up (photo ID is checked); photo/media release; camp policies; typed signature and date. After submitting, the waivers are signed in the portal under Documents (nothing is emailed). It can be updated after submitting.",
    enrollmentSteps: view.checklist.map((s) => `${s.title}: ${s.done ? "done" : `not done${s.status ? ` (${s.status})` : ""}`}`),
    // The package from their paid opportunity, as on the Payment plan page (paid in full); else the
    // contact's payment fields. Empty values are spelled out, so the assistant says what's missing instead of guessing.
    paymentPlan: pkg.set
      ? { program: "Winter Camp 2026", package: pkg.name, tier: pkg.tier, length: pkg.length, packageAmount: pkg.amount ?? "Not in the portal yet",
          paid: pkg.paid ?? "Not in the portal yet", balance: 0, status: "Paid in full", included: pkg.items, lunch: pkg.lunch || undefined }
      : Object.fromEntries(Object.entries({ program: p.program, plan: p.type, total: p.total, paid: p.paid, balance: p.balance, nextDueDate: p.nextDue, nextInstallment: p.nextAmount, installmentsLeft: p.installmentsLeft })
        .map(([k, v]) => [k, v == null || v === "" ? "Not in the portal yet" : v])),
    campDocuments: docs.list(contact.id).map((d) => `${d.title}: ${d.status === "signed" ? "signed" : d.type === "sign" ? "needs signature" : d.status === "new" ? "not opened yet" : "opened"}`),
    thisWeek: view.unlocked && view.week ? view.week : "Shown after the dashboard unlocks",
    campTeam: view.unlocked ? (view.team || []).map((m) => `${m.name} (${m.role})${teamPhones && m.phone ? `, phone ${m.phone}` : ""}`) : "Shown after the dashboard unlocks",
    campOfficePhone: "469-261-1625",
  };
}

// A paid parent's documents. Runs on sign-in, on every portal load, and when the parent opens
// Notifications or the dashboard (force = a fresh GHL lookup). Assigning is idempotent.
const noPaidOppWarned = new Set();
// When the parent became a parent (parent_access.joined_at): saved, else the createdAt of their Winter
// Camp 2026 Paid (won) opportunity, looked up once and saved. null if they have none (older families),
// and then every announcement is shown.
const joinLookups = new Map(); // contactId -> when GHL was last asked and had nothing
async function joinedAtOf(contact) {
  const saved = db.prepare("SELECT joined_at FROM parent_access WHERE contact_id = ?").get(contact.id)?.joined_at;
  if (saved) return saved;
  if (Date.now() - (joinLookups.get(contact.id) || 0) < 10 * 60_000) return null;
  joinLookups.set(contact.id, Date.now());
  const opps = await store.searchOpportunities({ pipelineId: WC26_PIPELINE, stageId: "ef44a5c4-5c0c-47ba-a6c7-e677aca1f0bf", contactId: contact.id }).catch((err) => {
    console.error(`  Joined date for ${contact.email}: GHL search failed: ${err.message}`);
    return [];
  });
  const joined = saveJoinedAt(db, contact.id, opps.map((o) => o.createdAt));
  if (joined) console.log(`  Joined date for ${contact.email}: ${joined} (Winter Camp 2026 opportunity created).`);
  return joined;
}
// Who the parent is for announcements: audience (location) and when they joined.
const announcementParent = async (contact) => ({ contactId: contact.id, location: contact.fields.portal__location || "", joinedAt: await joinedAtOf(contact) });

async function parentDocuments(contact, { force = false } = {}) {
  try {
    const { opp } = await docs.syncContact(contact.id, { force });
    if (!opp && !noPaidOppWarned.has(contact.id)) {
      noPaidOppWarned.add(contact.id);
      console.log(`  Documents: parent ${contact.email} (contact ${contact.id}) has no paid opportunity (PAID_STAGES), so no documents are assigned.`);
    }
    await oppSync.syncOpportunity(opp, contact).catch((err) => console.error(`  Child info sync for ${contact.email} failed: ${err.message}`));
  } catch (err) { console.error(`  Document sync for ${contact.email} failed: ${err.message}`); }
  const list = docs.list(contact.id);
  // Notifications = document notifications the parent hasn't removed + admin announcements.
  // Only announcements sent after they joined (filtered in the query), so the badge and dashboard match.
  const news = announcements.forParent(await announcementParent(contact), outreach.languageOf(contact.id));
  const unread = list.filter((d) => d.status === "new" && !d.noticeDismissed).length + news.filter((a) => !a.read).length;
  return { list, announcements: news, unread };
}

async function sendPdf(res, f, download) {
  let data;
  try { data = await fs.promises.readFile(f.file); } catch { return send(res, 404, { error: "The file is missing." }); }
  res.writeHead(200, {
    "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${f.name.replace(/"/g, "")}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
}

// An announcement attachment (PDF or image). Shown in the browser, or downloaded with ?download=1.
async function sendAttachment(res, f, download) {
  let data;
  try { data = await fs.promises.readFile(f.path); } catch { return send(res, 404, { error: "The file is missing." }); }
  res.writeHead(200, {
    "Content-Type": f.mime, "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
}

// ---------- sign-in codes (in memory) + sessions (in the database, so a restart keeps everyone signed in) ----------
const codes = new Map();    // email -> { hash, contactId, exp, tries, sentAt }
const sessions = createSessions(db, "portal");
const ipHits = new Map();   // ip -> [timestamps]

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const normEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

// The visitor's IP. Behind the host's proxy (TRUST_PROXY) that's the first X-Forwarded-For address;
// otherwise every visitor would look like the proxy and share one rate limit.
function clientIp(req) {
  const fwd = TRUST_PROXY && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "";
}

function rateLimited(ip) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > 15;
}

function getSession(req) {
  const m = /(?:^|;\s*)bt_sid=([a-f0-9]{64})/.exec(req.headers.cookie || "");
  const s = m && sessions.get(m[1]);
  return s ? { sid: m[1], contactId: s.subject, exp: s.exp } : null;
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 64 * 1024);
  try { return JSON.parse(buf.toString("utf8") || "{}"); } catch { return {}; }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };

function serveFile(res, base, rel) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return send(res, 404, "Not found");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

// DEV_ALLOW_ANY_EMAIL=1 only: create the contact, or give an existing one with no Portal - Role
// the test setup for the tab the person picked, so any email can sign in.
async function setUpTestContact(email, contact, picked) {
  const role = TEST_ROLES[picked] || TEST_ROLES.parent;
  const values = { portal__role: role, portal__access_granted: "Yes" };
  if (role === "Parent" || role === "Camp Staff") values.portal__location = "Little Elm";
  if (role === "Camp Staff" || role === "Tutor") Object.assign(values, { portal__jordan_approved: "Yes", portal__onboarding_status: "Training" });

  if (contact) {
    await store.updateFields(contact.id, values);
    await store.addTags(contact.id, ["portal-test"]);
    console.log(`  DEV_ALLOW_ANY_EMAIL: set up existing contact ${email} as ${role} (tagged portal-test).`);
    return store.getContact(contact.id);
  }
  const created = await store.createContact(email, values, ["portal-test"]);
  console.log(`  DEV_ALLOW_ANY_EMAIL: created contact ${email} as ${role} (tagged portal-test).`);
  return created;
}

// ---------- API ----------
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const ip = clientIp(req);

  if (route === "GET /api/status") {
    return send(res, 200, { live: store.live, demoAccounts: store.live ? undefined : store.accounts });
  }

  if (route === "POST /api/auth/start") {
    const { email: raw, role: picked } = await readJson(req);
    const email = normEmail(raw);
    if (!validEmail(email)) return send(res, 400, { error: "Please enter a valid email address." });
    if (rateLimited(ip)) return send(res, 429, { error: "Too many attempts. Please wait a few minutes." });

    // Parent tab (or no tab given): no code, and no test-mode contact setup, unless the email has a
    // paid opportunity. Camp staff and Tutor are unchanged.
    const paidGate = async () => {
      try {
        if (await hasPaidOpportunity(email)) return false;
        if ((await store.findAllByEmail(email).catch(() => [])).some((c) => (c?.tags || []).includes(PORTAL_PARENT_TAG))) return false;
        console.log(`  Sign-in ${email}: not-eligible (no paid opportunity and no portal-parent tag).`);
        send(res, 403, { error: NOT_PAID });
      }
      catch (err) { console.error(`  Paid-parent check for ${email} failed: ${err.message}`); send(res, 502, { error: "Something went wrong, please try again." }); }
      return true; // blocked; the reply has been sent
    };
    if (picked !== "staff" && picked !== "tutor" && (await paidGate())) return;
    // Camp staff and tutors sign in only with the email an admin added them with (admin dashboard →
    // Camp staff / Tutors), on the tab for their role. This holds in test mode too.
    if (picked === "staff" || picked === "tutor") {
      const member = db.prepare("SELECT role FROM staff WHERE email = ? COLLATE NOCASE").get(email);
      if (!member) return send(res, 403, { error: NOT_STAFF[picked] });
      if (member.role !== TEST_ROLES[picked]) {
        const tab = member.role === "Tutor" ? "Tutor" : "Camp staff";
        return send(res, 400, { error: `This email is registered as ${tab === "Tutor" ? "a tutor" : "camp staff"}. Please use the ${tab} tab.` });
      }
    }

    let contact = await findPortalContact(email, picked);
    if (picked !== "staff" && picked !== "tutor" && contact && removedParent(contact.id)) {
      console.log(`  Sign-in attempt for ${email}: removed from Winter Camp 2026 by an admin.`);
      return send(res, 403, { error: NOT_PAID });
    }
    // A paid parent (Winter Camp 2026 Paid (won), or the portal-parent tag) whose account isn't set up
    // (no invite yet, or Access Granted turned off outside the portal) gets it now, from GHL, instead
    // of silently receiving no code. Parents an admin removed from camp in the portal stay out.
    if (picked !== "staff" && picked !== "tutor") {
      let r;
      try { r = await parentAccounts.ensure(contact); }
      catch (err) {
        console.error(`  Sign-in ${email}: couldn't check or set up the parent account in GHL: ${err.message}`);
        return send(res, 502, { error: "Something went wrong, please try again." });
      }
      console.log(`  Sign-in ${email}: ${r.outcome}${contact ? ` (contact ${contact.id}${r.opportunityId ? `, opportunity ${r.opportunityId}` : ""})` : ""}${r.why ? `: ${r.why}` : ""}.`);
      contact = r.contact;
    }
    // Test mode never re-opens access an admin removed (Portal - Access Granted = No).
    if (ALLOW_ANY_EMAIL && !(contact && roleOf(contact)) && contact?.fields?.portal__access_granted !== "No") contact = await setUpTestContact(email, contact, picked);

    // The tab picked must match the contact's Portal - Role.
    const actual = contact && roleOf(contact);
    if (actual && TEST_ROLES[picked] && picked !== actual) {
      if (ALLOW_ANY_EMAIL) {
        await store.updateFields(contact.id, { portal__role: TEST_ROLES[picked] });
        console.log(`  DEV_ALLOW_ANY_EMAIL: changed ${email} Portal - Role from ${TEST_ROLES[actual]} to ${TEST_ROLES[picked]}.`);
        contact = await store.getContact(contact.id);
      } else {
        const tab = TAB_NAMES[actual];
        return send(res, 400, { error: `This email is registered as a ${tab}. Please use the ${tab} tab.` });
      }
    }

    const prev = codes.get(email);
    if (prev && Date.now() - prev.sentAt < 30_000) return send(res, 200, { ok: true });
    // Same reply whether or not the email exists, so the page can't be used to discover accounts.
    if (contact && roleOf(contact)) {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      codes.set(email, { hash: sha(email + code), contactId: contact.id, exp: Date.now() + 10 * 60_000, tries: 0, sentAt: Date.now() });
      if (PRINT_CODES) console.log(`\n  Sign-in code for ${email}: ${code}   (DEV_PRINT_CODES is on; no email sent)\n`);
      else {
        // The reply stays the same either way (it never says whether an account exists); a failed
        // send is logged with GHL's error.
        try { await store.sendCode(contact, code, LOCAL_LINK_BLOCKED ? "" : PORTAL_URL); console.log(`  Sign-in ${email}: code sent (contact ${contact.id}).`); }
        catch (err) { console.error(`  Sign-in ${email}: send-failed (contact ${contact.id}): ${err.message}`); }
      }
    } else {
      console.log(`  Sign-in attempt for ${email}: no portal contact (needs Portal - Role set in GHL).`);
    }
    return send(res, 200, { ok: true });
  }

  if (route === "POST /api/auth/verify") {
    const { email: raw, code, remember } = await readJson(req);
    const email = normEmail(raw);
    const entry = codes.get(email);
    if (!entry || entry.exp < Date.now()) return send(res, 400, { error: "That code has expired. Request a new one." });
    if (++entry.tries > 5) { codes.delete(email); return send(res, 400, { error: "Too many wrong codes. Request a new one." }); }
    const a = Buffer.from(sha(email + String(code || "").trim()));
    const b = Buffer.from(entry.hash);
    if (!crypto.timingSafeEqual(a, b)) return send(res, 400, { error: "That code isn't right. Check the email and try again." });

    codes.delete(email);
    const maxAge = remember ? 30 * 24 * 3600 : 12 * 3600;
    const sid = sessions.create(entry.contactId, maxAge * 1000);
    // A parent gets their documents as they sign in (fresh lookup; doesn't hold up the sign-in).
    store.getContact(entry.contactId).then((c) => roleOf(c) === "parent" && parentDocuments(c, { force: true }))
      .catch((err) => console.error(`  Document sync at sign-in failed: ${err.message}`));
    return send(res, 200, { ok: true }, { "Set-Cookie": `bt_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${SECURE_COOKIE}` });
  }

  // Demo mode only: stand-in for GHL's invoice payment page
  if (!store.live && route === "GET /api/demo/invoice") {
    const id = url.searchParams.get("id") || "";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <body style="font:16px system-ui;padding:32px;color:#0B1F3F"><h2>Demo invoice</h2>
      <p>This stands in for the GHL payment page. No real money moves.</p>
      <button id="p" style="padding:12px 20px;border:0;border-radius:10px;background:#0B1F3F;color:#fff;font-size:16px">Pay (demo)</button><p id="m"></p>
      <script>p.onclick=async()=>{const r=await fetch("/api/demo/pay",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:${JSON.stringify(id)}})});m.textContent=r.ok?"Paid. You can close this window.":"Already paid or not found.";}</script></body>`);
  }
  if (!store.live && route === "POST /api/demo/pay") {
    const { id } = await readJson(req);
    return send(res, (await store.payDemoInvoice(String(id || ""))) ? 200 : 404, { ok: true });
  }

  if (route === "POST /api/auth/logout") {
    const s = getSession(req);
    if (s) sessions.remove(s.sid);
    return send(res, 200, { ok: true }, { "Set-Cookie": `bt_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE_COOKIE}` });
  }

  // Everything below needs a signed-in person
  const session = getSession(req);
  if (!session) return send(res, 401, { error: "Please sign in." });
  const contact = await store.getContact(session.contactId);
  if (!contact) return send(res, 401, { error: "Please sign in." });
  const role = roleOf(contact);
  // No portal role any more (an admin removed their access: Access Granted = No), or camp staff /
  // tutors no longer on the admin's Camp staff / Tutors page with that role: the session ends.
  if (!role || (role === "parent" && removedParent(contact.id)) || ((role === "staff" || role === "tutor")
    && db.prepare("SELECT role FROM staff WHERE email = ? COLLATE NOCASE").get(normEmail(contact.email))?.role !== TEST_ROLES[role])) {
    sessions.remove(session.sid);
    return send(res, 401, { error: "Please sign in." }, { "Set-Cookie": `bt_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE_COOKIE}` });
  }
  if ((PARENT_ONLY.has(route) && role !== "parent") || (STAFF_ONLY.has(route) && role !== "staff" && role !== "tutor")) {
    return send(res, 403, { error: "This page isn't available for your account." });
  }

  // Camp staff / tutor Settings: their own phone, location and ID proof (lib/admin.js).
  if (url.pathname === "/api/profile" || url.pathname === "/api/profile/id-proof") {
    if (role !== "staff" && role !== "tutor") return send(res, 403, { error: "This page isn't available for your account." });
    return admin.profile(req, res, url, normEmail(contact.email));
  }

  // Live updates for parents (lib/live.js): stays open; the page reloads what an admin changed.
  if (route === "GET /api/events") {
    if (role !== "parent") return send(res, 403, { error: "This page isn't available for your account." });
    return live.connect(req, res, contact.id);
  }

  if (route === "GET /api/me") {
    const content = loadContent();
    const view = await buildView(contact, store, content);
    if (role === "parent") {
      view.documents = await parentDocuments(contact); view.language = outreach.savedLanguage(contact.id);
      // Waivers are signed in the portal: all signed here unlocks the dashboard even before GHL's
      // E-Sign Status catches up.
      if (docs.waiversSigned(contact.id)) {
        view.unlocked = true;
        const step = view.checklist.find((s) => s.id === "waiver");
        if (step) step.done = true;
      }
      // Their saved meal plan is kept in the portal (lib/meals.js), not on the GHL contact.
      view.meals = meals.of(contact).choices;
      const mealStep = view.checklist.find((s) => s.id === "meal");
      if (mealStep) mealStep.done = mealChosen(view.meals);
      // Their own paid Winter Camp 2026 opportunity (by contact id, as for their documents). If GHL
      // can't be reached, campPackage is null and the page shows the contact's payment fields.
      const opp = await docs.paidOpportunity(contact.id, url.searchParams.get("fresh") === "1")
        .catch((err) => { console.error(`  Camp package lookup for ${contact.email} failed: ${err.message}`); return undefined; });
      view.campPackage = opp === undefined ? null : campPackage(opp, contact.fields, content, OPP_FIELDS.package, OPP_FIELDS.packageAmount);
      // Lunch and sports for their package (same rules as the admin Parents list). Sports: GHL's
      // Sports Included, else the last value the admin list saved for this opportunity.
      if (opp) {
        const sportsRaw = yesNo(oppField(opp, OPP_FIELDS.sports)) || db.prepare("SELECT sports FROM opportunity_sports WHERE opportunity_id = ?").get(opp.id)?.sports || "";
        const inc = campInclusions(String(oppField(opp, OPP_FIELDS.tier) ?? "").trim() || view.campPackage?.tier || "", oppField(opp, OPP_FIELDS.lunch), sportsRaw);
        view.inclusions = { lunch: inc.pending ? "Pending enrollment form" : inc.lunch || "", sports: inc.pending ? "Pending enrollment form" : inc.sports || "" };
      }
      // The enrollment step is done once the GHL enrollment form's answers are on their opportunity.
      if (opp !== undefined) {
        view.enrollmentStatus = enrollmentStatus(opp);
        // The dashboard card counts the enrollment-submitted tag too (the form page also checks GHL's submissions).
        if ((contact.tags || []).includes(ENROLLMENT_TAG)) view.enrollmentStatus = { ...view.enrollmentStatus, found: true, submitted: true };
        const enrollStep = view.checklist.find((s) => s.id === "enroll");
        if (enrollStep) enrollStep.done = view.enrollmentStatus.submitted;
      }
      // The enrollment form: this camp's settings, their saved answers, and what their registration
      // already says (package, lunch) to start a new form with.
      const settings = enrollmentSettings(ROOT);
      view.enrollmentForm = {
        settings, saved: enrollments.get(contact.id, settings.tag),
        prefill: { package: view.campPackage?.tier || "", lunch: opp ? (lunchIncluded(oppField(opp, OPP_FIELDS.lunch)) ? "Lunch included" : "") : "" },
      };
    }
    // Camp staff: the knowledge assessment is an onboarding step right after training.
    if (role === "staff" && view.steps) {
      const unlocked = trainingDone(contact), passed = assessment.passed(contact.id);
      const training = view.steps.find((s) => s.id === "training");
      if (training) Object.assign(training, { done: unlocked, go: "#/training", desc: "Watch every training video in the portal. Required before the assessment." }); // the portal videos, not GHL's status
      view.assessment = { unlocked, passed };
      view.steps.splice(view.steps.findIndex((s) => s.id === "training") + 1, 0, {
        id: "assessment", title: "Pass the knowledge assessment", go: unlocked ? "#/assessment" : undefined, done: passed,
        desc: passed ? "You passed the camp counselor knowledge assessment." : unlocked ? "10 questions on your training. You need 80% (8 of 10) to pass." : "Opens after you've watched all your training videos.",
      });
      const ack = acks.signed(contact.id);
      view.acknowledgment = { unlocked: passed, signed: !!ack };
      view.steps.splice(view.steps.findIndex((s) => s.id === "assessment") + 1, 0, {
        id: "acknowledgment", title: "Sign your training acknowledgment", go: passed ? "#/acknowledgment" : undefined, done: !!ack,
        desc: ack ? "Signed. Blackmon has your signed copy." : passed ? "Confirm you've completed the training and understand your responsibilities." : "Opens after you pass the knowledge assessment.",
      });
    }
    return send(res, 200, { ...view, paymentMode: PAYMENT_MODE });
  }

  // A parent's language (sidebar picker or the Ask Blackmon dropdown): used for announcements,
  // reminders and the assistant. Announcements they can already see are translated now, so
  // Notifications shows them in the new language straight away.
  if (route === "POST /api/me/language" && role === "parent") {
    const { language } = await readJson(req);
    outreach.setLanguage(contact.id, language);
    const lang = outreach.languageOf(contact.id);
    const parent = await announcementParent(contact);
    await Promise.all(announcements.missingTranslations(parent, lang).map((a) => outreach.announcementIn(lang, a.title, a.body)
      .then((t) => announcements.addTranslation(a.id, lang, t))
      .catch((err) => console.error(`  Announcement ${a.id}: ${lang} translation failed: ${err.message}`))));
    return send(res, 200, { language: lang, documents: await parentDocuments(contact) });
  }

  // Camp documents (parents only, and only their own: every lookup is by the signed-in contact).
  const dm = /^\/api\/documents(?:\/([\w-]{1,64})(?:\/(file|signed|sign))?)?$/.exec(url.pathname);
  if (dm) {
    if (role !== "parent") return send(res, 403, { error: "This page isn't available for your account." });
    const [, docId, action] = dm;
    if (req.method === "GET" && !docId) {
      const opp = await docs.paidOpportunity(contact.id).catch(() => null);
      const prefill = {
        parentName: `${contact.firstName} ${contact.lastName}`.trim(),
        childName: childOf(contact.fields, opp).name?.value || "", // contact's Child Name first, then the opportunity's
      };
      return send(res, 200, { ...(await parentDocuments(contact, { force: true })), prefill });
    }
    if (req.method === "GET" && action === "file") {
      const f = docs.originalFile(contact.id, docId);
      if (!f) return send(res, 404, { error: "This document isn't in your portal." });
      docs.markViewed(contact.id, docId);
      return sendPdf(res, f, url.searchParams.get("download") === "1");
    }
    if (req.method === "GET" && action === "signed") {
      const f = docs.signedFile(contact.id, docId);
      if (!f) return send(res, 404, { error: "You haven't signed this document yet." });
      return sendPdf(res, f, url.searchParams.get("download") === "1");
    }
    if (req.method === "POST" && action === "sign") {
      let body = {};
      try { body = JSON.parse((await readBody(req, 600 * 1024)).toString("utf8") || "{}"); } catch {}
      try {
        const document = await docs.sign(contact, docId, body, { ip: clientIp(req), userAgent: req.headers["user-agent"] || "" });
        console.log(`  ${contact.email} signed ${docId}`);
        return send(res, 200, { document });
      } catch (err) {
        if (err.httpStatus) return send(res, err.httpStatus, { error: err.message, fields: err.fields });
        throw err;
      }
    }
    return send(res, 405, { error: "Method not allowed" });
  }

  if (route === "POST /api/pay" && role === "parent") {
    // Amount and product always come from the contact in GHL, never from the browser.
    const amount = nextInstallment(contact.fields);
    if (!amount) return send(res, 400, { error: "There's nothing to pay right now." });
    try {
      const program = contact.fields.portal__program;
      if (!program) throw new Error("Contact has no Portal - Program");
      const { invoiceId, url: payUrl } = await store.createInvoice(contact, {
        program, amount, dueDate: dueDateOf(contact.fields.portal__next_due_date), liveMode: PAYMENT_MODE === "live", userId: GHL_USER_ID,
      });
      console.log(`  Invoice ${invoiceId} (${PAYMENT_MODE}) for ${contact.email}: $${amount.toFixed(2)}`);
      return send(res, 200, { url: payUrl, amount });
    } catch (err) {
      console.error(`  Invoice creation failed for ${contact.email}: ${err.message}`);
      return send(res, 502, { error: "We couldn't start the payment, please call 469-261-1625" });
    }
  }

  // Enrollment form page and dashboard card: read fresh from GHL on every visit.
  if (route === "GET /api/enrollment-status" && role === "parent") {
    try {
      // Submitted: the opportunity's Camp Session is filled (GHL workflow), the contact has the
      // enrollment-submitted tag, or GHL has a submission of the form with their email.
      const [{ opp, matchedBy }, form] = await Promise.all([winterCampOpportunity(contact), enrollForm.status(contact)]);
      const status = enrollmentStatus(opp);
      const submitted = status.submitted || form.submitted;
      console.log(`  Enrollment status for ${contact.email}: ${submitted ? `submitted (${[status.submitted && "opportunity Camp Session", form.via].filter(Boolean).join(", ")}${form.submittedAt ? `, ${form.submittedAt}` : ""})` : "not submitted"}; ${opp ? `opportunity ${opp.id} (by ${matchedBy})` : "no Winter Camp 2026 opportunity"}`);
      return send(res, 200, { ...status, found: status.found || form.submitted, submitted, submittedAt: form.submittedAt });
    } catch (err) {
      console.error(`  Enrollment status for ${contact.email} failed: ${err.message}`);
      return send(res, 502, { error: "We couldn't check your enrollment form right now. Please try again in a minute." });
    }
  }

  // Pre-fill for the embedded GHL enrollment form: their GHL contact (GET /contacts/{id}) and Winter
  // Camp 2026 opportunity (lib/enroll-prefill.js). Read only.
  if (route === "GET /api/enrollment-prefill" && role === "parent") {
    try {
      // The contact's saved answers first; where it has none, their latest form submission's (GHL may
      // have saved that on a second contact with the same email).
      const [raw, contactDefs, { opp }, sub] = await Promise.all([store.getContactRaw(contact.id), store.fieldDefinitions("contact"), winterCampOpportunity(contact),
        enrollForm.latestFor(contact.email).catch(() => null)]);
      const p = enrollPrefill({ raw, contactDefs, opp, portalLocation: contact.fields.portal__location || "", submitted: await enrollForm.answersOf(sub) });
      console.log(`  Enrollment prefill for ${contact.email}: ${p.filled} fields (${Object.keys(p.query).join(", ")})${opp ? "" : "; no Winter Camp 2026 opportunity"}.`);
      return send(res, 200, p);
    } catch (err) {
      console.error(`  Enrollment prefill for ${contact.email} failed: ${err.message}`);
      return send(res, 502, { error: "We couldn't load your details right now." });
    }
  }

  if (route === "POST /api/enrollment" && role === "parent") {
    const settings = enrollmentSettings(ROOT);
    const { data, errors } = checkEnrollment(await readJson(req), settings);
    if (Object.keys(errors).length) return send(res, 400, { error: "Please fix the highlighted fields.", fields: errors });
    const first = data.children[0];

    // The first child must match their Winter Camp registration (every submit, including updates). The
    // reply only says which field is wrong, never the registered value. If GHL has nothing to
    // compare with, or can't be reached, the parent isn't blocked and the admin log says so.
    try {
      const reg = await childCheck.registered(contact);
      const { fields, unchecked } = childCheck.compare(reg, first.name, first.age);
      if (Object.keys(fields).length) {
        return send(res, 400, { error: "Please fix the highlighted fields. Need help? Call 469-261-1625.", code: "child_mismatch",
          fields: { ...(fields.child_name ? { "children.0.name": "mismatch" } : {}), ...(fields.childs_age ? { "children.0.age": "mismatch" } : {}) } });
      }
      if (unchecked.length) childCheckWarning(contact, `no ${unchecked.join(" or ")} on their Winter Camp registration${reg.opportunityId ? ` (opportunity ${reg.opportunityId})` : " (no opportunity found)"}, so it wasn't checked.`);
    } catch (err) { childCheckWarning(contact, `couldn't read their registration from GHL (${err.message}), so it wasn't checked.`); }

    // The whole form stays in the portal (admin Roster). Always the signed-in contact; the email is never taken from the form.
    enrollments.save(contact, settings.tag, data, clientIp(req));
    // GHL gets what the portal and its workflows already use: name, phone, the first child, the location and the tag.
    await store.updateContact(contact.id, { firstName: data.parent.firstName, lastName: data.parent.lastName, phone: data.parent.phone },
      { child_name: first.name, childs_age: first.age, portal__location: first.location });
    await store.addTags(contact.id, [ENROLLMENT_TAG]);
    // Copy the child's details onto their Winter Camp 2026 opportunity now (empty fields only).
    // A failure here doesn't fail the form; the next sync fills it in.
    try { await oppSync.syncContact(await store.getContact(contact.id), `${data.parent.firstName} ${data.parent.lastName} (enrollment form)`); }
    catch (err) { console.error(`  Child info sync after enrollment for ${contact.email} failed: ${err.message}`); }
    console.log(`  Enrollment (${settings.tag}) from ${contact.email}: ${data.children.length} ${data.children.length === 1 ? "child" : "children"}.`);
    return send(res, 200, { ok: true });
  }

  // Payment plan page: "Your registration", the line items and totals of the parent's paid
  // "Winter Camp 2026: ..." GHL invoice(s), or their paid order for older payment-link purchases,
  // read fresh from GHL on every visit (lib/receipts.js). The discount code comes from the Winter Camp
  // 2026 opportunity's Discount Code, else the contact's "WC26 Checkout - Discount Code".
  if (route === "GET /api/payment" && role === "parent") {
    let opps, fresh, codeKey;
    try {
      [opps, fresh, codeKey] = await Promise.all([
        store.searchOpportunities({ pipelineId: "eXOcuRrWabqKkb20C3KC", stageId: "ef44a5c4-5c0c-47ba-a6c7-e677aca1f0bf", contactId: contact.id }),
        store.getContact(contact.id),
        store.fieldDefinitions("contact").then((defs) => defs.find((d) => d.id === "NSJnTKck7NA6AdUP7pHK")?.key).catch(() => null),
      ]);
    } catch (err) {
      console.error(`  Payment lookup for ${contact.email} failed: ${err.message}`);
      return send(res, 502, { error: "We couldn't load your payment right now. Please try again in a minute, or call 469-261-1625." });
    }
    const opp = opps.sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0))[0];
    const discountCode = String(oppField(opp, "nT2SuWNGyWH6E5dhWOup") ?? "").trim() || String((codeKey && fresh.fields[codeKey]) ?? "").trim();
    const registrations = await registrationsFor(store, contact.id, discountCode);
    console.log(`  Payment details for ${contact.email}: ${registrations.length ? registrations.map((r) => `${r.source} ${r.number || "?"} paid ${r.totalPaid}`).join(", ") : "no paid invoice or order"}`);
    // Total paid (the opportunity's value, as on the admin Parents page) and the camp location: the
    // opportunity's Camp Location, else the contact's WC26 - Camp Location, else Portal - Location.
    const totalPaid = opp?.value == null || opp.value === "" ? null : Number(opp.value);
    const location = String(oppField(opp, "coYVcHIc7JCJTsuxbAgo") ?? "").trim() || String(fresh.fields.wc26__camp_location || fresh.fields.portal__location || "").trim();
    return send(res, 200, { registrations, totalPaid, discountCode, location });
  }

  if (route === "POST /api/meals" && role === "parent") {
    const body = await readJson(req);
    const values = {};
    for (const m of MEAL_FIELDS) {
      const choice = String(body[m.key] || "");
      const options = await store.fieldOptions(m.key);
      if (choice && !options.includes(choice)) return send(res, 400, { error: `Please pick a ${m.label.toLowerCase()} option from the list.` });
      if (choice) values[m.key] = choice;
      if (m.request) values[m.request] = String(body[m.request] || "").slice(0, 1000);
    }
    if (!MEAL_FIELDS.some((m) => values[m.key])) return send(res, 400, { error: "Choose at least one meal." });
    meals.save(contact, values); // portal only: admins see it on the parent's page (nothing goes to GHL)
    return send(res, 200, { ok: true });
  }

  // Parent Notifications: remove one (x), and mark announcements as seen.
  if (route === "POST /api/notifications/dismiss" && role === "parent") {
    const { kind, id } = await readJson(req);
    const ok = kind === "announcement" ? announcements.dismiss(contact.id, Number(id)) : kind === "document" ? docs.dismissNotice(contact.id, String(id)) : false;
    if (!ok) return send(res, 404, { error: "Notification not found." });
    return send(res, 200, await parentDocuments(contact));
  }
  // A file on an announcement this parent can see.
  const annFile = /^\/api\/announcements\/files\/([\w-]+)$/.exec(url.pathname);
  if (annFile && req.method === "GET" && role === "parent") {
    const f = announcements.file(annFile[1]);
    const a = f?.announcement;
    const parent = a && await announcementParent(contact);
    if (!a || !a.sent_at || !inAudience(a.audience, parent) || !afterJoin(a, parent))
      return send(res, 404, { error: "This file isn't in your portal." });
    return sendAttachment(res, f, url.searchParams.get("download") === "1");
  }
  if (route === "POST /api/announcements/read" && role === "parent") {
    const { ids } = await readJson(req);
    announcements.markRead(contact.id, (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger).slice(0, 200));
    return send(res, 200, await parentDocuments(contact));
  }

  // "Ask Blackmon" chat (parents only; each parent only ever sees their own conversation).
  if (url.pathname.startsWith("/api/chat")) {
    if (role !== "parent") return send(res, 403, { error: "This page isn't available for your account." });
    try {
      if (route === "GET /api/chat") return send(res, 200, { enabled: assistant.enabled, voice: voice.enabled, ...assistant.current(contact.id) });
      if (route === "POST /api/chat/message") {
        const { text, language } = await readJson(req);
        outreach.setLanguage(contact.id, language);
        return send(res, 200, await assistant.ask(contact, await parentFacts(contact), text, language));
      }
      if (route === "POST /api/chat/concern") {
        const { text, language } = await readJson(req);
        return send(res, 200, assistant.concern(contact, await parentFacts(contact), text, language));
      }
      if (route === "POST /api/chat/handoff") {
        const { language } = await readJson(req);
        return send(res, 200, await assistant.handoff(contact, await parentFacts(contact), language));
      }
      if (route === "POST /api/chat/feedback") {
        const { id, value } = await readJson(req);
        assistant.feedback(contact.id, id, value);
        return send(res, 200, { ok: true });
      }
      if (route === "POST /api/chat/new") { assistant.newChat(contact.id); return send(res, 200, { ok: true }); }

      // Talk: the chat with a voice (lib/voice.js). Each spoken turn is transcribed and answered by the
      // chat; the answer is then fetched as audio. The language is the one picked in the chat.
      const voiceFacts = { parent: `${contact.firstName} ${contact.lastName}`.trim() }; // call events only; the conversation already exists or gets these
      if (route === "POST /api/chat/voice/session") {
        const { language } = await readJson(req);
        return send(res, 200, voice.start(contact, voiceFacts, language));
      }
      if (route === "POST /api/chat/voice/turn") {
        const language = url.searchParams.get("language");
        const type = String(req.headers["content-type"] || "");
        if (!type.startsWith("audio/")) return send(res, 400, { error: "Expected a recording." });
        const audio = await readBody(req, MAX_TURN_BYTES);
        outreach.setLanguage(contact.id, language);
        return send(res, 200, await voice.turn(contact, parentFacts(contact), audio, type, language));
      }
      if (route === "GET /api/chat/voice/speak") {
        const language = url.searchParams.get("language");
        const text = url.searchParams.has("greet") ? chatText(language).voiceGreet : assistant.answerText(contact.id, url.searchParams.get("id"));
        if (!text) return send(res, 404, { error: "Not found" });
        return await voice.speak(text, language, res);
      }
      if (route === "POST /api/chat/voice/end") {
        const { language } = await readJson(req);
        return send(res, 200, { message: assistant.logVoice(contact, voiceFacts, language, "event", "Voice call ended") });
      }
    } catch (err) {
      if (err.httpStatus) return send(res, err.httpStatus, { error: err.message });
      throw err;
    }
    return send(res, 404, { error: "Not found" });
  }

  // ----- camp staff / tutors: training videos (uploaded by admins) and their own intro video -----
  if (role === "staff" || role === "tutor") {
    const audience = TEST_ROLES[role]; // "Camp Staff" | "Tutor"
    // Camp staff who passed the assessment have finished training: their videos show as watched,
    // including ones an admin uploaded or replaced after they watched the earlier copies.
    const trainingList = () => {
      const list = videos.trainingFor(audience, contact.id);
      return role === "staff" && assessment.passed(contact.id) ? list.map((v) => ({ ...v, watched: true })) : list;
    };
    try {
      if (route === "GET /api/training") return send(res, 200, { videos: trainingList() });
      const tv = /^\/api\/training\/(\d+)\/(file|watched)$/.exec(url.pathname);
      if (tv && req.method === "GET" && tv[2] === "file") {
        const f = videos.trainingFile(tv[1]);
        if (!f || f.audience !== audience) return send(res, 404, { error: "Video not found." });
        return serveVideo(req, res, f.file, f.mime, f.name);
      }
      if (tv && req.method === "POST" && tv[2] === "watched") {
        const { done } = videos.markWatched(audience, contact.id, tv[1]);
        // Watching moves their GHL onboarding status on (never backwards): Training, then Training Complete.
        const stage = Math.max(0, ONBOARDING.indexOf(contact.fields.portal__onboarding_status || "Not Started"));
        const next = done ? "Training Complete" : "Training";
        if (stage < ONBOARDING.indexOf(next)) {
          await store.updateFields(contact.id, { portal__onboarding_status: next })
            .catch((err) => console.error(`  Training: couldn't set ${contact.email} to ${next} in GHL: ${err.message}`));
        }
        return send(res, 200, { done, videos: trainingList() });
      }
      if (role === "staff" && (route === "GET /api/assessment" || route === "POST /api/assessment")) {
        const unlocked = trainingDone(contact);
        if (req.method === "POST") {
          if (!unlocked) return send(res, 403, { error: "Please watch all your training videos first." });
          if (assessment.passed(contact.id)) return send(res, 409, { error: "You've already passed the assessment." });
          const { answers } = await readJson(req);
          const attempt = assessment.submit({ contactId: contact.id, email: normEmail(contact.email),
            name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") }, answers);
          console.log(`  Assessment: ${contact.email} scored ${attempt.score}/${attempt.total} (${attempt.passed ? "pass" : "retake"})`);
          return send(res, 200, { attempt, attempts: assessment.attempts(contact.id) });
        }
        return send(res, 200, { unlocked, ...(unlocked ? assessment.questions() : {}), attempts: assessment.attempts(contact.id) });
      }
      if (role === "staff" && url.pathname.startsWith("/api/acknowledgment")) {
        const passed = assessment.passed(contact.id);
        if (route === "GET /api/acknowledgment/signed") {
          const f = acks.file(contact.id);
          return f ? sendPdf(res, f, url.searchParams.get("download") === "1") : send(res, 404, { error: "You haven't signed the acknowledgment yet." });
        }
        if (route === "GET /api/acknowledgment") {
          return send(res, 200, { title: ACK_TITLE, unlocked: passed, statement: ACK_STATEMENT, details: passed ? ackDetails(contact) : null, signed: acks.signed(contact.id) });
        }
        if (route === "POST /api/acknowledgment") {
          if (!passed) return send(res, 403, { error: "Please pass the knowledge assessment first." });
          let body = {};
          try { body = JSON.parse((await readBody(req, 600 * 1024)).toString("utf8") || "{}"); } catch {}
          try {
            const signed = await acks.sign(contact, ackDetails(contact), body, { ip: clientIp(req), userAgent: req.headers["user-agent"] || "" });
            console.log(`  ${contact.email} signed the training acknowledgment`);
            return send(res, 200, { signed });
          } catch (err) {
            if (err.httpStatus) return send(res, err.httpStatus, { error: err.message, fields: err.fields });
            throw err;
          }
        }
      }
      if (route === "GET /api/video") {
        const v = videos.intro(contact.id);
        return send(res, 200, { video: v ? { name: v.name, size: v.size, uploadedAt: v.uploadedAt } : null });
      }
      if (route === "GET /api/video/file") {
        const v = videos.intro(contact.id);
        if (!v) return send(res, 404, { error: "No intro video yet." });
        return serveVideo(req, res, v.file, v.mime, v.name);
      }
      if (route === "POST /api/video") {
        if (role === "staff" && !trainingDone(contact) && !videos.intro(contact.id)) return send(res, 403, { error: "Please watch all your training videos first." });
        const type = String(req.headers["content-type"] || "");
        if (!type.startsWith("video/")) return send(res, 400, { error: "Please choose a video file." });
        const name = decodeURIComponent(String(req.headers["x-file-name"] || "intro-video")).replace(/[^\w.\- ]/g, "_").slice(0, 120);
        // Kept in the portal (admins watch it under Intro videos), and sent to their GHL contact as before.
        const v = await videos.saveIntro(req, { contactId: contact.id, email: normEmail(contact.email), fileName: name });
        // The GHL copy is extra: GHL can refuse it (its "Portal - Intro Video" field may not accept video
        // types, or the file may be over GHL's size limit), and the portal copy is the one admins watch.
        await store.uploadToField(contact.id, "portal__intro_video", { name: v.name, type: v.mime, buffer: await fs.promises.readFile(v.file) })
          .catch((err) => console.error(`  Intro video for ${contact.email} saved in the portal, but GHL refused its copy: ${err.message}`));
        // Never moves them backwards (a replacement video after "Group/Wise Link Sent" keeps that status).
        if (Math.max(0, ONBOARDING.indexOf(contact.fields.portal__onboarding_status || "Not Started")) < ONBOARDING.indexOf("Video Submitted")) {
          await store.updateFields(contact.id, { portal__onboarding_status: "Video Submitted" });
        }
        return send(res, 200, { ok: true });
      }
    } catch (err) {
      if (err.httpStatus) return send(res, err.httpStatus, { error: err.message });
      throw err;
    }
  }

  return send(res, 404, { error: "Not found" });
}

async function importPart(req, res, url) {
  const token = process.env.IMPORT_TOKEN || "", given = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1] || "";
  const same = token.length >= 24 && given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!same) return send(res, 404, { error: "Not found" });
  const part = Number(url.searchParams.get("part")), of = Number(url.searchParams.get("of"));
  if (!Number.isInteger(part) || !Number.isInteger(of) || part < 1 || part > of || of > 200) return send(res, 400, { error: "part / of" });
  const dir = path.join(DATA_BASE, "import-parts");
  fs.mkdirSync(dir, { recursive: true });
  const chunks = [];
  for await (const c of req) chunks.push(c);
  fs.writeFileSync(path.join(dir, String(part).padStart(3, "0")), Buffer.concat(chunks));
  const have = fs.readdirSync(dir).length;
  console.log(`  Import: received part ${part} of ${of} (${(Buffer.concat(chunks).length / 1e6).toFixed(1)} MB).`);
  if (have < of) return send(res, 200, { ok: true, received: have, of });
  const archive = path.join(DATA_BASE, "import.tgz");
  fs.writeFileSync(archive, Buffer.concat(fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f)))));
  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", STAGING]);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(archive, { force: true });
  console.log(`  Import: all ${of} parts in and unpacked; restart the service to use the imported data.`);
  return send(res, 200, { ok: true, unpacked: fs.readdirSync(STAGING) });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // For the host's health check: the server is up and its database answers.
  if (url.pathname === "/health") {
    try { db.prepare("SELECT 1").get(); return send(res, 200, { ok: true }); }
    catch (err) { return send(res, 503, { ok: false, error: err.message }); }
  }
  // One-time data import for moving hosts: only while IMPORT_TOKEN is set (remove it afterwards).
  // PUT /_import?part=N&of=M with the token as a Bearer; body = part N (1..M) of the archive from
  // scripts/export-data.mjs. When every part is in, it's unpacked into import-staging; restart the
  // service and it's put in place (above).
  if (url.pathname === "/_import" && req.method === "PUT") return importPart(req, res, url);
  // Production: HTTPS only. The host's proxy terminates TLS and says how the visitor came in.
  if (PRODUCTION && req.headers.host && req.headers.host !== CANONICAL_HOST) {
    res.writeHead(301, { Location: `${PORTAL_URL}${req.url}` });
    return res.end();
  }
  if (PRODUCTION && req.headers["x-forwarded-proto"] === "http") {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    return res.end();
  }
  if (PRODUCTION) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  try {
    if (url.pathname.startsWith("/api/admin/")) return await admin.api(req, res, url);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return serveFile(res, PUBLIC, "admin.html");
    if (url.pathname.startsWith("/img/")) return serveFile(res, IMAGES, url.pathname.slice(5));
    if (url.pathname.startsWith("/logo/")) return serveFile(res, LOGOS, url.pathname.slice(6));
    if (url.pathname === "/" || !path.extname(url.pathname)) return serveFile(res, PUBLIC, "index.html");
    return serveFile(res, PUBLIC, url.pathname.slice(1));
  } catch (err) {
    // "fetch failed" alone doesn't say what failed: add the request and the network cause.
    const cause = err.cause ? ` (${[err.cause.code, err.cause.hostname || err.cause.message].filter(Boolean).join(" ")})` : "";
    console.error(`  Error on ${req.method} ${url.pathname}: ${err.message}${cause}`);
    if (!res.headersSent) send(res, err.status === 413 ? 413 : 502, { error: err.status === 413 ? "That file is too big (200 MB max)." : "Something went wrong talking to GHL. Please try again." });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Blackmon Portal running on port ${PORT}${PORTAL_URL.startsWith("http://localhost") ? ` (http://localhost:${PORT})` : `, served at ${PORTAL_URL}`}`);
  console.log(store.live
    ? "  Data: LIVE from GoHighLevel"
    : "  Data: DEMO (add GHL_TOKEN or GHL_API_KEY to app/.env for live GHL data)\n  Demo sign-ins: " + store.accounts.map((a) => `${a.email} (${a.role})`).join(", "));
  console.log(`  Sign-in codes: ${PRINT_CODES ? "printed here in the terminal" : "emailed through GHL"}`);
  console.log(`  Admin dashboard: ${PORTAL_URL.startsWith("http://localhost") ? `http://localhost:${PORT}` : PORTAL_URL}/admin`);
  if (!/^https:\/\//.test(PORTAL_URL)) console.log(`  Emailed links use PORTAL_URL=${PORTAL_URL}. Set PORTAL_URL to the https address before going live${LOCAL_LINK_BLOCKED ? " (production: portal invites are refused and sign-in code emails go without the link until then)" : " (invites are still sent, but parents can't open the link)"}.`);
  console.log(`  Ask Blackmon chat: ${assistant.enabled ? `on (${assistant.provider}${assistant.provider === "OpenAI" ? "; add ANTHROPIC_API_KEY to use Claude" : ""}; Talk's speech uses OpenAI${voice.enabled ? "" : ", so Talk is off until OPENAI_API_KEY is set"})` : "off (add ANTHROPIC_API_KEY to app/.env)"}${assistant.enabled && !process.env.ADMIN_ALERT_EMAIL ? "; set ADMIN_ALERT_EMAIL / ADMIN_ALERT_PHONE for handoff alerts" : ""}`);
  console.log(outreach.live ? "  Parent reminders & announcements: LIVE (emails and texts go to parents)\n"
    : `  Parent reminders & announcements: TEST mode, emails and texts go to ${outreach.testEmail || "(no ADMIN_ALERT_EMAIL set)"} (PARENT_MESSAGES=live to message parents)\n`);
  assistant.warm();
  if (ALLOW_ANY_EMAIL) {
    console.log("  ************************************************************************");
    console.log("  WARNING: DEV_ALLOW_ANY_EMAIL=1 (testing only)");
    console.log("  Any email that requests a code gets a GHL contact created or updated,");
    console.log("  with a Portal - Role and the portal-test tag. Set it to 0 before going live.");
    console.log("  ************************************************************************\n");
  }
});
