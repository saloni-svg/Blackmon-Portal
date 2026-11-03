// "Ask Blackmon": the parent Q&A chat (retrieval-augmented generation) and its "talk to a person"
// handoff.
//
// 1. Knowledge base: content/camp.json split into labelled sections, plus the text of every PDF in
//    content/documents.json (read once by the AI model, cached by file hash in kb_cache).
// 2. Retrieval: every section is embedded locally with a multilingual sentence-embedding model
//    (paraphrase-multilingual-MiniLM-L12-v2 via transformers.js, cached by text hash), so a question
//    in any of the chat languages finds the English camp text. The closest sections win, with a
//    small keyword boost. If the model can't load, keyword scoring alone is used.
// 3. Answer: the AI model gets the picked sections plus the parent's own portal data, must answer only
//    from them, cites what it used, and replies in the chosen language (JSON output that also
//    carries English versions for the admin view and a "wants a person" flag).
// The index rebuilds itself when camp.json, documents.json or a document PDF changes.
//
// The AI model is Claude (Anthropic) when ANTHROPIC_API_KEY is set, otherwise OpenAI. Talk's speech
// to text and spoken voice are always OpenAI (lib/voice.js): Claude doesn't do audio.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { LANG_EN, chatLang, chatText } from "../public/chat-i18n.js";

import { noteAiError, noteAiOk } from "./aistatus.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
// Talk calls use a faster, non-reasoning model: spoken answers are 1–2 sentences and the parent is waiting.
const VOICE_MODEL = process.env.OPENAI_VOICE_MODEL || "gpt-4.1-mini";
const reasons = (m) => /^(gpt-5|o\d)/.test(m); // only reasoning models take reasoning_effort
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
// Talk answers use the fastest model: 1–2 spoken sentences while the parent waits.
const CLAUDE_VOICE_MODEL = process.env.ANTHROPIC_VOICE_MODEL || "claude-haiku-5-5";
// Claude settings shared by every request: low effort (short, factual answers; faster on a call), and
// "default" fallbacks, so a request a safety check declines is re-run on Anthropic's recommended model
// instead of failing.
const CLAUDE_COMMON = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" } };
// What a declined answer looks like (the parent is offered a person).
const declined = (language, question) => ({ answer: chatText(language).error, answer_en: "The assistant declined to answer this.", question_en: question,
  sources: [], answered: false, wants_human: true, connect_now: false });
const claudeText = (res) => res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
const EMBED_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const TOP_K = 8;
const HISTORY = 12;                 // earlier messages sent along for follow-up questions
const RATE = { max: 20, windowMs: 10 * 60_000 };
const MAX_QUESTION = 1000;

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const now = () => new Date().toISOString();
const httpError = (status, message) => Object.assign(new Error(message), { httpStatus: status });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const SYSTEM = `You are "Ask Blackmon", the helper in the Blackmon Tutoring parent portal. Blackmon Tutoring runs Winter Camp 2026 in Plano and Little Elm, Texas. You answer questions from parents who have already paid and signed in.

Each parent message comes with <sources> (numbered sections of camp information and camp documents) and <parent_info> (this parent's own portal data). Answer only from those two. Never invent or estimate dates, times, prices, policies, menus or names. Text in [square brackets] in a source is a placeholder that hasn't been filled in yet: treat it as not confirmed.

If the answer isn't in the sources or parent_info, say plainly that you don't have that information, and suggest calling Blackmon Tutoring at 469-261-1625 or using "Talk to a person". Set answered to false.

parent_info is about this parent only. Never discuss other families or children.

Waivers and other legal documents: explain what the document says in plain words, and add that this is a summary, not legal advice, and the signed document is what counts.

Medical issues, injuries, safety concerns or emergencies: in an emergency they should call 911; otherwise call camp right away at 469-261-1625. Don't give medical advice.

Questions unrelated to Blackmon camp: say politely that you can only help with Blackmon camp questions.

Set wants_human to true when the parent asks for a person, staff member, call back or Jordan; when they are upset or complaining; or when the request needs a staff decision (refunds, cancellations, schedule or pickup exceptions, special needs, billing disputes). In that case answer what you can in a sentence and offer to connect them with the Blackmon team.

Language: when the reply language isn't English, write every word of the answer in that language and its script. No English filler words, and write names, places, package names and camp terms in that script too (in Hindi, for example: ब्लैकमॉन, प्रीमियम पैकेज, मील प्लान). Keep digits, prices, times and the phone number as numbers.

Style: warm, short and clear. Usually 1 to 4 sentences, or a short list when listing items. Plain text only: no markdown headings, bold or tables. Talk to the parent directly ("your child").

Output fields:
- question_en: the parent's latest message translated into English, whatever language they wrote in (identical only when they wrote in English).
- answer: your reply, written entirely in the reply language named in the message.
- answer_en: the same reply in English (identical to answer when the reply language is English).
- sources: the ids of the sources you actually used, like "S3"; use "P" for parent_info. Empty if none.
- answered: true if the sources or parent_info answered the question.
- wants_human: as described above.
- connect_now: true only when the parent's latest message asks to be connected to a person right now, or says yes to your offer to connect them with the Blackmon team.`;

// Extra instructions when the question was spoken on a Talk call (the answer is read out loud).
// A separate system message after SYSTEM, so SYSTEM's prompt caching still applies.
const VOICE_SYSTEM = `This is a Talk call: the parent spoke the question and your answer is read aloud by text-to-speech. These rules override the Style rules above:
- At most 2 short sentences, under 35 words. Answer only what was asked; no extra facts. The parent can ask for more.
- A broad question ("tell me about the camp", "what's the winter camp?") gets a one-sentence overview, then ask which part they'd like: dates and hours, packages and prices, activities, or lunch. Don't list everything.
- No lists, dashes, ranges, symbols, quotes or links: say "from nine to four", "December 21 to January 1", "five hundred dollars" (in the reply language).
- Never mention buttons or "Talk to a person". When the rules above say to offer a person (wants_human), say you can send this to the Blackmon team now. Don't offer it otherwise.
- Don't quote portal values; say "your balance isn't in the portal yet".`;

const SCHEMA = {
  type: "object",
  properties: {
    question_en: { type: "string", description: "The parent's latest message translated into English (never left in another language)." },
    answer: { type: "string", description: "The reply, written entirely in the reply language." },
    answer_en: { type: "string", description: "The same reply translated into English." },
    sources: { type: "array", items: { type: "string" }, description: "Ids of the sources used, e.g. S3, or P for parent_info." },
    answered: { type: "boolean", description: "True if the sources or parent_info answered the question." },
    wants_human: { type: "boolean", description: "True if the parent should be offered a person." },
    connect_now: { type: "boolean", description: "True only if the parent asks to be connected to a person now or says yes to the offer." },
  },
  required: ["question_en", "answer", "answer_en", "sources", "answered", "wants_human", "connect_now"],
  additionalProperties: false,
};

// ---------- knowledge base ----------

// camp.json as labelled sections. Each one is { source, title, text }.
function contentChunks(c) {
  const out = [];
  const add = (source, title, lines) => {
    const text = lines.filter(Boolean).join("\n").trim();
    if (text) out.push({ source, title, text: `${title}\n${text}` });
  };
  const w = c.winterCamp;
  if (w) {
    add("Camp info", "Overview", [w.title, w.tagline, w.intro, `Dates: ${w.dates}`, `Operating days: ${w.operatingDays}`, w.closed, `Ages: ${w.ages}`, `Camp hours: ${w.hours}`, `Location: ${w.location}`]);
    const ec = w.extendedCare;
    if (ec) add("Camp info", "Extended care (early drop-off and late pickup)", [`Early care: ${ec.early}`, `Late care: ${ec.late}`, `Fee: ${ec.price}`, ec.note, ec.coverage]);
    for (const a of w.activities || []) add("Camp info", `Activities: ${a.title}`, [a.tagline, a.text, ...(a.items || []), a.note]);
    const s = w.sports;
    if (s) add("Camp info", "Sports & athletics", [s.intro, ...(s.list || []).map((x) => `${x.name}: ${x.text}`), s.included, s.note]);
    // All packages in one section, so a price question finds every option and the notes together.
    add("Camp info", "Packages & pricing", [
      ...(w.packages || []).flatMap((p) => [`${p.name} package${p.recommended ? " (recommended)" : ""}: ${p.price} full camp (all 8 days), ${p.weekly} weekly (any 5 days). ${p.summary}`,
        ...(p.items || []).map((i) => `  - ${i}`), `  - Lunch: ${p.lunch}`]),
      ...(w.packageNotes || []), w.lunchNote]);
    add("Camp info", "Ways to save (offers and discounts)", [...(w.offers || []).map((o) => `${o.title} (${o.amount}): ${o.text}`), w.offersNote]);
    const t = w.transportation;
    if (t) add("Camp info", "Transportation", [t.text, ...(t.prices || []).map((x) => `${x.label}: ${x.price}${x.note ? ` (${x.note})` : ""}`), ...(t.items || [])]);
    for (const x of w.sections || []) add("Camp info", x.title, [x.subtitle, x.text, ...(x.items || []).map((i) => `- ${i}`)]);
  }
  const sc = c.schedule;
  if (sc) {
    add("A day at camp", "Daily schedule (Monday to Friday, Central time)", sc.items.map((i) => {
      const extra = i.extra === "early" ? ` [extra charge ${sc.earlyDropoffPrice}]` : i.extra === "late" ? ` [extra charge ${sc.latePickupPrice}]` : "";
      return `${i.time}: ${i.title}${i.note ? ` (${i.note})` : ""}${extra}`;
    }));
  }
  for (const l of Object.values(c.locations || {})) add("Camp locations", l.name, [`${l.name} address: ${l.address}`]);
  return out;
}

// Splits document text into sections of roughly `max` characters on paragraph breaks.
function splitText(text, max = 900) {
  const out = [];
  let cur = "";
  for (const p of text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    if (cur && cur.length + p.length > max) { out.push(cur); cur = ""; }
    cur = cur ? `${cur}\n\n${p}` : p;
    while (cur.length > max * 1.5) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}

const STOP = new Set("the and for are you your what when where which who how can does do did with from that this have has was will about into than then them they our out any all not but its it's is to of in on at by an a or be my me i we us".split(" "));
const words = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}$]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w));
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export function createAssistant({ db, root, dataDir, campFile, loadContent, store, notify, portalUrl, alertEmail, alertPhone, alertContactId = "" }) {
  const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  let claudeKeyBad = false;
  const client = process.env.OPENAI_API_KEY ? new OpenAI() : null;
  const contentFile = campFile || path.join(root, "content", "camp.json");
  const docsFile = path.join(root, "content", "documents.json");
  const docsDir = path.join(root, "documents");
  const modelsDir = path.join(dataDir, "models");

  const cacheGet = (key) => db.prepare("SELECT value FROM kb_cache WHERE key = ?").get(key)?.value ?? null;
  const cacheSet = (key, value) => db.prepare("INSERT INTO kb_cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, value, now());

  // ----- embeddings (local model, loaded on first use) -----
  let embedderP = null;
  function embedder() {
    embedderP ||= import("@huggingface/transformers")
      .then(({ pipeline, env }) => { env.cacheDir = modelsDir; return pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" }); })
      .catch((err) => { console.error(`  Ask Blackmon: embedding model unavailable (${err.message}); using keyword search.`); return null; });
    return embedderP;
  }
  async function embed(texts) {
    const e = await embedder();
    if (!e) return null;
    return (await e(texts, { pooling: "mean", normalize: true })).tolist();
  }

  // ----- PDF text (the model reads each PDF once; cached by file hash) -----
  async function pdfText(file) {
    const buf = await fs.promises.readFile(file);
    const key = `pdf:${sha(buf)}`;
    const hit = cacheGet(key);
    if (hit != null) return hit;
    const ask = "Transcribe all the text in this document as plain text, in reading order. Put headings and list items on their own lines and separate sections with a blank line. Output only the document's text.";
    if (claude) {
      const res = await claude.beta.messages.create({
        ...CLAUDE_COMMON, model: CLAUDE_MODEL, max_tokens: 16000,
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
          { type: "text", text: ask },
        ] }],
      }).catch((err) => {
        noteAiError(err, "Anthropic");
        if (!client) throw err;
        console.error(`  Ask Blackmon: Claude couldn't read ${path.basename(file)} (${err.status || ""} ${err.message.slice(0, 120)}); using OpenAI.`);
        return null;
      });
      if (res) {
        const text = res.stop_reason === "refusal" ? "" : claudeText(res);
        if (!text) return null;
        noteAiOk("Anthropic");
        cacheSet(key, text);
        return text;
      }
    }
    if (!client) return null;
    const res = await client.chat.completions.create({
      model: MODEL,
      reasoning_effort: "low",
      messages: [{ role: "user", content: [
        { type: "file", file: { filename: path.basename(file), file_data: `data:application/pdf;base64,${buf.toString("base64")}` } },
        { type: "text", text: ask },
      ] }],
    });
    const msg = res.choices[0]?.message;
    const text = (msg?.content || "").trim();
    if (msg?.refusal || !text) return null;
    cacheSet(key, text);
    return text;
  }

  // The answer from Claude: the same system prompts and messages, as JSON matching SCHEMA.
  async function askClaude(messages, voice) {
    const system = messages.filter((m) => m.role === "system").map((m, i) => ({ type: "text", text: m.content,
      ...(i === 0 ? { cache_control: { type: "ephemeral" } } : {}) })); // the fixed system prompt is cached
    const model = voice ? CLAUDE_VOICE_MODEL : CLAUDE_MODEL;
    const { betas, fallbacks, ...common } = CLAUDE_COMMON;
    const res = await claude.beta.messages.create({
      ...common,
      ...(/haiku/.test(model) ? {} : { betas, fallbacks }), // Haiku has no server-side refusal fallback
      output_config: { ...CLAUDE_COMMON.output_config, format: { type: "json_schema", schema: SCHEMA } },
      model,
      max_tokens: 16000,
      system,
      messages: messages.filter((m) => m.role !== "system"),
    }, voice ? { timeout: 15000, maxRetries: 1 } : undefined); // on a call, a stuck request is retried quickly
    noteAiOk("Anthropic");
    if (res.stop_reason === "refusal") return null;
    return JSON.parse(claudeText(res));
  }

  // ----- index -----
  let index = null, indexSig = null, building = null, lastPartial = 0;
  const docDefs = () => { try { return JSON.parse(fs.readFileSync(docsFile, "utf8")).documents || []; } catch { return []; } };
  function signature() {
    const st = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return "-"; } };
    return [st(contentFile), st(docsFile), ...docDefs().map((d) => st(path.join(docsDir, path.basename(d.file))))].join("|");
  }
  async function build(sig) {
    const chunks = contentChunks(loadContent());
    let partial = false;
    for (const d of docDefs()) {
      let text = null;
      try { text = await pdfText(path.join(docsDir, path.basename(d.file))); }
      catch (err) { console.error(`  Ask Blackmon: couldn't read ${d.file} (${err.message}).`); }
      if (!text) { partial = true; continue; }
      splitText(text).forEach((part, i, all) => chunks.push({ source: d.title, title: all.length > 1 ? `${d.title} (part ${i + 1})` : d.title, text: `${d.title}\n${part}` }));
    }
    const missing = [];
    for (const c of chunks) {
      const hit = cacheGet(`emb:${EMBED_MODEL}:${sha(c.text)}`);
      if (hit) c.vec = JSON.parse(hit); else missing.push(c);
    }
    if (missing.length) {
      const vecs = await embed(missing.map((c) => c.text)).catch((err) => { console.error(`  Ask Blackmon: embedding failed (${err.message}).`); return null; });
      if (vecs) missing.forEach((c, i) => { c.vec = vecs[i]; cacheSet(`emb:${EMBED_MODEL}:${sha(c.text)}`, JSON.stringify(vecs[i])); });
    }
    chunks.forEach((c, i) => { c.id = `S${i + 1}`; c.terms = new Set(words(c.text)); });
    index = chunks;
    indexSig = partial ? null : sig; // a partial index (a PDF couldn't be read) is retried, at most every 5 minutes
    if (partial) lastPartial = Date.now();
    console.log(`  Ask Blackmon: indexed ${chunks.length} sections${partial ? " (some documents not readable yet)" : ""}${chunks.some((c) => c.vec) ? "" : ", keyword search only"}.`);
    return index;
  }
  async function ensureIndex() {
    const sig = signature();
    if (index && (sig === indexSig || (indexSig === null && Date.now() - lastPartial < 5 * 60_000))) return index;
    building ||= build(sig).finally(() => { building = null; });
    return building;
  }
  async function retrieve(query) {
    const idx = await ensureIndex();
    const qv = idx.some((c) => c.vec) ? (await embed([query]).catch(() => null))?.[0] : null;
    const terms = words(query);
    return idx
      .map((c) => {
        const kw = terms.length ? terms.filter((t) => c.terms.has(t)).length / terms.length : 0;
        return { c, score: (qv && c.vec ? dot(qv, c.vec) : 0) + 0.3 * kw };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
      .map((x) => x.c);
  }

  // ----- conversations -----
  const rowToMsg = (m) => ({ id: m.id, role: m.role, text: m.text, textEn: m.text_en, sources: m.sources ? JSON.parse(m.sources) : [], answered: m.answered == null ? null : !!m.answered, offerHandoff: !!m.offer_handoff, feedback: m.feedback, at: m.created_at });
  const rowToConv = (c) => c && { id: c.id, status: c.status, language: c.language, parentName: c.parent_name, parentEmail: c.parent_email, parentPhone: c.parent_phone, childName: c.child_name, location: c.location, handoffAt: c.handoff_at, handledAt: c.handled_at, handledBy: c.handled_by, createdAt: c.created_at, closed: !!c.closed };
  const openConv = (contactId) => db.prepare("SELECT * FROM chat_conversations WHERE contact_id = ? AND closed = 0 ORDER BY created_at DESC LIMIT 1").get(contactId);
  const messagesOf = (convId) => db.prepare("SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id").all(convId).map(rowToMsg);
  function addMessage(convId, m) {
    const r = db.prepare(`INSERT INTO chat_messages (conversation_id, role, text, text_en, sources, answered, offer_handoff, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(convId, m.role, m.text, m.textEn ?? null, m.sources ? JSON.stringify(m.sources) : null,
      m.answered == null ? null : m.answered ? 1 : 0, m.offerHandoff ? 1 : 0, now());
    db.prepare("UPDATE chat_conversations SET updated_at = ? WHERE id = ?").run(now(), convId);
    return rowToMsg(db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(r.lastInsertRowid));
  }
  // The parent's open conversation, created on first use with their current details.
  function ensureConv(contact, facts, language) {
    let c = openConv(contact.id);
    if (!c) {
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO chat_conversations (id, contact_id, parent_name, parent_email, parent_phone, child_name, location, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, contact.id, facts.parent || contact.email, contact.email, contact.phone || null,
        facts.child || null, facts.locationName || null, language, now(), now());
      c = db.prepare("SELECT * FROM chat_conversations WHERE id = ?").get(id);
    } else if (c.language !== language) {
      db.prepare("UPDATE chat_conversations SET language = ? WHERE id = ?").run(language, c.id);
      c.language = language;
    }
    return c;
  }

  const hits = new Map(); // contactId -> recent question times
  function rateLimited(contactId) {
    const t = Date.now();
    const list = (hits.get(contactId) || []).filter((x) => t - x < RATE.windowMs);
    if (list.length >= RATE.max) return true;
    list.push(t);
    hits.set(contactId, list);
    return false;
  }

  // ----- admin alerts for "talk to a person" (email + SMS through GHL) -----
  let alertContact = null;
  async function sendAlerts(conv, msgs) {
    if (!alertEmail) { console.log("  Ask Blackmon: ADMIN_ALERT_EMAIL isn't set, so no handoff email/SMS was sent."); return; }
    alertContact ||= await store.ensureAlertContact(alertEmail, alertPhone, alertContactId);
    const link = `${portalUrl}/admin#/chats/${conv.id}`;
    const lang = LANG_EN[conv.language] || "English";
    const rows = msgs.filter((m) => m.role !== "event").map((m) => {
      const who = m.role === "parent" ? esc(conv.parentName) : "Ask Blackmon";
      const en = m.textEn && m.textEn !== m.text ? `<div style="color:#5B6B85;font-size:14px;margin-top:4px">English: ${esc(m.textEn)}</div>` : "";
      return `<tr><td style="padding:10px 0;border-top:1px solid #E3E8F0"><b>${who}</b><div style="white-space:pre-wrap">${esc(m.text)}</div>${en}</td></tr>`;
    }).join("");
    const html = `<div style="font-family:Arial,sans-serif;font-size:16px;color:#0B1F3F;max-width:640px">
      <p><b>${esc(conv.parentName)}</b> asked to talk to a person in the Blackmon Portal chat.</p>
      <table style="font-size:15px;margin:12px 0">
        <tr><td style="padding:2px 14px 2px 0;color:#5B6B85">Email</td><td>${esc(conv.parentEmail)}</td></tr>
        <tr><td style="padding:2px 14px 2px 0;color:#5B6B85">Phone</td><td>${esc(conv.parentPhone || "Not on file")}</td></tr>
        <tr><td style="padding:2px 14px 2px 0;color:#5B6B85">Child</td><td>${esc(conv.childName || "Not on file")}</td></tr>
        <tr><td style="padding:2px 14px 2px 0;color:#5B6B85">Camp</td><td>${esc(conv.location || "Not chosen yet")}</td></tr>
        <tr><td style="padding:2px 14px 2px 0;color:#5B6B85">Language</td><td>${esc(lang)}</td></tr>
      </table>
      <p><a href="${esc(link)}" style="color:#1F6FAE">Open the chat in the admin dashboard</a></p>
      <h3 style="font-family:Georgia,serif;margin:20px 0 4px">Full chat</h3>
      <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table></div>`;
    const sms = `Blackmon Portal: ${conv.parentName} wants to talk to a person (${conv.parentPhone || conv.parentEmail}). Child: ${conv.childName || "-"}. Camp: ${conv.location || "-"}. Chat: ${link}`;
    const results = await Promise.allSettled([
      store.sendEmail(alertContact, `Parent wants to talk to a person: ${conv.parentName}`, html),
      alertPhone ? store.sendSms(alertContact, sms) : Promise.reject(new Error("ADMIN_ALERT_PHONE isn't set")),
    ]);
    results.forEach((r, i) => r.status === "rejected" && console.error(`  Ask Blackmon: handoff ${i ? "SMS" : "email"} failed: ${r.reason?.message || r.reason}`));
  }

  return {
    enabled: !!(claude || client),
    provider: claude ? "Claude" : client ? "OpenAI" : null,
    warm() { if (client) ensureIndex().catch((err) => console.error(`  Ask Blackmon: index build failed (${err.message}).`)); },

    current(contactId) {
      const c = openConv(contactId);
      return { conversation: rowToConv(c), messages: c ? messagesOf(c.id) : [] };
    },

    newChat(contactId) {
      db.prepare("UPDATE chat_conversations SET closed = 1, updated_at = ? WHERE contact_id = ? AND closed = 0").run(now(), contactId);
    },

    // A parent's question -> [their message, the answer]. voice: asked on a Talk call (lib/voice.js),
    // so the answer is written to be spoken, and "yes, connect me" hands the chat to a person
    // straight away (there's no button to press mid-call).
    async ask(contact, facts, input, language, { voice = false } = {}) {
      if (!claude && !client) throw httpError(503, chatText(language).off);
      const question = String(input || "").trim().slice(0, MAX_QUESTION);
      if (!question) throw httpError(400, "Please type a question.");
      if (rateLimited(contact.id)) throw httpError(429, "You've asked a lot of questions in a short time. Please wait a few minutes, or use “Talk to a person”.");
      language = chatLang(language);
      const conv = ensureConv(contact, facts, language);
      const history = messagesOf(conv.id).filter((m) => m.role !== "event").slice(-HISTORY);
      const parentMsg = addMessage(conv.id, { role: "parent", text: question });

      // The last couple of parent messages make the search query, so follow-ups ("and on Friday?") still find the right sections.
      const lastAsked = history.filter((m) => m.role === "parent").slice(-1).map((m) => m.textEn || m.text);
      const found = await retrieve([...lastAsked, question].join("\n"));
      const sourcesXml = found.map((c) => `<source id="${c.id}" title="${esc(`${c.source} · ${c.title}`)}">\n${c.text}\n</source>`).join("\n");
      const { locationName, ...shared } = facts;
      const messages = [
        { role: "system", content: SYSTEM },
        ...(voice ? [{ role: "system", content: VOICE_SYSTEM }] : []),
        ...history.map((m) => ({ role: m.role === "parent" ? "user" : "assistant", content: m.text })),
        { role: "user", content: `<sources>\n${sourcesXml}\n</sources>\n<parent_info>\n${JSON.stringify(shared, null, 1)}\n</parent_info>\nReply language: ${LANG_EN[language]}${voice ? "\nSpoken on a Talk call: at most 2 short sentences." : ""}\n<question>\n${question}\n</question>` },
      ];
      if (messages[voice ? 2 : 1]?.role === "assistant") messages.splice(voice ? 2 : 1, 1);

      let out;
      try {
        if (claude && !claudeKeyBad) {
          // If Claude fails (wrong key, no credits, an outage) and OpenAI is set up, OpenAI answers instead.
          out = await askClaude(messages, voice).then((r) => r || declined(language, question), (err) => {
            if (!client) throw err;
            // A rejected key won't start working: skip Claude until the next restart instead of a failed call every question.
            if (err.status === 401) { claudeKeyBad = true; console.error("  Ask Blackmon: ANTHROPIC_API_KEY was rejected (401); using OpenAI until the server restarts."); }
            noteAiError(err, "Anthropic");
            console.error(`  Ask Blackmon: Claude failed (${err.status || ""} ${err.message.slice(0, 160)}); answering with OpenAI instead.`);
            return null;
          });
        }
        if (!out) {
          // The system prompt comes first and never changes, so OpenAI's automatic prompt caching reuses it.
          const model = voice ? VOICE_MODEL : MODEL;
          const res = await client.chat.completions.create({
            model,
            ...(reasons(model) ? { reasoning_effort: "low" } : {}),
            messages,
            response_format: { type: "json_schema", json_schema: { name: "ask_blackmon_answer", strict: true, schema: SCHEMA } },
          }, voice ? { timeout: 8000, maxRetries: 1 } : undefined); // on a call, a stuck request is retried quickly
          noteAiOk();
          const msg = res.choices[0]?.message;
          if (msg?.refusal) {
            out = declined(language, question);
          } else {
            out = JSON.parse(msg?.content || "");
          }
        }
      } catch (err) {
        console.error(`  Ask Blackmon: answer failed for ${contact.email}: ${err.message}`);
        db.prepare("DELETE FROM chat_messages WHERE id = ?").run(parentMsg.id);
        throw httpError(502, noteAiError(err, claude && !client ? "Anthropic" : "OpenAI") ? chatText(language).unavailable : chatText(language).error);
      }

      if (out.question_en && out.question_en.trim() !== question) {
        db.prepare("UPDATE chat_messages SET text_en = ? WHERE id = ?").run(out.question_en, parentMsg.id);
        parentMsg.textEn = out.question_en;
      }
      // "Yes, connect me" on a call: the handoff's own confirmation is the answer (the model's
      // wording could promise a live transfer, and there isn't one: the team gets back to them).
      if (voice && out.connect_now && conv.status !== "handoff") {
        const h = await this.handoff(contact, facts, language);
        return { conversation: h.conversation, messages: [parentMsg, ...h.messages] };
      }
      const labels = [...new Set((out.sources || []).map((id) => id === "P" ? "Your portal" : found.find((c) => c.id === id)).filter(Boolean)
        .map((c) => (typeof c === "string" ? c : c.source === "Camp info" || c.source === "A day at camp" || c.source === "Camp locations" ? `${c.source} · ${c.title}` : c.source)))];
      const bot = addMessage(conv.id, {
        role: "bot", text: out.answer, textEn: language !== "en" ? out.answer_en : null, sources: out.answered ? labels : [],
        answered: out.answered, offerHandoff: out.wants_human && conv.status !== "handoff",
      });
      if (!out.answered) console.log(`  Ask Blackmon: unanswered question from ${contact.email}: ${out.question_en || question}`);
      return { conversation: rowToConv(openConv(contact.id)), messages: [parentMsg, bot] };
    },

    // "Talk to a person": records it, notifies the admin dashboard, and emails + texts the admin.
    async handoff(contact, facts, language) {
      language = chatLang(language);
      const conv = ensureConv(contact, facts, language);
      if (conv.status === "handoff") return { conversation: rowToConv(conv), messages: [] };
      db.prepare("UPDATE chat_conversations SET status = 'handoff', handoff_at = ?, handled_at = NULL, handled_by = NULL, updated_at = ? WHERE id = ?").run(now(), now(), conv.id);
      db.prepare("UPDATE chat_messages SET offer_handoff = 0 WHERE conversation_id = ?").run(conv.id);
      const event = addMessage(conv.id, { role: "event", text: "Asked to talk to a person" });
      const t = chatText(language);
      const bot = addMessage(conv.id, { role: "bot", text: t.humanDone, textEn: language !== "en" ? chatText("en").humanDone : null });
      const fresh = rowToConv(db.prepare("SELECT * FROM chat_conversations WHERE id = ?").get(conv.id));
      notify("chat_handoff", `${fresh.parentName} wants to talk to a person`, { contactId: contact.id, conversationId: conv.id });
      console.log(`  Ask Blackmon: ${contact.email} asked to talk to a person (chat ${conv.id}).`);
      sendAlerts(fresh, messagesOf(conv.id)).catch((err) => console.error(`  Ask Blackmon: handoff alerts failed: ${err.message}`));
      return { conversation: fresh, messages: [event, bot] };
    },

    // ----- Talk (lib/voice.js) -----
    // The text of one of this parent's answers, to read out; null if it isn't theirs.
    answerText(contactId, messageId) {
      return db.prepare(`SELECT m.text FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id
        WHERE m.id = ? AND m.role = 'bot' AND c.contact_id = ?`).get(Number(messageId), contactId)?.text ?? null;
    },
    // Adds a line to the parent's chat ("Voice call started" / "ended" events).
    logVoice(contact, facts, language, role, text) {
      language = chatLang(language);
      const conv = ensureConv(contact, facts, language);
      const clean = String(text || "").trim().slice(0, 4000);
      if (!clean || !["parent", "bot", "event"].includes(role)) return null;
      return addMessage(conv.id, { role, text: clean });
    },

    feedback(contactId, messageId, value) {
      const v = value === 1 ? 1 : value === -1 ? -1 : null;
      const r = db.prepare(`UPDATE chat_messages SET feedback = ? WHERE id = ? AND role = 'bot'
        AND conversation_id IN (SELECT id FROM chat_conversations WHERE contact_id = ?)`).run(v, Number(messageId), contactId);
      if (!r.changes) throw httpError(404, "Message not found.");
    },

    // ----- admin -----
    conversation(id) {
      const c = db.prepare("SELECT * FROM chat_conversations WHERE id = ?").get(id);
      if (!c) return null;
      return { conversation: { ...rowToConv(c), contactId: c.contact_id, languageName: LANG_EN[c.language] || c.language }, messages: messagesOf(id) };
    },
    markHandled(id, by) {
      const r = db.prepare("UPDATE chat_conversations SET status = 'handled', handled_at = ?, handled_by = ?, updated_at = ? WHERE id = ? AND status = 'handoff'").run(now(), by, now(), id);
      return r.changes > 0;
    },
  };
}
