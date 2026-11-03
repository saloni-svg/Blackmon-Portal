// "Ask Blackmon" chat bubble for parents. Mounted once on <body> (outside #app, which redraws on
// every page change) so the conversation stays open while the parent moves around the portal.
// Talks only to /api/chat*; the server does the search, the AI call and the handoff alerts.

import { LANGS, chatLang, chatText } from "/chat-i18n.js";
import { startVoiceCall } from "/voice.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  send: svg('<path d="m4 12 16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  up: svg('<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 1.7V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>'),
  down: svg('<path d="M7 13V4H4v9zM7 13l4 8a2 2 0 0 0 3-1.7V15h5a2 2 0 0 0 2-2.3l-1.2-7A2 2 0 0 0 17.8 4H7"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  micOff: svg('<path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.5 2.6M5 11a7 7 0 0 0 11.4 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18"/>'),
  hangup: svg('<path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.4a1.4 1.4 0 0 1-1.9.1l-1.6-1.3a1.4 1.4 0 0 1-.5-1.3l.3-1.6a12 12 0 0 0-5.8 0l.3 1.6a1.4 1.4 0 0 1-.5 1.3L7.3 18a1.4 1.4 0 0 1-1.9-.1z"/>'),
};

const store = {
  get: () => { try { return localStorage.getItem("askb-lang"); } catch { return null; } },
  set: (v) => { try { localStorage.setItem("askb-lang", v); } catch {} },
};

// Signed out (the session expired or was ended): reload, which shows the sign-in screen, instead
// of a misleading "couldn't connect" error.
const signedOut = (err) => { if (err?.status !== 401) return false; location.reload(); return true; };

async function call(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || ""), { status: res.status });
  return data;
}

let root = null, activeCall = null;

export function unmountChat() { activeCall?.end(); activeCall = null; root?.remove(); root = null; }

// language: the parent's saved language (from /api/me), if they've picked one.
export function mountChat({ language } = {}) {
  if (root) return;
  root = document.createElement("div");
  root.className = "askb";
  document.body.append(root);

  const s = { lang: chatLang(language || store.get() || (navigator.language || "en").slice(0, 2)), enabled: true, voiceOn: false, conv: null, messages: [], busy: false, loaded: false, confirming: false, error: "",
    call: null, vstatus: "", muted: false };
  const t = () => chatText(s.lang);

  root.innerHTML = `
    <button type="button" class="askb__fab" aria-expanded="false" aria-controls="askb-panel">${ICONS.chat}<span data-fab></span></button>
    <section class="askb__panel" id="askb-panel" role="dialog" aria-modal="false" aria-labelledby="askb-title" hidden>
      <header class="askb__head">
        <div class="askb__title"><b id="askb-title" data-title></b><span class="askb__ai">AI</span></div>
        <label class="sr" for="askb-lang" data-langlabel></label>
        <select id="askb-lang" class="askb__lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("")}</select>
        <button type="button" class="askb__talk" data-talk hidden>${ICONS.mic}<span></span></button>
        <button type="button" class="askb__icon" data-new>${ICONS.plus}</button>
        <button type="button" class="askb__icon" data-close>${ICONS.close}</button>
      </header>
      <div class="askb__log" role="log" aria-live="polite" data-log></div>
      <div class="askb__confirm" data-confirm hidden></div>
      <div class="askb__voice" data-voice hidden>
        <span class="askb__orb" data-orb aria-hidden="true"><i></i></span>
        <div class="askb__vtext"><b data-vstatus role="status"></b><small data-vhint></small></div>
        <button type="button" class="askb__vbtn" data-mute aria-pressed="false"></button>
        <button type="button" class="askb__end" data-end>${ICONS.hangup}<span></span></button>
      </div>
      <form class="askb__form" data-form>
        <label class="sr" for="askb-input" data-inputlabel></label>
        <textarea id="askb-input" rows="1" maxlength="1000" data-input></textarea>
        <button type="submit" class="askb__send" data-send>${ICONS.send}</button>
      </form>
      <div class="askb__foot">
        <button type="button" class="askb__human" data-human>${ICONS.person}<span></span></button>
        <small data-disclaimer></small>
      </div>
    </section>`;

  const q = (sel) => root.querySelector(sel);
  const fab = q(".askb__fab"), panel = q(".askb__panel"), log = q("[data-log]"), input = q("[data-input]"), form = q("[data-form]");
  const langSel = q("#askb-lang"), confirmBox = q("[data-confirm]"), humanBtn = q("[data-human]");
  langSel.value = s.lang;

  function labels() {
    const x = t();
    fab.querySelector("[data-fab]").textContent = x.open;
    fab.setAttribute("aria-label", x.open);
    q("[data-title]").textContent = x.title;
    q("[data-langlabel]").textContent = x.language;
    langSel.title = x.language;
    q("[data-new]").setAttribute("aria-label", x.newChat); q("[data-new]").title = x.newChat;
    q("[data-close]").setAttribute("aria-label", x.close); q("[data-close]").title = x.close;
    q("[data-inputlabel]").textContent = x.placeholder;
    input.placeholder = x.placeholder;
    q("[data-send]").setAttribute("aria-label", x.send);
    q("[data-disclaimer]").textContent = x.disclaimer;
    const talk = q("[data-talk]");
    talk.hidden = !s.voiceOn || !!s.call;
    talk.querySelector("span").textContent = x.talk;
    talk.setAttribute("aria-label", x.talkLabel); talk.title = x.talkLabel;
    q("[data-new]").disabled = !!s.call;
    q("[data-vstatus]").textContent = s.vstatus ? x[s.vstatus] : "";
    q("[data-vhint]").textContent = s.muted ? x.unmute : `${x.voiceHint} ${x.voiceLimit}`;
    const mute = q("[data-mute]");
    mute.innerHTML = s.muted ? ICONS.micOff : ICONS.mic;
    mute.setAttribute("aria-pressed", String(s.muted));
    mute.setAttribute("aria-label", s.muted ? x.unmute : x.mute); mute.title = s.muted ? x.unmute : x.mute;
    q("[data-end] span").textContent = x.endCall;
    q("[data-orb]").dataset.state = s.vstatus || "";
    const handedOff = s.conv?.status === "handoff";
    humanBtn.querySelector("span").textContent = handedOff ? x.humanSent : x.human;
    humanBtn.disabled = handedOff || s.busy;
    panel.dir = LANGS[s.lang].dir;
  }

  function bubble(m) {
    const x = t();
    if (m.role === "event") return `<p class="askb__event ${m.text.startsWith("Voice") ? "askb__event--voice" : ""}">${esc(m.text === "Voice call started" ? x.voiceStarted : m.text === "Voice call ended" ? x.voiceEnded : x.humanSent)}</p>`;
    if (m.role === "parent") return `<div class="askb__msg askb__msg--me"><p>${esc(m.text)}</p></div>`;
    const sources = m.sources?.length ? `<p class="askb__src">${esc(x.from)}: ${m.sources.map(esc).join(" · ")}</p>` : "";
    const fb = m.id ? `<div class="askb__fb">
        <button type="button" data-fb="1" data-id="${m.id}" aria-pressed="${m.feedback === 1}" aria-label="${esc(x.helpful)}" title="${esc(x.helpful)}">${ICONS.up}</button>
        <button type="button" data-fb="-1" data-id="${m.id}" aria-pressed="${m.feedback === -1}" aria-label="${esc(x.notHelpful)}" title="${esc(x.notHelpful)}">${ICONS.down}</button></div>` : "";
    const offer = m.offerHandoff && s.conv?.status !== "handoff" ? `<button type="button" class="askb__offer" data-offer>${ICONS.person} ${esc(x.offerYes)}</button>` : "";
    return `<div class="askb__msg askb__msg--bot"><p>${esc(m.text)}</p>${sources}${offer}${fb}</div>`;
  }

  function draw() {
    labels();
    const x = t();
    let html = `<div class="askb__msg askb__msg--bot"><p>${esc(x.intro)}</p></div>`;
    if (!s.enabled) html += `<div class="askb__msg askb__msg--bot askb__msg--note"><p>${esc(x.off)}</p></div>`;
    if (s.enabled && s.loaded && !s.messages.length && !s.call) {
      html += `<div class="askb__starters">${x.starters.map((v) => `<button type="button" data-starter>${esc(v)}</button>`).join("")}</div>`;
    }
    html += s.messages.map(bubble).join("");
    if (s.busy) html += `<div class="askb__msg askb__msg--bot askb__typing"><span></span><span></span><span></span><span class="sr">${esc(x.thinking)}</span></div>`;
    if (s.error) html += `<p class="askb__err" role="alert">${esc(s.error)}</p>`;
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
    input.disabled = !s.enabled;
    q("[data-send]").disabled = !s.enabled || s.busy;
    form.hidden = !!s.call;
    q("[data-voice]").hidden = !s.call;

    confirmBox.hidden = !s.confirming;
    confirmBox.innerHTML = s.confirming ? `<p>${esc(x.humanConfirm)}</p>
      <div><button type="button" class="btn btn--sm" data-yes>${esc(x.humanYes)}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-no>${esc(x.cancel)}</button></div>` : "";
  }

  async function load() {
    try {
      const d = await call("/api/chat");
      s.enabled = d.enabled; s.voiceOn = !!d.voice && !!window.MediaRecorder && !!window.AudioContext && !!navigator.mediaDevices?.getUserMedia;
      s.conv = d.conversation; s.messages = d.messages || [];
      if (s.conv?.language && !language && !store.get()) { s.lang = chatLang(s.conv.language); langSel.value = s.lang; }
    } catch (err) { if (signedOut(err)) return; s.error = t().error; }
    s.loaded = true;
    draw();
  }

  async function ask(text) {
    text = text.trim();
    if (!text || s.busy) return;
    s.busy = true; s.error = "";
    s.messages.push({ role: "parent", text });
    input.value = ""; resize();
    draw();
    try {
      const d = await call("/api/chat/message", { text, language: s.lang });
      s.messages.pop();
      s.messages.push(...d.messages);
      s.conv = d.conversation;
    } catch (err) {
      if (signedOut(err)) return;
      s.messages.pop();
      input.value = text; resize();
      s.error = err.message || t().error;
    }
    s.busy = false;
    draw();
    input.focus();
  }

  async function handoff() {
    s.confirming = false; s.busy = true; s.error = "";
    draw();
    try {
      const d = await call("/api/chat/handoff", { language: s.lang });
      s.messages.push(...d.messages);
      s.conv = d.conversation;
    } catch (err) { if (signedOut(err)) return; s.error = err.message || t().error; }
    s.busy = false;
    draw();
  }

  async function startCall() {
    if (s.call) return;
    s.error = ""; s.confirming = false; s.muted = false; s.vstatus = "connecting";
    s.call = { pending: true };
    draw();
    try {
      const call = await startVoiceCall({
        language: s.lang,
        on: {
          status: (st) => { if (s.call) { s.vstatus = st; labels(); } },
          line: (m) => { s.messages.push(m); draw(); },
          reply: (d) => { s.error = ""; s.messages.push(...d.messages); s.conv = d.conversation; draw(); },
          error: (text) => { s.error = text || t().error; draw(); },
          ended: (reason) => {
            if (reason === "signedout") return location.reload();
            s.call = null; activeCall = null; s.vstatus = "";
            if (reason === "dropped" || reason === "error") s.error = t().voiceError;
            draw();
          },
        },
      });
      if (!s.call) { call.end(); return; } // panel closed while connecting
      s.call = call; activeCall = call;
      s.messages.push({ role: "event", text: "Voice call started" });
      draw();
    } catch (err) {
      if (signedOut(err)) return;
      console.warn("Voice call failed:", err);
      s.call = null; s.vstatus = "";
      s.error = err.mic ? t().micBlocked : err.status === 429 || err.status === 503 ? err.message : t().voiceError;
      draw();
    }
  }

  function open(on) {
    panel.hidden = !on;
    fab.setAttribute("aria-expanded", String(on));
    root.classList.toggle("is-open", on);
    if (on) { if (!s.loaded) load(); else draw(); setTimeout(() => input.focus(), 50); }
    else { if (s.call) { s.call.end?.(); s.call = null; } fab.focus(); }
  }

  const resize = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; };

  fab.onclick = () => open(panel.hidden);
  q("[data-close]").onclick = () => open(false);
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") open(false); });
  // One language setting for the parent: this dropdown and the portal sidebar's picker (public/app.js)
  // stay in step through the "portal:language" event. It's saved on the server, which uses it for
  // announcements and reminders too.
  function setLang(code) { s.lang = chatLang(code); langSel.value = s.lang; store.set(s.lang); s.call?.setLanguage?.(s.lang); draw(); }
  langSel.onchange = () => {
    setLang(langSel.value);
    call("/api/me/language", { language: s.lang })
      .then((data) => window.dispatchEvent(new CustomEvent("portal:language", { detail: { code: s.lang, data, from: "chat" } })))
      .catch((err) => signedOut(err));
  };
  window.addEventListener("portal:language", (e) => { if (root && e.detail.from !== "chat") setLang(e.detail.code); });
  q("[data-talk]").onclick = startCall;
  q("[data-end]").onclick = () => s.call?.end?.();
  q("[data-mute]").onclick = () => { if (!s.call?.setMuted) return; s.muted = !s.muted; s.call.setMuted(s.muted); labels(); };
  q("[data-new]").onclick = async () => {
    if (s.busy) return;
    await call("/api/chat/new", {}).catch(() => {});
    s.conv = null; s.messages = []; s.error = ""; s.confirming = false;
    draw(); input.focus();
  };
  form.onsubmit = (e) => { e.preventDefault(); ask(input.value); };
  input.addEventListener("input", resize);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  humanBtn.onclick = () => { s.confirming = true; draw(); confirmBox.querySelector("[data-yes]")?.focus(); };
  confirmBox.addEventListener("click", (e) => {
    if (e.target.closest("[data-yes]")) handoff();
    if (e.target.closest("[data-no]")) { s.confirming = false; draw(); }
  });
  log.addEventListener("click", async (e) => {
    const starter = e.target.closest("[data-starter]");
    if (starter) return ask(starter.textContent);
    if (e.target.closest("[data-offer]")) { s.confirming = true; draw(); return; }
    const fb = e.target.closest("[data-fb]");
    if (fb) {
      const m = s.messages.find((x) => String(x.id) === fb.dataset.id);
      const value = m.feedback === Number(fb.dataset.fb) ? 0 : Number(fb.dataset.fb);
      m.feedback = value || null;
      draw();
      call("/api/chat/feedback", { id: m.id, value }).catch(() => {});
    }
  });

  draw();
}
