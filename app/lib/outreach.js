// Messages to parents from the admin dashboard: missing-step reminders and announcements.
// - Each parent's language: the one they picked in the Ask Blackmon chat (English if they never did).
// - Admins write in English; the OpenAI model translates (cached, so the same text is translated once).
// - Email and SMS go through GHL Conversations; every send is logged in outreach_log.
//
// PARENT_MESSAGES=test (the default) sends every email/SMS to the test contact (ADMIN_ALERT_EMAIL /
// ADMIN_ALERT_PHONE) instead of the parent, labelled with who it was meant for. Only
// PARENT_MESSAGES=live reaches parents.

import crypto from "node:crypto";
import OpenAI from "openai";
import { noteAiError, noteAiOk } from "./aistatus.js";
import { LANGS, LANG_EN, chatLang } from "../public/chat-i18n.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const LOCALE = { en: "en-US", es: "es-US", hi: "hi-IN", ur: "ur-PK", ar: "ar", vi: "vi-VN", zh: "zh-CN", fr: "fr-FR" };
const SMS_MAX = 320;

const now = () => new Date().toISOString();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const httpError = (status, message) => Object.assign(new Error(message), { httpStatus: status });

// The reminder, in English; translated per language. {placeholders} are filled in per parent.
const REMINDER = {
  subject: "Reminder: a few camp steps are still open",
  hello: "Hi {name},",
  intro: "A few things are still open for {child}'s Blackmon Winter Camp:",
  your_child: "your child",
  enroll: "Fill in the enrollment form (your child's details and camp location).",
  meal: "Choose your child's lunches, at least 7 days before the first camp day.",
  waiver: "Sign the camp waivers in the portal (Liability Release and Short Game! waiver).",
  payment: "Pay your installment of {amount}, which was due {date}.",
  button: "Open the Blackmon Portal",
  closing: "Questions? Call us at 469-261-1625. Thank you! Blackmon Tutoring",
  sms: "Blackmon Tutoring: Hi {name}, still to do for camp: {steps}. Portal: {url}",
  sms_enroll: "enrollment form",
  sms_meal: "lunch choices",
  sms_waiver: "camp waiver forms",
  sms_payment: "overdue payment",
};
export const REMINDER_STEPS = ["enroll", "meal", "waiver", "payment"];

export function createOutreach({ db, store, apiKey, portalUrl, testEmail, testPhone, testContactId = "", live }) {
  const client = apiKey ? new OpenAI({ apiKey }) : null;
  const cacheGet = (key) => db.prepare("SELECT value FROM kb_cache WHERE key = ?").get(key)?.value ?? null;
  const cacheSet = (key, value) => db.prepare("INSERT INTO kb_cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, value, now());

  // ----- languages -----
  function languageOf(contactId) {
    const pref = db.prepare("SELECT language FROM parent_prefs WHERE contact_id = ?").get(contactId)?.language
      || db.prepare("SELECT language FROM chat_conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1").get(contactId)?.language;
    return chatLang(pref);
  }
  // The language the parent picked, or null if they never did.
  function savedLanguage(contactId) {
    const l = db.prepare("SELECT language FROM parent_prefs WHERE contact_id = ?").get(contactId)?.language;
    return l ? chatLang(l) : null;
  }
  function setLanguage(contactId, code) {
    db.prepare(`INSERT INTO parent_prefs (contact_id, language, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (contact_id) DO UPDATE SET language = excluded.language, updated_at = excluded.updated_at`).run(contactId, chatLang(code), now());
  }

  // ----- translation -----
  // { key: English text } -> the same keys in `lang`. purpose: what the text is, for the translator.
  async function translate(strings, lang, purpose, extra = "") {
    lang = chatLang(lang);
    const key = `tr:${lang}:${sha(JSON.stringify([strings, purpose, extra]))}`;
    const hit = cacheGet(key);
    if (hit) return JSON.parse(hit);
    if (!client) throw httpError(503, "Translation needs OPENAI_API_KEY in .env.");
    const keys = Object.keys(strings);
    const res = await client.chat.completions.create({
      model: MODEL,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: `You translate messages from Blackmon Tutoring (a kids' Winter Camp in Plano and Little Elm, Texas) to parents. Translate each value from English into ${LANG_EN[lang]}${lang === "en" ? " (it's already English: return it unchanged)" : ""}. Warm, clear, simple words a busy parent understands. Keep {placeholders} exactly as they are. Keep names as they are (Blackmon Tutoring, Blackmon Portal, Ask Blackmon, Plano, Little Elm, Short Game!), and keep links, phone numbers, prices and times. A "waiver" is the liability release form a parent signs: use the everyday word parents would recognize for a signed permission/release form, not a word meaning "exemption". ${extra}\nThis is: ${purpose}.` },
        { role: "user", content: JSON.stringify(strings) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "translation", strict: true, schema: {
        type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((k) => [k, { type: "string" }])),
      } } },
    }).catch((err) => {
      if (noteAiError(err)) throw httpError(503, "Translation is down: the OpenAI account has no credits left. Add credits at platform.openai.com → Settings → Billing, then try again.");
      throw err;
    });
    noteAiOk();
    const out = JSON.parse(res.choices[0]?.message?.content || "{}");
    if (keys.some((k) => typeof out[k] !== "string")) throw new Error("the translation came back incomplete");
    cacheSet(key, JSON.stringify(out));
    return out;
  }

  // An announcement in one language: { title, body, sms } (sms: a short text-message version).
  async function announcementIn(lang, title, body) {
    const t = await translate({ title, body, sms: `${title}. ${body}`, button: "Open the Blackmon Portal", attached: "This announcement has an attachment. Open it in the Blackmon Portal, under Notifications.", sms_attached: "Attachment in the portal." },
      lang, "a camp announcement: its title, its message, a text-message (SMS) version, an email button label, and notes that a file is attached",
      `For "sms", don't translate word for word: write the announcement as one text message under ${SMS_MAX - 40} characters that starts with "Blackmon Tutoring:" and keeps every date, time and action the parent needs.`);
    return { title: lang === "en" ? title : t.title, body: lang === "en" ? body : t.body, sms: t.sms.slice(0, SMS_MAX), button: t.button, attached: t.attached, sms_attached: t.sms_attached };
  }

  // ----- messages -----
  const date = (iso, lang) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { month: "long", day: "numeric", timeZone: "UTC" });
  const money = (n, lang) => (n == null ? "" : n.toLocaleString(LOCALE[lang], { style: "currency", currency: "USD" }));

  function emailHtml(lang, { hello, paragraphs = [], list = [], button, closing }) {
    const dir = LANGS[lang]?.dir || "ltr";
    return `<div dir="${dir}" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#0B1F3F;max-width:600px">
      ${hello ? `<p>${esc(hello)}</p>` : ""}
      ${paragraphs.map((p) => `<p style="white-space:pre-wrap">${esc(p)}</p>`).join("")}
      ${list.length ? `<ul style="padding-${dir === "rtl" ? "right" : "left"}:22px">${list.map((li) => `<li style="margin:6px 0">${esc(li)}</li>`).join("")}</ul>` : ""}
      ${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#0B1F3F;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(button.label)}</a></p>` : ""}
      ${closing ? `<p style="color:#5B6B85">${esc(closing)}</p>` : ""}</div>`;
  }

  // The reminder for one parent: their missing steps, in their language.
  // p: { firstName, name, childName, steps (from parentSteps) }
  async function reminderFor(p, lang) {
    const t = await translate(REMINDER, lang, "a reminder email and text message about camp steps a parent hasn't done yet");
    const missing = REMINDER_STEPS.filter((s) => p.steps[s] === false);
    const vars = { name: p.firstName || p.name, child: p.childName || t.your_child, url: portalUrl,
      amount: money(p.steps.overdue?.amount, lang), date: p.steps.overdue ? date(p.steps.overdue.date, lang) : "" };
    return {
      missing,
      subject: t.subject,
      html: emailHtml(lang, {
        hello: fill(t.hello, vars), paragraphs: [fill(t.intro, vars)], list: missing.map((s) => fill(t[s], vars)),
        button: { label: t.button, url: portalUrl }, closing: t.closing,
      }),
      sms: fill(t.sms, { ...vars, steps: missing.map((s) => t[`sms_${s}`]).join(", ") }).slice(0, SMS_MAX),
    };
  }

  // files: how many files are attached (they're only in the portal, so the email and text point there).
  function announcementEmail(lang, a, files = 0) {
    const note = files ? a.attached || "This announcement has an attachment. Open it in the Blackmon Portal, under Notifications." : "";
    const smsNote = files ? ` ${a.sms_attached || "Attachment in the portal."}` : "";
    return {
      subject: a.title,
      html: emailHtml(lang, { paragraphs: [a.body, ...(note ? [`📎 ${note}`] : [])], button: { label: a.button || "Open the Blackmon Portal", url: portalUrl }, closing: "Blackmon Tutoring · 469-261-1625" }),
      sms: a.sms.length + smsNote.length <= SMS_MAX ? a.sms + smsNote : a.sms.slice(0, SMS_MAX - smsNote.length - 1) + "…" + smsNote,
    };
  }

  // ----- sending -----
  let testContactP = null;
  async function testContact() {
    if (!testEmail) throw httpError(409, "Parent messages are in test mode, but there's no test contact. Set ADMIN_ALERT_EMAIL (and ADMIN_ALERT_PHONE for texts) in .env, or PARENT_MESSAGES=live to message parents.");
    testContactP ||= store.ensureAlertContact(testEmail, testPhone, testContactId).catch((err) => { testContactP = null; throw err; });
    return testContactP;
  }

  // Sends one parent's message by email and/or SMS and logs each. In test mode it goes to the test
  // contact instead. p: { contactId, name, email, phone }. Returns { email, sms }: "sent" | "skipped" | "failed".
  async function deliver(p, lang, msg, channels, { kind, ref = null }) {
    const to = live ? { id: p.contactId, email: p.email, phone: p.phone, firstName: p.firstName } : await testContact();
    const tag = `[TEST for ${p.name}${p.email ? ` <${p.email}>` : ""}] `;
    const out = {};
    for (const channel of channels) {
      let status = "sent", error = null, sentTo = channel === "email" ? to.email : to.phone || testPhone || "";
      try {
        if (channel === "email") {
          if (!p.email) { status = "skipped"; error = "No email on the contact"; }
          else await store.sendEmail(to, live ? msg.subject : tag + msg.subject,
            live ? msg.html : `<p style="font-family:Arial;background:#FFF4D6;padding:10px">${esc(tag)} PARENT_MESSAGES=test, so this came to you instead of the parent.</p>${msg.html}`);
        } else if (channel === "sms") {
          if (!p.phone) { status = "skipped"; error = "No phone on the contact"; }
          else if (!live && !testPhone) { status = "skipped"; error = "Test mode: no ADMIN_ALERT_PHONE to text"; }
          else await store.sendSms(to, live ? msg.sms : tag + msg.sms);
        }
      } catch (err) {
        status = "failed"; error = err.body?.message || err.message;
        console.error(`  Outreach: ${kind} ${channel} for ${p.email || p.contactId} failed: ${error}`);
      }
      db.prepare("INSERT INTO outreach_log (contact_id, kind, ref, channel, language, sent_to, status, error, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(p.contactId, kind, ref == null ? null : String(ref), channel, lang, sentTo, status, error, now());
      out[channel] = status;
    }
    return out;
  }

  // When each parent last got a reminder that was actually sent.
  function lastReminded() {
    return new Map(db.prepare("SELECT contact_id, MAX(at) AS at FROM outreach_log WHERE kind = 'reminder' AND status = 'sent' GROUP BY contact_id").all().map((r) => [r.contact_id, r.at]));
  }

  return {
    live: !!live,
    testEmail: testEmail || "",
    languageOf, savedLanguage, setLanguage, announcementIn, reminderFor, announcementEmail, deliver, lastReminded, testContact,
  };
}
