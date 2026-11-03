// The GHL "Portal - Winter Camp 2026 Enrollment Form" (embedded on #/enroll): whether a parent has
// submitted it, when, and their answers. GHL saves the answers on the contact that submits (matched
// by email), in its contact.wc26__* fields; GHL can hold several contacts with one email, so the
// form's own submissions (GET /forms/submissions) are read too and matched by email.

export const ENROLL_FORM_ID = "2Txp1V54yk7ysmdQadR3";
export const ENROLLMENT_SUBMITTED_TAG = "enrollment-submitted";
// Standard contact fields in a submission (its other answers are keyed by custom field id).
const STANDARD = ["first_name", "last_name", "email", "phone", "address", "city", "state", "postal_code"];

const norm = (e) => String(e || "").trim().toLowerCase();
// A submitted value as text: checkboxes come as arrays, signatures / files as objects.
function text(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (typeof v === "object") return text(v.url ?? v.value ?? v.name ?? "");
  return String(v).trim();
}
// The contact's own enrollment answers (wc26__ fields that aren't the checkout's wc26_checkout__).
export const formAnswersOf = (fields) => Object.fromEntries(Object.entries(fields || {})
  .filter(([k, v]) => /^wc26__/.test(k) && text(v)).map(([k, v]) => [k, v]));

export function createEnrollForm(store) {
  let cache = { at: 0, list: null };

  // Every submission of the form, newest first (kept for at most 60 seconds).
  async function all(force = false) {
    if (!force && cache.list && Date.now() - cache.at < 60_000) return cache.list;
    cache = { at: Date.now(), list: await store.formSubmissions({ formId: ENROLL_FORM_ID }) };
    return cache.list;
  }

  // A submission's answers by contact field key ({ wc26__child_1_full_name: "...", first_name: "..." }).
  async function answersOf(sub) {
    if (!sub) return {};
    const defs = await store.fieldDefinitions("contact");
    const keyOf = new Map(defs.map((d) => [d.id, d.key]));
    const out = {};
    for (const [k, v] of Object.entries(sub.others || {})) {
      const key = STANDARD.includes(k) ? k : keyOf.get(k);
      if (key && text(v)) out[key] = text(v);
    }
    return out;
  }

  // The newest submission for this email (fresh from GHL), or null.
  async function latestFor(email) {
    if (!email) return null;
    const list = await store.formSubmissions({ formId: ENROLL_FORM_ID, q: email });
    return list.find((s) => norm(s.email || s.others?.email) === norm(email)) || null;
  }

  // Newest submission per email, from one read of all submissions (Roster, many parents at once).
  async function latestByEmail(force = false) {
    const map = new Map();
    for (const s of await all(force)) {
      const e = norm(s.email || s.others?.email);
      if (e && !map.has(e)) map.set(e, s);
    }
    return map;
  }

  // Submitted = the contact has the enrollment-submitted tag, or GHL has a submission with their
  // email. submittedAt: that submission's time (null if only the tag says so).
  async function status(contact) {
    const sub = await latestFor(contact.email).catch((err) => {
      console.error(`  Enrollment form: couldn't read submissions for ${contact.email}: ${err.message}`);
      return null;
    });
    const tagged = (contact.tags || []).includes(ENROLLMENT_SUBMITTED_TAG);
    return { submitted: tagged || !!sub, submittedAt: sub?.createdAt || null, submission: sub, via: sub ? "submission" : tagged ? "tag" : null };
  }

  return { all, answersOf, latestFor, latestByEmail, status };
}
