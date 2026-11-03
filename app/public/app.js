// Blackmon Portal front end. Talks only to this app's /api — never to GHL directly.

import { RELATIONSHIPS, LOCATIONS, ID_PROOF, validateSignature, validateAcknowledgment, normalizePhone, fileError } from "/validate.js";
import { mountChat, unmountChat } from "/chat.js";
import { LANGS, chatLang } from "/chat-i18n.js";
import { enrollText, payText } from "/form-i18n.js";

const $app = document.getElementById("app");
const state = { me: null, status: null };

// ---------- tiny helpers ----------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isPh = (v) => !v || /^\s*\[.*\]\s*$/.test(v);
const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const txt = (v) => (isPh(v) ? `<span class="ph">${esc(v || "To be added")}</span>` : esc(v));
const money = (n) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }));
const realLink = (u) => !!u && !/example\.com|^\[/.test(u);
const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
function date(v) {
  if (!v) return "—";
  const d = /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(String(v).length === 10 ? v + "T12:00:00" : v);
  return isNaN(d) ? esc(v) : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
const I = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  form: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  meal: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 6s1 5 3 5v7"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3 2.6 3.5 5.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/>',
};
const ico = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

async function api(path, opts = {}) {
  const json = opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }; // FormData sets its own
  const res = await fetch(path, { credentials: "same-origin", ...opts, headers: { ...json, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status, fields: data.fields });
  return data;
}

// ---------- routing ----------
const PARENT_NAV = [
  { r: "home", label: "Dashboard", icon: "home" },
  { r: "enroll", label: "Enrollment form", icon: "form" },
  { r: "meals", label: "Meal plan", icon: "meal" },
  { r: "payments", label: "Payment plan", icon: "card" },
  { r: "documents", label: "Documents", icon: "doc", docBadge: true },
  { r: "notifications", label: "Notifications", icon: "bell", badge: true },
  { r: "camp", label: "Camp info", icon: "info" },
  { r: "week", label: "This week", icon: "cal", locked: true },
  { r: "schedule", label: "A day at camp", icon: "clock", locked: true },
  { r: "team", label: "Camp team", icon: "team", locked: true },
];
const STAFF_NAV = [
  { r: "home", label: "Onboarding", icon: "home" },
  { r: "training", label: "Training", icon: "form" },
  { r: "assessment", label: "Assessment", icon: "check", only: "staff" },
  { r: "acknowledgment", label: "Acknowledgment", icon: "pen", only: "staff" },
  { r: "video", label: "Intro video", icon: "video" },
  { r: "settings", label: "Settings", icon: "gear" },
];
const VIEWS = {};
const route = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "home");

async function boot() {
  try { state.status = await api("/api/status"); } catch { state.status = { live: false }; }
  try {
    state.me = await api("/api/me");
  } catch (e) {
    state.me = null;
    // Only "not signed in" shows the sign-in page; anything else (GHL slow or unreachable) keeps
    // the session and offers a retry.
    if (e.status !== 401) return renderLoadError();
  }
  render();
}

function renderLoadError() {
  $app.innerHTML = `<div class="si"><div class="card locked">${ico("lock")}<h2>Couldn't load your portal</h2>
    <p>We couldn't reach Blackmon's records just now. You're still signed in, so please try again in a moment. If it keeps happening, call <a href="tel:+14692611625">469-261-1625</a>.</p>
    <button class="btn" data-retry>Try again</button></div></div>`;
  $app.querySelector("[data-retry]").onclick = (e) => { e.currentTarget.disabled = true; boot(); };
}

function render() {
  if (!state.me) return renderSignIn();
  if (!state.me.role) {
    $app.innerHTML = `<div class="si"><div class="card locked">${ico("lock")}<h2>No portal access yet</h2><p>Your account doesn't have a portal role. Please contact Blackmon Tutoring at <a href="tel:+14692611625">469-261-1625</a>.</p><button class="btn" data-out>Sign out</button></div></div>`;
    $app.querySelector("[data-out]").onclick = signOut;
    return;
  }
  renderShell();
}

// The page the parent came from, so a document's Back button returns there.
window.addEventListener("hashchange", (e) => { state.prevHash = new URL(e.oldURL).hash; if (state.me) renderShell(); });

// ---------- sign-in ----------
const ROLE_COPY = {
  parent: { who: "Parent or guardian", sub: "Use the email you enrolled with.", perks: ["Sign enrollment documents", "Check your payment plan", "See this week’s camp events", "Call your camp team"] },
  staff: { who: "Camp staff", sub: "Use the email you applied with.", perks: ["Watch your training", "Sign your contract", "Send your intro video", "Join your camp team"] },
  tutor: { who: "Tutor", sub: "Use the email you applied with.", perks: ["Watch your training", "Sign your contract", "Send your intro video", "Get your Wise invite"] },
};

function renderSignIn() {
  const pre = /[?&]role=(parent|staff|tutor)/.exec(location.search)?.[1] || "parent";
  const demo = state.status && !state.status.live && state.status.demoAccounts;
  $app.innerHTML = `
  <div class="si">
    <header class="si__top">
      <a class="brand" href="https://www.blackmontutoring.com"><img class="logo" src="/logo/blackmon-tutoring-logo.png" alt="Blackmon Tutoring"></a>
      <p class="si__help"><span>Trouble signing in?</span><a href="tel:+14692611625">${ico("phone")} 469-261-1625</a></p>
    </header>
    <div class="si__card">
      <aside class="si__panel">
        <p class="eyebrow">Blackmon Portal</p>
        <h1 class="si__hero">Everything for camp, in one sign&#8209;in.</h1>
        <p class="si__intro"><span class="si__intro-long">Enrollment, payments, weekly camp updates and team onboarding — each account sees only what belongs to it.</span><span class="si__intro-short">Enrollment, payments and camp updates in one place.</span></p>
        <p class="si__where">${ico("pin")}<span>Little Elm camp · 520 Lobo Lane, Little Elm, TX</span></p>
        <div class="photo si__photo"><img src="/img/camp-signin.jpg" alt="Blackmon campers and coaches in team jerseys on the sports field"></div>
        <div class="si__locs si__locs--one">
          <div class="si__loc"><div class="photo"><img src="/img/littleelm-camp.jpg" alt="Campers laughing together at lunch at the Little Elm camp" loading="lazy"></div><div><strong>Little Elm camp</strong><span>520 Lobo Lane<br>Little Elm, TX</span></div></div>
        </div>
      </aside>
      <main class="si__main">
        <h2 class="si__title">Sign in</h2>
        <p class="si__sub">First, tell us who you are.</p>
        <fieldset class="seg"><legend class="sr">I am a</legend>
          ${["parent", "staff", "tutor"].map((r) => `<label><input type="radio" name="role" value="${r}" ${r === pre ? "checked" : ""}><span>${r === "staff" ? "Camp staff" : r[0].toUpperCase() + r.slice(1)}</span></label>`).join("")}
        </fieldset>
        <h3 class="si__who" data-who></h3>
        <p class="si__sub" data-whosub style="font-size:16px"></p>

        <form data-step="email" novalidate>
          <div class="si__field">
            <label class="label" for="si-email">Email address</label>
            <input class="input" id="si-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required aria-describedby="si-email-err">
            <p class="fld__err" id="si-email-err" role="alert" data-emailerr></p>
          </div>
          <label class="check"><input type="checkbox" data-remember> Keep me signed in on this device</label>
          <button class="btn btn--block" style="margin-top:20px" type="submit"><span>Email me a sign-in code</span>${ico("arrow")}</button>
          <div data-msg></div>
        </form>

        <form data-step="code" novalidate hidden>
          <div class="si__field">
            <label class="label" for="si-code">Enter the 6-digit code</label>
            <input class="input code" id="si-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>
            <p class="hint" data-sentto></p>
          </div>
          <button class="btn btn--block" style="margin-top:20px" type="submit"><span>Sign in</span>${ico("arrow")}</button>
          <p class="hint" style="margin-top:14px"><button type="button" class="linkbtn" data-back>Use a different email</button> · <button type="button" class="linkbtn" data-resend>Send a new code</button></p>
          <div data-msg></div>
        </form>

        ${demo ? `<div class="si__demo"><strong>Demo mode</strong> — sample data, no GHL key yet. The code prints in the terminal. Try:
          <ul>${demo.map((a) => `<li><button type="button" data-demo="${esc(a.email)}">${esc(a.email)}</button> — ${esc(a.role)}</li>`).join("")}</ul></div>` : ""}

        <div class="si__more">
          <div><h3>New to camp?</h3><p>Your parent account opens after your first payment.</p></div>
          <div><h3>Want to work with us?</h3><p>Apply first — we’ll send your login once you’re approved.</p></div>
        </div>
      </main>
    </div>
    <footer class="si__foot"><span>© Blackmon Tutoring · Little Elm, TX</span><span>Need help? <a href="mailto:Jordan@blackmontutoring.com">Jordan@blackmontutoring.com</a> or call <a href="tel:+14692611625">469-261-1625</a></span></footer>
  </div>`;

  const q = (s) => $app.querySelector(s);
  const emailForm = q('[data-step="email"]'), codeForm = q('[data-step="code"]');
  const email = q("#si-email"), code = q("#si-code");
  let sentTo = "";

  const setRole = (r) => { q("[data-who]").textContent = ROLE_COPY[r].who; q("[data-whosub]").textContent = ROLE_COPY[r].sub; };
  $app.querySelectorAll('input[name="role"]').forEach((i) => i.addEventListener("change", () => setRole(i.value)));
  setRole(pre);

  const msg = (form, text, kind = "err") => { form.querySelector("[data-msg]").innerHTML = text ? `<p class="alert alert--${kind}" role="alert">${esc(text)}</p>` : ""; };
  const busy = (form, on) => { form.querySelector('button[type="submit"]').disabled = on; };
  // Email-step errors show in red under the email box and clear as soon as it's edited.
  const emailErr = (text) => { q("[data-emailerr]").textContent = text; email.setAttribute("aria-invalid", text ? "true" : "false"); };
  email.addEventListener("input", () => emailErr(""));

  async function start() {
    const v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { emailErr("Please enter the email address you use with Blackmon Tutoring."); email.focus(); return; }
    busy(emailForm, true); emailErr("");
    try {
      const role = $app.querySelector('input[name="role"]:checked')?.value || "parent";
      await api("/api/auth/start", { method: "POST", body: JSON.stringify({ email: v, role }) });
      sentTo = v;
      emailForm.hidden = true; codeForm.hidden = false;
      q("[data-sentto]").textContent = state.status?.live === false
        ? `Demo mode: the code for ${v} is printed in the terminal window running the portal.`
        : `If ${v} has a portal account, a code is on its way. It expires in 10 minutes.`;
      code.value = ""; code.focus();
    } catch (e) { emailErr(e.status ? e.message : "Something went wrong, please try again."); email.focus(); }
    busy(emailForm, false);
  }
  emailForm.addEventListener("submit", (e) => { e.preventDefault(); start(); });
  codeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.value.trim())) { msg(codeForm, "The code is 6 digits."); return; }
    busy(codeForm, true); msg(codeForm, "");
    try {
      await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ email: sentTo, code: code.value.trim(), remember: q("[data-remember]").checked }) });
      history.replaceState(null, "", "/#/home");
      await boot();
    } catch (err) { msg(codeForm, err.message); busy(codeForm, false); }
  });
  q("[data-back]").onclick = () => { codeForm.hidden = true; emailForm.hidden = false; email.focus(); };
  q("[data-resend]").onclick = async () => { await api("/api/auth/start", { method: "POST", body: JSON.stringify({ email: sentTo, role: $app.querySelector('input[name="role"]:checked')?.value || "parent" }) }).catch(() => {}); msg(codeForm, "If the account exists, a new code is on its way.", "ok"); };
  $app.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", () => { email.value = b.dataset.demo; start(); }));
}

async function signOut() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.me = null;
  unmountChat();
  history.replaceState(null, "", "/");
  render();
}

// ---------- shell ----------
function renderShell() {
  const me = state.me;
  const nav = (me.role === "parent" ? PARENT_NAV : STAFF_NAV).filter((n) => !n.only || n.only === me.role);
  let r = route(), arg;
  if (r.startsWith("doc/")) [r, arg] = r.split("/"); // #/doc/<document id>
  if (!VIEWS[me.role]?.[r]) { r = "home"; history.replaceState(null, "", "#/home"); }
  const unread = me.documents?.unread || 0;
  const toSign = (me.documents?.list || []).filter((d) => d.type === "sign" && d.status !== "signed").length;
  const roleName = { parent: "Parent", staff: "Camp staff", tutor: "Tutor" }[me.role];
  const sub = [roleName, me.locationName].filter(Boolean).join(" · ");

  $app.innerHTML = `
  <div class="shell">
    <div class="topbar">
      <a class="brand brand--chip" href="#/home"><img class="logo" src="/logo/blackmon-tutoring-logo.png" alt="Blackmon Tutoring"><span>Portal</span></a>
      <button class="menu-btn" data-menu aria-label="Open menu" aria-expanded="false">${ico("menu")}</button>
    </div>
    <nav class="side" aria-label="Portal">
      <a class="brand brand--chip" href="#/home"><img class="logo" src="/logo/blackmon-tutoring-logo.png" alt="Blackmon Tutoring"><span>Portal</span></a>
      <div class="who"><b>${esc(me.person.firstName)} ${esc(me.person.lastName)}</b><span>${esc(sub)}</span></div>
      <ul class="nav">
        ${nav.map((n) => `<li><a href="#/${n.r}" ${n.r === r ? 'aria-current="page"' : ""}>${ico(n.icon)}<span>${n.label}</span>${n.locked && !me.unlocked ? ico("lock", "lock") : ""}${n.badge && unread ? `<span class="badge" aria-label="${unread} unread">${unread}</span>` : ""}${n.docBadge && toSign ? `<span class="badge" aria-label="${toSign} to sign">${toSign}</span>` : ""}</a></li>`).join("")}
      </ul>
      <div class="side__foot">
        <span>Questions? <a href="tel:+14692611625">469-261-1625</a></span>
        <button class="side__out" data-out>Sign out</button>
      </div>
    </nav>
    <div class="scrim" data-scrim></div>
    <main class="main"><div class="main__in">
      ${me.live ? "" : `<p class="demo-bar">Demo data — add your GHL key to <code>app/.env</code> to see real contacts.</p>`}
      <div class="viewwrap">
        ${me.role === "parent" ? `<div class="mainbar"><label class="langpick" title="Language for the portal's announcements, reminders and Ask Blackmon">${ico("globe")}<span class="sr">Language</span>
          <select data-lang>${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === parentLang() ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>${ico("chevron", "langpick__chev")}</label></div>` : ""}
        <div data-view></div>
      </div>
    </div></main>
  </div>`;

  const shell = $app.querySelector(".shell");
  const menu = $app.querySelector("[data-menu]");
  const toggle = (open) => { shell.classList.toggle("is-open", open); menu.setAttribute("aria-expanded", String(open)); };
  menu.onclick = () => toggle(!shell.classList.contains("is-open"));
  $app.querySelector("[data-scrim]").onclick = () => toggle(false);
  $app.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => toggle(false)));
  $app.querySelector("[data-out]").onclick = signOut;

  if (me.role === "parent") { adoptChatLanguage(); mountChat({ language: me.language }); } else unmountChat();
  $app.querySelector("[data-lang]")?.addEventListener("change", (e) => changeLanguage(e.target));

  const view = $app.querySelector("[data-view]");
  if (arg) VIEWS[me.role][r](view, me, arg); else VIEWS[me.role][r](view, me);
  window.scrollTo(0, 0);
}


const header = (title, sub, extra = "") => `<div class="page-h"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${extra}</div>`;
// Wide camp photo under a page header. `pos` is the object-position so faces stay in the crop.
const banner = (src, alt, pos = "center") => `<div class="photo banner"><img src="${src}" alt="${alt}" style="object-position:${pos}" loading="lazy"></div>`;
// Small navy card with a short message and the whole camp photo beside it (not cropped).
const photoCard = (src, alt, eyebrow, title, text) => `<section class="card hero hero--pic"><div class="hero__txt">
  <p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>${text}</p></div>
  <div class="photo"><img src="${src}" alt="${alt}" loading="lazy"></div></section>`;
const lockedCard = () => `<div class="card locked">${ico("lock")}<h2>Unlocks after you sign</h2>
  <p>This part of your dashboard opens as soon as both waivers are signed. You can read and sign them under Documents.</p>
  <a class="btn" href="#/documents">Sign your waivers</a></div>`;

// ---------- parent documents ----------
const DOC_STATUS = {
  new: '<span class="pill pill--warn">New</span>',
  viewed: '<span class="pill pill--sky">Viewed</span>',
};
const docPill = (d) => d.status === "signed" ? `<span class="pill pill--ok">Signed ${esc(shortDate(d.signedAt))}</span>`
  : d.type === "sign" && d.status === "viewed" ? '<span class="pill pill--sky">Viewed · needs signature</span>' : DOC_STATUS[d.status];
function shortDate(v) { return v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; }

function docsCardHtml(me) {
  const list = me.documents?.list || [];
  if (!list.length) return "";
  const toSign = list.filter((d) => d.type === "sign" && d.status !== "signed").length;
  return `<section class="card"><div class="card__h"><div><h2>Documents</h2>
      <p class="card__sub">${toSign ? `${toSign} ${toSign === 1 ? "waiver needs" : "waivers need"} your signature` : list.some((d) => d.type === "sign") ? "All waivers signed. Thank you!" : "Camp documents to read or download."}</p></div>
      <a class="morelink" href="#/documents">All documents →</a></div>
    <ul class="doclist">${list.map((d) => `<li>
      ${ico("doc")}<div><b>${esc(d.title)}</b><span>${d.type === "sign" ? "Waiver to sign" : "To read"}</span></div>
      ${docPill(d)}<a class="btn btn--ghost btn--sm" href="#/doc/${esc(d.id)}">${d.type === "sign" && d.status !== "signed" ? "Open & sign" : "Open"}</a></li>`).join("")}</ul></section>`;
}

// ---------- parent views ----------
function checklistHtml(me) {
  const next = me.checklist.find((s) => !s.done);
  return `<ol class="steps">${me.checklist.map((s, i) => `
    <li class="step ${s.done ? "is-done" : ""} ${s === next ? "is-next" : ""}">
      <span class="step__n">${s.done ? ico("check") : i + 1}</span>
      <div><h3>${esc(s.title)}</h3><p>${esc(s.status && !s.done ? s.status : s.desc)}</p></div>
      <div class="step__act">${s.done ? '<span class="pill pill--ok">Done</span>'
        : s.go ? `<a class="btn" href="${s.go}">${s === next ? "Start" : "Open"}</a>`
        : `<span class="pill pill--warn">Waiting on you</span>`}</div>
    </li>`).join("")}</ol>`;
}

// Payment plan page, from their Winter Camp 2026 package (opportunity Camp Package / Package Amount)
// and the contact's payment fields. cp: me.campPackage ({ set: true, ... } or { set: false }).
// "Lunch: Yes · Sports: No" from their opportunity (me.inclusions), or "" when there's nothing yet.
const inclusionsHtml = (inc) => (inc && (inc.lunch || inc.sports)
  ? `<p class="hint" style="margin:12px 0 0"><b>Lunch:</b> ${esc(inc.lunch || "—")} &nbsp;·&nbsp; <b>Sports:</b> ${esc(inc.sports || "—")}</p>` : "");

function packageHtml(cp, inc) {
  if (!cp.set) return `<section class="card"><div class="card__h"><div><h2>Your Camp Package</h2></div></div>
    <p class="hint" style="margin:0">Your package details will appear here once confirmed.</p></section>`;
  const list = (items) => `<ul class="ticks">${items.map((i) => `<li>${ico("check")}<span>${esc(i)}</span></li>`).join("")}</ul>`;
  return `<section class="card"><div class="card__h"><div><h2>Your Camp Package</h2><p class="card__sub">Winter Camp 2026</p></div>
      <span class="pill pill--sky">${esc(cp.tier)}</span></div>
    <dl class="kv"><dt>Package</dt><dd>${esc(cp.tier)}</dd><dt>Length</dt><dd>${esc(cp.length)}</dd><dt>Package amount</dt><dd>${money(cp.amount)}</dd></dl>
    ${cp.items.length ? `<h3 style="margin:18px 0 6px;font-size:16px">What's included</h3>${list(cp.items)}` : ""}
    ${cp.lunch ? `<p class="hint"><b>Lunch:</b> ${esc(cp.lunch)}</p>` : ""}
    ${inclusionsHtml(inc)}</section>`;
}
// Paid (won) = paid in full: no balance, no installments, no payment button. Without a package
// amount yet, Total and Paid show "—". compact: the dashboard card, with a link to the full page.
// Payment plan page: "Your registration", laid out like the website's checkout summary, from the
// parent's paid Winter Camp 2026 invoice (or older payment-link order). r: lib/receipts.js; t: payText().
function registrationHtml(r, t, location = "") {
  const cash = (n) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
  const day = r.paidAt ? new Date(r.paidAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const row = (k, v, amount) => `<div class="reg__row"><dt>${esc(k)}</dt><dd>${v ? `<span>${esc(v)}</span>` : ""}${amount !== undefined ? `<b>${esc(cash(amount))}</b>` : ""}</dd></div>`;
  return `<section class="reg"><h2>${esc(t.title)}</h2>
    <dl>
      ${location ? row(t.location, location) : ""}${r.length ? row(t.length, r.length) : ""}${r.package ? row(t.package, r.package) : ""}${r.includes ? row(t.includes, r.includes) : ""}
      ${r.campPackage ? row(t.campPackage, "", r.campPackage.amount) : ""}
      ${r.extendedCare ? row(t.extendedCare, r.extendedCare.label, r.extendedCare.amount) : ""}
      ${r.transport ? row(t.transport, r.transport.label, r.transport.amount) : ""}
      ${r.other.map((o) => row(o.label, "", o.amount)).join("")}
    </dl>
    <dl class="reg__sums">
      ${row(t.subTotal, "", r.subTotal)}
      ${r.discount > 0 ? `<div class="reg__row"><dt>${esc(t.discount)}</dt><dd>${r.discountCode ? `<span class="reg__code">${esc(r.discountCode)}</span>` : ""}<b>−${esc(cash(r.discount))}</b></dd></div>` : ""}
      ${r.fee != null ? row(`${t.fee}${r.feeRate != null ? ` (${r.feeRate}%)` : ""}`, "", r.fee) : ""}
    </dl>
    <div class="reg__total"><span>${esc(t.totalPaid)}</span><strong>${esc(cash(r.totalPaid))}</strong></div>
    <dl class="reg__sums">${row(t.balance, "", r.balanceDue)}</dl>
    <p class="reg__foot">${esc([r.number && `${r.source === "order" ? t.order : t.invoice} ${r.number}`, day && `${t.paidOn} ${day}`].filter(Boolean).join(" · "))}</p>
  </section>`;
}

// ----- GHL enrollment form status (from their Winter Camp 2026 opportunity) -----
const ENROLL_FORM_ID = "2Txp1V54yk7ysmdQadR3";
const ENROLL_FORM_URL = `https://api.leadconnectorhq.com/widget/form/${ENROLL_FORM_ID}`;
// st: { found, submitted, child, age, session, location, lunch, early, late, transport }, { error: true }
// (couldn't check), or undefined (still loading). full: the summary of their answers (Enrollment form
// page); otherwise just the badge and a button (dashboard).
function enrollStatusHtml(st, full) {
  if (!st) return '<p class="hint" style="margin:0">Checking your enrollment form…</p>';
  if (st.error) return '<p class="muted" role="status" style="margin:0">We couldn\'t check your enrollment status right now. You can still fill in the form below.</p>';
  if (!st.found || !st.submitted) {
    // Enrollment form page: the form is right below; GHL keeps nothing until Submit is pressed.
    if (full) return '<p class="hint" role="status" style="margin:0">Your answers save when you press Submit.</p>';
    return `<p class="alert alert--info" role="status" style="margin:0">${ico("clock")} Enrollment form not submitted yet — please complete it before camp starts.</p>
      <a class="btn" href="#/enroll" style="margin-top:14px">Complete enrollment form</a>`;
  }
  // Enrollment form page: their saved answers are already filled in the form below.
  if (full) {
    const on = st.submittedAt ? ` ${new Date(st.submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "";
    return `<p class="alert alert--ok" role="status" style="margin:0">${ico("check")} Submitted${esc(on)} – you can update and resubmit</p>`;
  }
  return `<p class="alert alert--ok" role="status" style="margin:0">${ico("check")} Enrollment form received</p>`;
}
// Reads the status fresh from GHL and draws it (and the "submit again" note on the form page). The
// loading state always ends: on an answer, an error, or after 10 seconds.
async function refreshEnrollStatus(el, full) {
  const url = "/api/enrollment-status", ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 10_000);
  let st = { error: true };
  try {
    const res = await fetch(url, { credentials: "same-origin", signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    console.log("[enrollment status]", url, res.status, body);
    if (res.ok && body) st = body;
  } catch (err) {
    console.warn("[enrollment status]", url, err.name === "AbortError" ? "timed out after 10 seconds" : err.message);
  } finally {
    clearTimeout(timer);
    if (el.isConnected) {
      const box = el.querySelector("[data-enroll-status]");
      if (box) box.innerHTML = enrollStatusHtml(st, full);
    }
  }
}

// What the enrollment form was pre-filled with: the banner, the age hint, and the fields that come
// from the registration (payment), shown read-only. p: GET /api/enrollment-prefill.
function prefillHtml(p) {
  return `${p.registration?.length ? `<section class="card" style="margin-top:16px"><div class="card__h"><div><h2>From your registration</h2>
        <p class="card__sub">From your registration — call <a href="tel:4692611625">469-261-1625</a> to change.</p></div></div>
      <dl class="kv kv--left">${p.registration.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join("")}
        ${p.ageHint ? `<dt>Child's age</dt><dd>${esc(p.ageHint)} <span class="muted">(at checkout; please still enter the date of birth)</span></dd>` : ""}</dl>
      <p class="hint" style="margin:12px 0 0">These are already filled in below. Please don't change them in the form; call us instead.</p></section>` : ""}`;
}

// The GHL form iframe, pre-filled through its URL (empty values are left out).
function drawEnrollForm(el, query) {
  const q = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v));
  const box = el.querySelector("[data-enroll-form]");
  if (!box) return;
  box.innerHTML = `<iframe src="${ENROLL_FORM_URL}?${esc(q.toString())}" style="width:100%;height:100%;border:none;border-radius:4px;min-height:1200px"
      id="inline-${ENROLL_FORM_ID}" data-layout="{'id':'INLINE'}" data-trigger-type="alwaysShow" data-activation-type="alwaysActivated"
      data-deactivation-type="neverDeactivate" data-form-name="Portal - Winter Camp 2026 Enrollment Form" data-form-id="${ENROLL_FORM_ID}"
      title="Portal - Winter Camp 2026 Enrollment Form"></iframe>`;
  // GHL's embed script sizes the iframe to the form. It sets itself up when it loads, so it's
  // (re)loaded each time the form is drawn.
  document.getElementById("ghl-form-embed")?.remove();
  const js = document.createElement("script");
  js.id = "ghl-form-embed"; js.src = "https://link.msgsndr.com/js/form_embed.js"; js.async = true;
  document.body.appendChild(js);
}

function packageTotalsHtml(cp, compact) {
  const amount = cp?.set ? cp.amount : null;
  return `<section class="card"><div class="card__h"><div><h2>Payment plan</h2>${cp?.set ? `<p class="card__sub">${esc(cp.name)}</p>` : ""}</div>
      <span class="pill pill--ok">Paid in full</span></div>
    <div class="progress" role="img" aria-label="100% paid"><i style="width:100%"></i></div>
    <div class="stats">
      <div class="stat"><span>Total</span><b>${money(amount)}</b></div>
      <div class="stat"><span>Paid</span><b>${money(amount)}</b></div>
      <div class="stat"><span>Balance</span><b>${money(0)}</b></div>
    </div>
    <p class="alert alert--ok" role="status" style="margin:16px 0 0">${ico("check")} Paid in full – thank you!</p>
    ${compact ? `<p style="margin:16px 0 0"><a class="morelink" href="#/payments">See payment details →</a></p>` : ""}</section>`;
}

VIEWS.parent = {
  home(el, me) {
    const done = me.checklist.filter((s) => s.done).length;
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const todayCard = me.week?.days.find((d) => d.day === today);
    el.innerHTML = `
      ${header(`Hi ${esc(me.person.firstName)}!`, me.child ? `Here's everything for ${esc(me.child)}'s camp.` : "Here's everything for camp.")}
      <div class="grid">
        <section class="card hero">
          <div class="hero__txt">
            <p class="eyebrow">${esc(me.camp?.name || "Blackmon summer camp")}</p>
            <h2>${me.unlocked ? "You're all set for camp." : `${done} of ${me.checklist.length} enrollment steps done`}</h2>
            <p>${me.unlocked ? "Your dashboard is unlocked. See this week's plans and your camp team." : "Finish the steps below to unlock this week's schedule and your camp team."}</p>
            ${me.camp ? `<p style="display:flex;gap:8px;align-items:center;font-size:15px">${ico("pin")} ${esc(me.camp.address)}</p>` : ""}
          </div>
          <div class="photo"><img src="${esc(me.camp?.photo || "/img/camp-signin.jpg")}" alt=""></div>
        </section>
        <section class="card"><div class="card__h"><div><h2>Enrollment form</h2></div>${me.enrollmentStatus?.submitted ? '<a href="#/enroll">View your answers →</a>' : ""}</div>
          <div data-enroll-status>${enrollStatusHtml(me.enrollmentStatus, false)}</div>${inclusionsHtml(me.inclusions)}</section>
        <div class="grid grid--2">
          <section class="card"><div class="card__h"><div><h2>Enrollment checklist</h2><p class="card__sub">${done} of ${me.checklist.length} done</p></div></div>${checklistHtml(me)}</section>
          ${packageTotalsHtml(me.campPackage, true)}
        </div>
        <div data-docscard>${docsCardHtml(me)}</div>
        ${me.unlocked && me.week ? `
        <section class="card"><div class="card__h"><div><h2>${todayCard ? `Today: ${txt(todayCard.title)}` : esc(me.week.label)}</h2>
          <p class="card__sub">${todayCard ? txt(todayCard.description) : "This week at camp"}</p></div><a href="#/week">Full week →</a></div></section>` : ""}
      </div>`;
    // Fresh documents (assigns any new ones), then redraw just the Documents card.
    refreshDocs().then((d) => { const box = el.querySelector("[data-docscard]"); if (d && box) box.innerHTML = docsCardHtml(state.me); });
    refreshEnrollStatus(el, false); // fresh from GHL, in case they just submitted the form
  },

  // The GHL "Portal - Winter Camp 2026 Enrollment Form", embedded the way GHL's Inline embed does it.
  // A GHL workflow matches the submission to the parent by email and copies the answers onto their
  // Winter Camp 2026 opportunity; the status above the form is read from there (GET /api/enrollment-status).
  // The form is pre-filled from GHL (GET /api/enrollment-prefill): the iframe's URL carries each
  // field's query key. It's set once, when the page is drawn, so nothing the parent types is replaced.
  enroll(el, me) {
    el.innerHTML = `${header("Enrollment form", "Your child's camp details: session, location, lunch, drop-off, pick-up and transportation.")}
      <div data-enroll-status>${enrollStatusHtml(undefined, true)}</div>
      <div data-prefill></div>
      <section class="enroll-embed" data-enroll-form><p class="hint">Loading the form…</p></section>`;
    // Without the pre-fill (GHL slow or down), the form still opens with their name, email and phone.
    const basic = { first_name: me.person.firstName, last_name: me.person.lastName, email: me.person.email, phone: me.enrollment?.phone };
    // Status and the form, read fresh from GHL: their saved answers (contact, else their latest
    // submission) are filled in, so after submitting they see what they sent and can resubmit.
    const load = () => {
      refreshEnrollStatus(el, true);
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 8000);
      fetch("/api/enrollment-prefill", { credentials: "same-origin", signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((p) => {
          clearTimeout(timer);
          if (!el.isConnected) return;
          const box = el.querySelector("[data-prefill]");
          if (p && box) box.innerHTML = prefillHtml(p);
          drawEnrollForm(el, p?.query || basic);
        });
    };
    load();
    // After Submit: the GHL form tells the page (a message from its iframe mentioning the submission);
    // then GHL needs a moment to save it, so the page reloads the status and answers a few seconds later.
    // Coming back to the tab re-checks the status too.
    let reloading = null;
    const onMessage = (e) => {
      if (!/leadconnectorhq\.com|msgsndr\.com/.test(e.origin)) return;
      const said = typeof e.data === "string" ? e.data : JSON.stringify(e.data || "");
      if (!/submit/i.test(said) || reloading || !el.isConnected) return;
      reloading = setTimeout(() => { reloading = null; if (el.isConnected) load(); }, 4000);
    };
    const onVisible = () => { if (document.visibilityState === "visible" && el.isConnected) refreshEnrollStatus(el, true); };
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    // Stop listening when another page is opened.
    const stop = () => { if (!el.isConnected || route() !== "enroll") { window.removeEventListener("message", onMessage); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("hashchange", stop); } };
    window.addEventListener("hashchange", stop);
  },

  meals(el, me) {
    const fs = me.mealFields.map((m) => `
      <fieldset class="meal">
        <legend>${esc(m.label)}</legend>
        ${m.note ? `<p class="hint">${esc(m.note)}</p>` : '<p class="hint">Choose one.</p>'}
        <div class="opts">${(me.mealOptions[m.key] || []).map((o) => `
          <label class="opt"><input type="radio" name="${m.key}" value="${esc(o)}" ${me.meals[m.key] === o ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</div>
        ${m.request ? `<label class="sr" for="r-${m.request}">${esc(m.label)} special request</label>
          <textarea class="input" id="r-${m.request}" name="${m.request}" placeholder="Special request (optional)" maxlength="1000">${esc(me.meals[m.request])}</textarea>` : ""}
      </fieldset>`).join("");
    el.innerHTML = `
      ${header("Meal plan", "Please submit your meal plan at least 7 days before your child's first camp day.")}
      ${photoCard("/img/gallery/camp-4.jpg", "Campers laughing together at lunch", "Lunch at camp", "Lunch is a camp favorite.", "Pick your child's lunch for each option below, and add any special requests.")}
      <form class="meals" novalidate>
        ${fs}
        <div class="formbar"><div data-msg></div><button class="btn" type="submit">Save meal plan</button></div>
      </form>`;
    const form = el.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type="submit"]');
      const out = form.querySelector("[data-msg]");
      btn.disabled = true;
      try {
        await api("/api/meals", { method: "POST", body: JSON.stringify(data) });
        state.me = await api("/api/me");
        out.innerHTML = `<p class="alert alert--ok" role="status">Saved. Thank you!</p>`;
      } catch (err) { out.innerHTML = `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`; }
      btn.disabled = false;
    });
  },

  payments(el, me, notice, fresh) {
    // Package details can change in GHL at any time: re-read them every time the page opens.
    if (!fresh) api("/api/me?fresh=1").then((d) => { state.me = d; if (el.isConnected && route() === "payments") VIEWS.parent.payments(el, d, notice, true); }).catch(() => {});
    // Signing in needs a Paid (won) opportunity, so the package is paid in full. If GHL couldn't be
    // reached (campPackage null), the package card is left out and Total / Paid show "—".
    const cp = me.campPackage;
    el.innerHTML = `${header("Payment plan", "Your camp package and payment, straight from your Blackmon account.")}
      ${photoCard("/img/camp-signin.jpg", "Blackmon campers and coaches in team jerseys on the sports field", "Thank you", "We're glad you're part of camp.", "Your package and what you've paid are below. Questions about payment? Call us anytime.")}
      ${notice ? `<p class="alert alert--ok" role="status">${esc(notice)}</p>` : ""}
      <div class="grid">
        ${cp ? packageHtml(cp, me.inclusions) : ""}
        <div data-paid><section class="reg"><h2>${esc(payText(parentLang()).title)}</h2><p class="reg__foot">…</p></section></div>
      </div>`;
    // The registration is read fresh from GHL every time the page opens (GET /api/payment).
    const t = payText(parentLang());
    const box = () => el.querySelector("[data-paid]");
    api("/api/payment").then((d) => {
      // No paid invoice yet (or an older payment-link purchase): Total paid from the opportunity, and Location.
      const cash = (n) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }));
      if (box()) box().innerHTML = d.registrations?.length ? d.registrations.map((r) => registrationHtml(r, t, d.location)).join("")
        : `<section class="card"><h2>${esc(t.title)}</h2>
            ${d.totalPaid != null || d.location ? `<dl class="kv" style="margin-top:12px">
              ${d.totalPaid != null ? `<dt>${esc(t.totalPaid)}</dt><dd>${esc(cash(d.totalPaid))}${d.discountCode ? ` <span class="muted">(${esc(d.discountCode)})</span>` : ""}</dd>` : ""}
              ${d.location ? `<dt>${esc(t.location)}</dt><dd>${esc(d.location)}</dd>` : ""}</dl>` : ""}
            <p class="muted" style="margin:12px 0 0">${esc(t.none)}</p></section>`;
    }).catch((err) => { if (box()) box().innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.status === 401 ? err.message : t.error)}</p>`; });
  },

  // Winter Camp facts, activities, packages and prices (content/camp.json -> winterCamp).
  camp(el, me) {
    const c = me.campInfo;
    if (!c) { el.innerHTML = header("Camp info") + `<div class="card locked">${ico("info")}<h2>Camp details coming soon</h2></div>`; return; }
    const list = (items) => `<ul class="ticks">${items.map((i) => `<li>${ico("check")}<span>${esc(i)}</span></li>`).join("")}</ul>`;
    el.innerHTML = `${header(esc(c.title), esc(c.tagline))}
      <div class="grid">
        <section class="card">
          <p style="margin:0 0 18px">${esc(c.intro)}</p>
          <div class="facts">
            <div><span>Dates</span><b>${esc(c.dates)}</b><small>${esc(c.operatingDays)}. ${esc(c.closed)}.</small></div>
            <div><span>Camp hours</span><b>${esc(c.hours)}</b><small>Early care ${esc(c.extendedCare.early)} · Late care ${esc(c.extendedCare.late)}</small></div>
            <div><span>Ages</span><b>${esc(c.ages)}</b></div>
            <div><span>Location</span><b>${esc(c.location)}</b></div>
          </div>
        </section>

        ${c.gallery?.length ? `<section class="card"><div class="card__h"><div><h2>Inside camp</h2><p class="card__sub">Real moments from Blackmon camp: sports, learning, lunch and friendships.</p></div></div>
          <div class="gallery">${c.gallery.map((g) => `<figure><img src="${esc(g.src)}" alt="${esc(g.alt)}" loading="lazy"></figure>`).join("")}</div></section>` : ""}

        <section class="card"><div class="card__h"><div><h2>Activities</h2><p class="card__sub">Every day is an opportunity to learn, play and grow.</p></div></div>
          <div class="acts">${c.activities.map((a) => `<article class="act"><h3>${esc(a.title)}</h3><p class="act__tag">${esc(a.tagline)}</p><p>${esc(a.text)}</p>${list(a.items)}${a.note ? `<p class="hint">${esc(a.note)}</p>` : ""}</article>`).join("")}</div>
        </section>

        <section class="card"><div class="card__h"><div><h2>Sports &amp; athletics</h2><p class="card__sub">${esc(c.sports.intro)}</p></div></div>
          <div class="sports">${c.sports.list.map((s) => `<div><b>${esc(s.name)}</b><span>${esc(s.text)}</span></div>`).join("")}</div>
          <p class="notice" style="margin:16px 0 0">${esc(c.sports.included)}</p>
          <p class="hint">${esc(c.sports.note)}</p>
        </section>

        <section class="card"><div class="card__h"><div><h2>Packages &amp; pricing</h2><p class="card__sub">Full camp = all 8 operating days. Weekly = any 5 selected days, subject to availability.</p></div></div>
          <div class="pkgs">${c.packages.map((p) => `<article class="pkg ${p.recommended ? "is-rec" : ""}">
            ${p.recommended ? '<span class="pill pill--ok">Recommended</span>' : ""}
            <h3>${esc(p.name)}</h3><p class="pkg__sum">${esc(p.summary)}</p>
            <div class="pkg__prices"><div><b>${esc(p.price)}</b><span>Full camp · 8 days</span></div><div><b>${esc(p.weekly)}</b><span>Weekly · 5 days</span></div></div>
            ${list(p.items)}<p class="hint"><b>Lunch:</b> ${esc(p.lunch)}</p></article>`).join("")}</div>
          <ul class="hint" style="margin:14px 0 0;padding-left:18px">${c.packageNotes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
          <p class="notice" style="margin:14px 0 0">${esc(c.lunchNote)}</p>
        </section>

        <section class="card"><div class="card__h"><div><h2>Ways to save</h2></div></div>
          <div class="offers">${c.offers.map((o) => `<article><b class="offer__amt">${esc(o.amount)}</b><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p></article>`).join("")}</div>
          <p class="hint">${esc(c.offersNote)}</p>
        </section>

        <div class="grid grid--2">
          <section class="card"><div class="card__h"><div><h2>Transportation</h2><p class="card__sub">Optional</p></div></div>
            <p style="margin:0 0 14px">${esc(c.transportation.text)}</p>
            <div class="stats">${c.transportation.prices.map((t) => `<div class="stat"><span>${esc(t.label)}</span><b>${esc(t.price)}</b><small class="hint">${esc(t.note)}</small></div>`).join("")}</div>
            ${list(c.transportation.items)}
          </section>
          <section class="card"><div class="card__h"><div><h2>Extended care</h2><p class="card__sub">Optional</p></div></div>
            <dl class="kv"><dt>Early care</dt><dd>${esc(c.extendedCare.early)}</dd><dt>Late care</dt><dd>${esc(c.extendedCare.late)}</dd><dt>Fee</dt><dd>${esc(c.extendedCare.price)}</dd></dl>
            <p class="hint">${esc(c.extendedCare.note)} ${txt(c.extendedCare.coverage)}</p>
          </section>
        </div>
        ${(c.sections || []).map((x) => `<section class="card"><div class="card__h"><div><h2>${esc(x.title)}</h2>${x.subtitle ? `<p class="card__sub">${esc(x.subtitle)}</p>` : ""}</div></div>
          ${x.text ? `<p style="margin:0;white-space:pre-wrap">${esc(x.text)}</p>` : ""}${x.items?.length ? list(x.items) : ""}</section>`).join("")}
        <p class="hint" style="text-align:center">Questions about packages, meals or transportation? Call us at <a href="tel:+14692611625">469-261-1625</a>.</p>
      </div>`;
  },

  documents(el, me, fresh) {
    // Show what we have, then fetch fresh documents (this also assigns any new ones) and redraw.
    if (!fresh) refreshDocs().then((d) => { if (d && el.isConnected) VIEWS.parent.documents(el, state.me, true); });
    const list = me.documents?.list || [];
    const toSign = list.filter((d) => d.type === "sign" && d.status !== "signed").length;
    el.innerHTML = `${header("Documents", toSign ? `${toSign} ${toSign === 1 ? "waiver needs" : "waivers need"} your signature. Open a waiver, read it, then sign at the bottom.` : "Your camp documents from Blackmon Tutoring.")}
      ${list.length ? `<section class="card"><ul class="doclist">${list.map((d) => `<li>
        ${ico("doc")}<div><b>${esc(d.title)}</b><span>${d.type === "sign" ? "Waiver to sign" : "To read"} · Added ${esc(shortDate(d.assignedAt))}</span></div>
        ${docPill(d)}<a class="btn btn--sm ${d.type === "sign" && d.status !== "signed" ? "" : "btn--ghost"}" href="#/doc/${esc(d.id)}">${d.type === "sign" && d.status !== "signed" ? `${ico("pen")} Open &amp; sign` : "Open"}</a></li>`).join("")}</ul></section>`
      : `<div class="card locked">${ico("doc")}<h2>No documents yet</h2><p>When Blackmon Tutoring shares camp documents with you, they'll show up here.</p></div>`}`;
  },

  notifications(el, me, fresh) {
    if (!fresh) refreshDocs().then((d) => { if (d && el.isConnected) VIEWS.parent.notifications(el, state.me, true); });
    const docsN = (me.documents?.list || []).filter((d) => !d.noticeDismissed)
      .map((d) => ({ kind: "document", id: d.id, at: d.assignedAt, unread: d.status === "new", d }));
    const annN = (me.documents?.announcements || []).map((a) => ({ kind: "announcement", id: a.id, at: a.at, unread: !a.read, a }));
    const items = [...annN, ...docsN].sort((x, y) => y.at.localeCompare(x.at));
    const close = (n, title) => `<button type="button" class="note__x" data-dismiss="${n.kind}:${esc(n.id)}" aria-label="Remove notification: ${esc(title)}" title="Remove">${ico("x")}</button>`;
    el.innerHTML = `${header("Notifications", `Announcements and camp documents from Blackmon Tutoring. Open each document to read it. Announcements are shown in ${esc(LANGS[parentLang()].name)}; change the language at the top of the page.`)}
      ${items.length ? `<ul class="notes">${items.map((n) => n.kind === "announcement" ? `
        <li class="note note--ann ${n.unread ? "is-unread" : ""}">
          ${ico("megaphone")}<div><b>${esc(n.a.title)}</b><span>Announcement · ${esc(shortDate(n.at))}${n.unread ? " · New" : ""}</span>
            <p class="note__body">${esc(n.a.body)}</p>
            ${n.a.files?.length ? `<ul class="note__files">${n.a.files.map((f) => `<li>${ico(f.mime === "application/pdf" ? "doc" : "image")}
              <a href="/api/announcements/files/${esc(f.id)}" target="_blank" rel="noopener">${esc(f.name)}</a><span>${fileSize(f.size)}</span>
              <a class="note__dl" href="/api/announcements/files/${esc(f.id)}?download=1" aria-label="Download ${esc(f.name)}" title="Download">${ico("download")}</a></li>`).join("")}</ul>` : ""}</div>
          ${close(n, n.a.title)}
        </li>` : `
        <li class="note ${n.unread ? "is-unread" : ""}">
          ${ico("bell")}<div><b>New document: ${esc(n.d.title)}</b><span>${esc(shortDate(n.at))}${n.unread ? " · Unread" : ""}</span></div>
          ${docPill(n.d)}<a class="btn btn--sm ${n.unread ? "" : "btn--ghost"}" href="#/doc/${esc(n.d.id)}">${n.d.type === "sign" && n.d.status !== "signed" ? "Open &amp; sign" : "Open"}</a>
          ${close(n, n.d.title)}
        </li>`).join("")}</ul>`
      : `<div class="card locked">${ico("bell")}<h2>No notifications</h2><p>Announcements and new camp documents from Blackmon Tutoring will show up here. Your documents are always under <a href="#/documents">Documents</a>.</p></div>`}`;

    el.querySelectorAll("[data-dismiss]").forEach((b) => (b.onclick = async () => {
      const [kind, id] = b.dataset.dismiss.split(":");
      b.disabled = true;
      try {
        const data = await api("/api/notifications/dismiss", { method: "POST", body: JSON.stringify({ kind, id }) });
        applyDocs(data);
        VIEWS.parent.notifications(el, state.me, true);
      } catch (err) {
        b.disabled = false;
        el.querySelector("[data-dismiss-err]")?.remove();
        el.querySelector(".notes")?.insertAdjacentHTML("beforebegin", `<p class="alert alert--err" role="alert" data-dismiss-err>${esc(err.message)}</p>`);
      }
    }));
    // Announcements on screen count as seen (they stay highlighted until the next visit).
    const unseen = annN.filter((n) => n.unread).map((n) => n.id);
    if (fresh && unseen.length) api("/api/announcements/read", { method: "POST", body: JSON.stringify({ ids: unseen }) }).then((data) => {
      const keep = state.me.documents.announcements;
      applyDocs(data);
      state.me.documents.announcements = keep; // keep "New" on screen for this visit
    }).catch(() => {});
  },

  async doc(el, me, id) {
    const found = (me.documents?.list || []).find((x) => x.id === id);
    const prev = state.prevHash && !state.prevHash.startsWith("#/doc/") ? state.prevHash : "#/documents";
    const backTo = { "#/notifications": "Notifications", "#/home": "Dashboard", "#/documents": "Documents" }[prev] || "Back";
    const back = `<a class="backlink" href="${esc(prev)}">${ico("back")} ${backTo === "Back" ? "Back" : `Back to ${backTo}`}</a>`;
    if (!found) {
      el.innerHTML = back + header("Document") + `<div class="card locked">${ico("doc")}<h2>Document not found</h2><p>It may have been removed. See Documents for your current documents.</p><a class="btn" href="#/documents">Documents</a></div>`;
      return;
    }
    const file = `/api/documents/${encodeURIComponent(id)}/file`;
    const needsSign = found.type === "sign" && found.status !== "signed";
    el.innerHTML = `${back}${header(esc(found.title), needsSign ? "Please read the whole document, then sign it below." : found.type === "sign" ? "You've signed this waiver. Your signed copy is below." : "Read the document below, or download a copy.",
        `<div class="page-h__acts">${needsSign ? `<a class="btn" href="#sign" data-tosign>${ico("pen")} Sign this waiver</a>` : ""}<a class="btn btn--ghost" href="${file}?download=1">${ico("download")} Download</a></div>`)}
      <section class="card pdfcard">
        <iframe class="pdf" src="${file}" title="${esc(found.title)}"></iframe>
        <p class="hint">Can't see it? <a href="${file}" target="_blank" rel="noopener">Open the PDF in a new tab</a>.</p>
      </section>
      <div data-sign id="sign"></div>`;
    el.querySelector("[data-tosign]")?.addEventListener("click", (e) => {
      e.preventDefault();
      const box = el.querySelector("[data-sign]");
      box.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      setTimeout(() => box.querySelector("input")?.focus({ preventScroll: true }), 400);
    });
    // The PDF request marks the document as viewed; then the unread count can update.
    el.querySelector("iframe").addEventListener("load", () => refreshDocs(), { once: true });
    if (found.type === "sign") signSection(el.querySelector("[data-sign]"), found);
  },

  week(el, me) {
    if (!me.unlocked) return (el.innerHTML = header("This week at camp") + lockedCard());
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    el.innerHTML = `${header("This week at camp", `${esc(me.camp?.name || "")} · ${esc(me.week?.label || "")}`)}
      ${banner("/img/gallery/camp-8.jpg", "Campers outside with their rockets before launch", "center 65%")}
      <div class="days">${(me.week?.days || []).map((d) => `
        <article class="day ${d.day === today ? "is-today" : ""}">
          <small>${esc(d.day)} · ${esc(d.date)}</small>
          <h3>${txt(d.title)}</h3><p>${txt(d.description)}</p>
          ${d.tag ? `<span class="pill ${/trip|lunch/i.test(d.tag) ? "pill--warn" : "pill--sky"}">${esc(d.tag)}</span>` : ""}
          ${d.day === today ? ' <span class="pill pill--ok">Today</span>' : ""}
        </article>`).join("")}</div>`;
  },

  schedule(el, me) {
    if (!me.unlocked) return (el.innerHTML = header("A day at camp") + lockedCard());
    const s = me.schedule;
    const now = chicagoNow();
    const toMin = (t) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
    el.innerHTML = `${header("A day at camp", "Monday to Friday. Times are Central.")}
      ${banner("/img/gallery/camp-3.jpg", "Campers working on a group activity in the classroom", "center 70%")}
      <ol class="tl">${s.items.map((it) => {
        const isNow = now.weekday && it.start && now.min >= toMin(it.start) && now.min < toMin(it.end);
        const price = it.extra === "early" ? s.earlyDropoffPrice : it.extra === "late" ? s.latePickupPrice : "";
        return `<li class="${it.milestone ? "is-mile" : ""} ${it.extra ? "is-extra" : ""} ${isNow ? "is-now" : ""}" ${isNow ? 'aria-current="time"' : ""}>
          <time>${esc(it.time)}</time>
          <div><h3>${esc(it.title)}</h3>${it.note ? `<p>${esc(it.note)}</p>` : ""}
            ${price || isNow ? `<div class="pills">${price ? `<span class="pill pill--warn">Extra charge ${esc(price)}</span>` : ""}${isNow ? '<span class="pill pill--sky">Happening now</span>' : ""}</div>` : ""}</div>
        </li>`;
      }).join("")}</ol>`;
  },

  team(el, me) {
    if (!me.unlocked) return (el.innerHTML = header("Your camp team") + lockedCard());
    const tel = (p) => { const d = (p || "").replace(/\D/g, ""); return d.length >= 10 ? `tel:+${d.length === 10 ? "1" + d : d}` : null; };
    el.innerHTML = `${header("Your camp team", esc(me.camp?.address || ""))}
      ${banner("/img/gallery/camp-2.jpg", "Coaches and campers smiling together by the field", "center 60%")}
      <div class="team">${me.team.map((m) => {
        const initials = isPh(m.name) ? "" : m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
        const t = tel(m.phone);
        return `<article class="member"><span class="avatar">${initials ? esc(initials) : ico("team")}</span>
          <div><b>${txt(m.name)}</b><span>${esc(m.role)}</span>${t ? `<a href="${t}">${ico("phone", "ico")} ${esc(m.phone)}</a>` : `<span>${txt(m.phone)}</span>`}</div></article>`;
      }).join("")}</div>`;
  },
};

// ---------- the parent's language ----------
// Saved on the server, which uses it for announcements, reminders and Ask Blackmon. English until
// the parent picks one.
const parentLang = () => chatLang(state.me?.language || "en");
// A language picked in the chat on this browser before it was saved on the server: save it once.
function adoptChatLanguage() {
  let local = null;
  try { local = localStorage.getItem("askb-lang"); } catch {}
  if (state.me.language || !local || chatLang(local) === "en") return;
  state.me.language = chatLang(local);
  api("/api/me/language", { method: "POST", body: JSON.stringify({ language: local }) }).then(languageSaved).catch(() => {});
}
async function changeLanguage(select) {
  select.disabled = true;
  try {
    const d = await api("/api/me/language", { method: "POST", body: JSON.stringify({ language: select.value }) });
    languageSaved(d);
    window.dispatchEvent(new CustomEvent("portal:language", { detail: { code: d.language, from: "portal" } }));
  } catch (err) { select.value = parentLang(); alert(err.message); }
  select.disabled = false;
}
// After a change here or in the chat: store it, and redraw Notifications in the new language.
function languageSaved(d) {
  state.me.language = d.language;
  applyDocs(d.documents);
  const sel = $app.querySelector("[data-lang]");
  if (sel) sel.value = d.language;
  if (route() === "notifications") VIEWS.parent.notifications($app.querySelector("[data-view]"), state.me, true);
}
window.addEventListener("portal:language", (e) => { if (e.detail.from === "chat" && state.me?.role === "parent" && e.detail.data) languageSaved(e.detail.data); });

// Stores fresh documents + announcements and updates the Notifications and Documents badges
// without redrawing the page.
function applyDocs(data) {
  state.me.documents = { list: data.list, announcements: data.announcements, unread: data.unread, prefill: data.prefill ?? state.me.documents?.prefill };
  const badge = (href, n, label) => {
    const link = $app.querySelector(`.nav a[href="${href}"]`);
    if (!link) return;
    link.querySelector(".badge")?.remove();
    if (n) link.insertAdjacentHTML("beforeend", `<span class="badge" aria-label="${n} ${label}">${n}</span>`);
  };
  badge("#/notifications", data.unread, "unread");
  badge("#/documents", data.list.filter((d) => d.type === "sign" && d.status !== "signed").length, "to sign");
}

// Reloads the parent's documents (assigning any new ones) and updates the badges.
async function refreshDocs() {
  try {
    const data = await api("/api/documents");
    applyDocs(data);
    return data;
  } catch { return null; }
}

// The sign form under a waiver, or its signed status once signed.
// Signature pad: pointer drawing on the form's [data-pad] canvas, sized for the screen's pixel
// density; [data-clear] wipes it. Returns { drawn(), dataUrl() }.
function sigPad(form, onClear) {
  const pad = form.querySelector("[data-pad]"), ctx = pad.getContext("2d");
  let drawn = false, drawing = false;
  const ratio = window.devicePixelRatio || 1;
  pad.width = pad.clientWidth * ratio; pad.height = pad.clientHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0B1F3F";
  const at = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  pad.addEventListener("pointerdown", (e) => { drawing = true; pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...at(e)); });
  pad.addEventListener("pointermove", (e) => { if (!drawing) return; ctx.lineTo(...at(e)); ctx.stroke(); drawn = true; });
  ["pointerup", "pointercancel"].forEach((t) => pad.addEventListener(t, () => { drawing = false; }));
  form.querySelector("[data-clear]").onclick = () => { ctx.clearRect(0, 0, pad.width, pad.height); drawn = false; onClear?.(); };
  // The drawing cropped to its ink (plus a small margin), so it fills the signature line on the PDF.
  const dataUrl = () => {
    const { data, width, height } = ctx.getImageData(0, 0, pad.width, pad.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return pad.toDataURL("image/png");
    const m = Math.round(6 * ratio), out = document.createElement("canvas");
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(width - 1, x1 + m); y1 = Math.min(height - 1, y1 + m);
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext("2d").drawImage(pad, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };
  return { drawn: () => drawn, dataUrl };
}

async function signSection(box, d) {
  if (d.status === "signed") {
    const signed = `/api/documents/${encodeURIComponent(d.id)}/signed`;
    box.innerHTML = `<section class="card signed">${ico("check")}<div><h2>Signed on ${esc(shortDate(d.signedAt))}</h2>
      <p>${esc(d.signature?.parentName || "")}${d.signature ? ` (${esc(d.signature.relationship)}) for ${esc(d.signature.childName)}` : ""}. Your signed copy includes a signature page at the end.</p>
      <p class="paybar"><a class="btn" href="${signed}" target="_blank" rel="noopener">View signed copy</a><a class="btn btn--ghost" href="${signed}?download=1">${ico("download")} Download</a></p></div></section>`;
    return;
  }
  const prefill = state.me.documents?.prefill || (await refreshDocs())?.prefill || {};
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const field = (id, label, value, attrs = "") => `<div><label class="label" for="sg-${id}">${label}</label>
    <input class="input" id="sg-${id}" name="${id}" value="${esc(value)}" aria-describedby="sg-${id}-err" ${attrs}><p class="fld__err" id="sg-${id}-err" data-err="${id}"></p></div>`;
  box.innerHTML = `<form class="card signform" novalidate>
    <h2>${ico("pen")} Sign this waiver</h2>
    <p class="card__sub" style="margin-bottom:16px">Signing electronically is the same as signing on paper.</p>
    <div class="grid grid--2">
      ${field("parentName", "Parent / guardian full name", prefill.parentName || "", 'autocomplete="name" maxlength="100"')}
      ${field("childName", "Child's full name", prefill.childName || "", 'maxlength="100"')}
      <div><label class="label" for="sg-relationship">Relationship to child</label>
        <select class="input" id="sg-relationship" name="relationship" aria-describedby="sg-relationship-err"><option value="">Choose one</option>
        ${RELATIONSHIPS.map((r) => `<option>${esc(r)}</option>`).join("")}</select><p class="fld__err" id="sg-relationship-err" data-err="relationship"></p></div>
      <div><span class="label">Date</span><p class="input input--static">${esc(today)}</p></div>
      <div class="fld--full">${field("signature", "Type your full name as your signature", "", 'autocomplete="off" maxlength="100"')}
        <p class="sigpreview" data-preview aria-hidden="true"></p></div>
      <div class="fld--full"><span class="label">Draw your signature <span class="muted">(optional)</span></span>
        <canvas class="sigpad" data-pad aria-label="Signature drawing area"></canvas>
        <p class="hint"><button type="button" class="linkbtn" data-clear>Clear drawing</button></p><p class="fld__err" data-err="drawing"></p></div>
    </div>
    <label class="check"><input type="checkbox" name="agree" aria-describedby="sg-agree-err"> I have read and agree to the ${esc(d.title)}.</label>
    <p class="fld__err" id="sg-agree-err" data-err="agree"></p>
    <div class="formbar formbar--end"><div data-msg></div><button class="btn" type="submit">${ico("pen")} Sign document</button></div>
  </form>`;

  const form = box.querySelector("form"), btn = form.querySelector('button[type="submit"]'), msg = form.querySelector("[data-msg]");
  const setErr = (name, text) => {
    const out = form.querySelector(`[data-err="${name}"]`);
    if (out) out.textContent = text || "";
    form.elements[name]?.setAttribute?.("aria-invalid", text ? "true" : "false");
  };
  // A field's error clears as soon as it's changed; everything is checked again on submit.
  ["input", "change"].forEach((t) => form.addEventListener(t, (e) => { if (e.target.name) setErr(e.target.name, ""); }));
  const preview = form.querySelector("[data-preview]");
  form.elements.signature.addEventListener("input", () => { preview.textContent = form.elements.signature.value; });

  const pad = sigPad(form, () => setErr("drawing", ""));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.agree = form.elements.agree.checked;
    const { errors } = validateSignature(data);
    ["parentName", "childName", "relationship", "signature", "agree", "drawing"].forEach((k) => setErr(k, errors[k]));
    if (Object.keys(errors).length) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    if (pad.drawn()) data.drawing = pad.dataUrl();
    btn.disabled = true; msg.innerHTML = "";
    try {
      const { document } = await api(`/api/documents/${encodeURIComponent(d.id)}/sign`, { method: "POST", body: JSON.stringify(data) });
      await refreshDocs();
      signSection(box, document);
      box.insertAdjacentHTML("afterbegin", `<p class="alert alert--ok" role="status" style="margin:0 0 16px">Thank you! Your ${esc(d.title)} is signed.</p>`);
      box.scrollIntoView({ block: "start" });
    } catch (err) {
      if (err.fields) Object.entries(err.fields).forEach(([k, v]) => setErr(k, v));
      msg.innerHTML = `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`;
      btn.disabled = false;
    }
  });
}

function chicagoNow() {
  try {
    const o = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).forEach((p) => (o[p.type] = p.value));
    return { weekday: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(o.weekday), min: (+o.hour % 24) * 60 + +o.minute };
  } catch { return { weekday: false, min: 0 }; }
}

// ---------- staff + tutor views ----------
const STAFF = {
  home(el, me) {
    if (!me.approved) {
      el.innerHTML = header(`Hi ${esc(me.person.firstName)}!`) + `<div class="card locked">${ico("clock")}<h2>Your application is being reviewed</h2><p>Jordan will look at it soon. We'll email you as soon as you're approved, and your onboarding steps will appear here.</p></div>`;
      return;
    }
    const done = me.steps.filter((s) => s.done).length;
    const next = me.steps.find((s) => !s.done);
    el.innerHTML = `
      ${header(`Welcome to the team, ${esc(me.person.firstName)}!`, me.role === "tutor" ? "Your tutor onboarding" : `Your camp staff onboarding${me.locationName ? ` · ${esc(me.locationName)}` : ""}`)}
      ${banner("/img/gallery/camp-7.jpg", "Campers holding up the paper rockets they built", "center 35%")}
      <div class="grid">
        <section class="card">
          <div class="card__h"><div><h2>Onboarding</h2><p class="card__sub">${done} of ${me.steps.length} steps done · Status in GHL: ${esc(me.status)}</p></div>
            ${next ? "" : '<span class="pill pill--ok">All done</span>'}</div>
          <div class="progress" style="margin-bottom:18px"><i style="width:${Math.round((done / me.steps.length) * 100)}%"></i></div>
          <ol class="steps">${me.steps.map((s, i) => `
            <li class="step ${s.done ? "is-done" : ""} ${s === next ? "is-next" : ""}">
              <span class="step__n">${s.done ? ico("check") : i + 1}</span>
              <div><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p></div>
              <div class="step__act">${s.done && !realLink(s.link) ? '<span class="pill pill--ok">Done</span>' : ""}
                ${s.go && !s.done ? `<a class="btn" href="${s.go}">${s === next ? "Start" : "Open"}</a>` : ""}
                ${s.link && realLink(s.link) ? `<a class="btn ${s.done ? "btn--ghost" : ""}" href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.linkText)} ${ico("ext")}</a>` : ""}
                ${s.link && !s.done && !realLink(s.link) ? `<span class="pill pill--warn">Link not set yet in GHL</span>` : ""}
                ${!s.done && !s.go && !s.link ? `<span class="pill pill--todo">${s === next ? "In progress" : "Coming up"}</span>` : ""}</div>
            </li>`).join("")}</ol>
        </section>
      </div>`;
  },

  // Training videos uploaded by Blackmon for their group (camp staff or tutors). Watching each one to
  // the end ticks it off; when all are watched, their onboarding moves to "Training Complete".
  async training(el, me) {
    const t = me.steps.find((s) => s.id === "training");
    const course = realLink(t?.link) ? `<p style="margin:0">Blackmon also has an online course: <a href="${esc(t.link)}" target="_blank" rel="noopener">open the training course ${ico("ext")}</a></p>` : "";
    el.innerHTML = header("Training", "Watch each training video to the end. Your onboarding moves on automatically when you've watched them all.") + '<p class="hint">Loading…</p>';
    let list;
    try { list = (await api("/api/training")).videos; }
    catch (err) { el.innerHTML = header("Training") + `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`; return; }
    const draw = () => {
      const done = list.filter((v) => v.watched).length, all = list.length && done === list.length;
      el.innerHTML = `${header("Training", me.role === "staff" ? "Watch every training video to the end. They're required: the assessment and the steps after it open once you've watched them all." : "Watch each training video to the end. Your onboarding moves on automatically when you've watched them all.",
          all || (!list.length && t?.done) ? '<span class="pill pill--ok">Completed</span>' : "")}
        ${list.length ? `<section class="card"><div class="card__h"><div><h2>Your training videos</h2><p class="card__sub">${done} of ${list.length} watched</p></div></div>
          <div class="progress" style="margin-bottom:18px"><i style="width:${Math.round((done / list.length) * 100)}%"></i></div>
          <ol class="tvids">${list.map((v, i) => `<li class="${v.watched ? "is-done" : ""}">
            <video controls preload="metadata" playsinline src="/api/training/${v.id}/file" data-vid="${v.id}"></video>
            <div><span class="tvids__n">Video ${i + 1}</span><h3>${esc(v.title)}</h3>${v.description ? `<p>${esc(v.description)}</p>` : ""}
              ${v.watched ? `<span class="pill pill--ok">${ico("check")} Watched</span>` : '<span class="pill pill--todo">Not watched yet</span>'}</div></li>`).join("")}</ol>
          ${course}</section>
          ${all && me.role === "staff" ? `<section class="card" style="margin-top:16px"><div class="card__h"><div><h2>Next: knowledge assessment</h2>
            <p class="card__sub">10 questions on what you just watched. You need 80% (8 of 10) to pass.</p></div>
            <a class="btn" href="#/assessment">${me.assessment?.passed ? "See your score" : "Take the assessment"}</a></div></section>` : ""}`
        : `<div class="card locked">${ico("video")}<h2>Training videos coming soon</h2><p>Blackmon Tutoring will add your training videos here. Check back soon.</p>${course}</div>`}`;
      // A video they haven't finished can't be skipped ahead: seeking past the furthest point they've
      // watched jumps back there. (Rewatching and going back are fine.)
      el.querySelectorAll("[data-vid]").forEach((video) => {
        if (list.find((x) => x.id === Number(video.dataset.vid))?.watched) return;
        let furthest = 0;
        video.addEventListener("timeupdate", () => { if (!video.seeking && video.currentTime - furthest < 1.5) furthest = Math.max(furthest, video.currentTime); });
        video.addEventListener("seeking", () => { if (video.currentTime > furthest + 1) video.currentTime = furthest; });
        video.addEventListener("ratechange", () => { if (video.playbackRate > 2) video.playbackRate = 2; });
      });
      el.querySelectorAll("[data-vid]").forEach((video) => video.addEventListener("ended", async () => {
        const v = list.find((x) => x.id === Number(video.dataset.vid));
        if (v.watched) return;
        try {
          const r = await api(`/api/training/${v.id}/watched`, { method: "POST" });
          list = r.videos;
          if (r.done) state.me = await api("/api/me");
          if (r.done) renderShell(); // the Assessment page has just opened
          draw();
          if (r.done) el.querySelector(".card")?.insertAdjacentHTML("beforebegin", '<p class="alert alert--ok" role="status">You\'ve watched all your training videos. Your onboarding status is now “Training Complete”.</p>');
        } catch {}
      }));
    };
    draw();
  },
  // Camp staff only: the 10-question knowledge assessment, after the training videos. The portal grades
  // it against the answer key; below 80% they see feedback on what they missed and retake it.
  async assessment(el, me) {
    const intro = "10 questions on your camp counselor training. Each question is worth 1 point; you need 80% (8 of 10) to pass.";
    el.innerHTML = header("Knowledge assessment", intro) + '<p class="hint">Loading…</p>';
    let a;
    try { a = await api("/api/assessment"); }
    catch (err) { el.innerHTML = header("Knowledge assessment") + `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`; return; }
    if (!a.unlocked) {
      el.innerHTML = header("Knowledge assessment", intro) + `<div class="card locked">${ico("lock")}<h2>Finish your training first</h2>
        <p>The assessment opens once you've watched all your training videos.</p><a class="btn" href="#/training">Go to training</a></div>`;
      return;
    }
    const optText = (q, k) => q?.options.find((o) => o.key === k)?.text || k;
    const label = (q, k) => (q?.type === "truefalse" ? k : `${k}. ${optText(q, k)}`);
    const resultHtml = (t, latest) => `<section class="card">
      <div class="card__h"><div><h2>${latest ? "Your score" : "Earlier attempt"}</h2><p class="card__sub">${esc(when(t.submittedAt))}</p></div>
        ${t.passed ? '<span class="pill pill--ok">Passed</span>' : '<span class="pill pill--warn">Review and retake required</span>'}</div>
      <p class="qscore"><b>${t.score} / ${t.total}</b><span>${t.percent}%</span></p>
      ${latest ? (t.passed ? `<p class="alert alert--ok" role="status" style="margin:0 0 16px">${ico("check")} You passed. Thank you for completing your training!</p>
        ${state.me.acknowledgment?.signed ? "" : `<div class="formbar" style="margin:0 0 16px"><span>Next: sign your Staff Training Acknowledgment.</span><a class="btn" href="#/acknowledgment">${ico("pen")} Sign acknowledgment</a></div>`}`
        : `<p class="alert alert--info" role="status" style="margin:0 0 16px">You need 80% (8 of 10) to pass. Read the feedback below, rewatch the training scenes it mentions, then retake the assessment.</p>`) : ""}
      <ol class="qres">${t.results.map((r) => { const q = a.questions.find((x) => x.n === r.n); return `<li class="${r.correct ? "is-ok" : "is-miss"}">
        <div class="qres__h"><b>Question ${r.n}</b>${r.correct ? `<span class="pill pill--ok">${ico("check")} Correct</span>` : '<span class="pill pill--warn">Incorrect</span>'}</div>
        ${latest ? `<p>${esc(q?.prompt || "")}</p><p class="hint">${r.picked.length > 1 ? "Your answers" : "Your answer"}: ${r.picked.map((k) => esc(label(q, k))).join("<br>")}</p>
          ${r.correct ? "" : `<p class="qres__why"><b>Why:</b> ${esc(r.why)}${r.review ? ` <span class="hint">Review: ${esc(r.review)}</span>` : ""}</p>`}` : ""}
      </li>`; }).join("")}</ol>
      ${latest && !t.passed ? '<div class="formbar"><span></span><button class="btn" type="button" data-retake>Retake the assessment</button></div>' : ""}</section>`;
    const draw = (showForm, notice = "") => {
      const [latest, ...older] = a.attempts;
      const passed = a.attempts.some((t) => t.passed);
      const form = showForm && !passed;
      el.innerHTML = `${header("Knowledge assessment", intro, passed ? '<span class="pill pill--ok">Passed</span>' : "")}
        ${notice}
        ${form ? `<form class="quiz card" novalidate>
          <p class="hint" style="margin:0 0 6px">Mark one answer for each question. For question 6, mark <b>all</b> answers that apply: it scores only when every correct answer, and no incorrect one, is marked.</p>
          ${a.questions.map((q) => `<fieldset data-q="${q.n}"><legend><span class="quiz__n">Question ${q.n} · ${q.type === "multi" ? "Select all that apply" : q.type === "truefalse" ? "True or false" : "Multiple choice"}</span>${esc(q.prompt)}</legend>
            ${q.options.map((o) => `<label class="quiz__opt"><input type="${q.type === "multi" ? "checkbox" : "radio"}" name="q${q.n}" value="${esc(o.key)}">
              <span>${q.type === "truefalse" ? "" : `<b>${esc(o.key)}.</b> `}${esc(o.text)}</span></label>`).join("")}
            <p class="fld__err" data-err hidden>Please answer this question.</p></fieldset>`).join("")}
          <p class="hint">${esc(a.note || "")}</p>
          <div class="formbar"><div data-msg></div><button class="btn" type="submit">Submit answers</button></div>
        </form>` : resultHtml(latest, true)}
        ${older.length || (form && latest) ? `<h2 class="qhist">Earlier attempts</h2><ul class="qhist__list">${(form ? a.attempts : older).map((t) => `<li><span>${esc(when(t.submittedAt))}</span>
          <b>${t.score} / ${t.total} · ${t.percent}%</b>${t.passed ? '<span class="pill pill--ok">Passed</span>' : '<span class="pill pill--warn">Retake required</span>'}</li>`).join("")}</ul>` : ""}`;
      el.querySelector("[data-retake]")?.addEventListener("click", () => { draw(true); el.scrollIntoView({ block: "start" }); });
      const f = el.querySelector("form.quiz");
      if (!f) return;
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const answers = {};
        let first = null;
        f.querySelectorAll("[data-q]").forEach((fs) => {
          const picked = [...fs.querySelectorAll("input:checked")].map((i) => i.value), n = fs.dataset.q;
          fs.querySelector("[data-err]").hidden = !!picked.length;
          fs.classList.toggle("is-missing", !picked.length);
          if (!picked.length) first ||= fs;
          answers[n] = fs.querySelector('input[type="checkbox"]') ? picked : picked[0];
        });
        if (first) { first.scrollIntoView({ block: "center" }); first.querySelector("input")?.focus(); return; }
        const btn = f.querySelector('button[type="submit"]'), msg = f.querySelector("[data-msg]");
        btn.disabled = true; btn.textContent = "Scoring…"; msg.innerHTML = "";
        try {
          const r = await api("/api/assessment", { method: "POST", body: JSON.stringify({ answers }) });
          a.attempts = r.attempts;
          state.me = await api("/api/me");
          draw(false);
          el.scrollIntoView({ block: "start" });
        } catch (err) {
          msg.innerHTML = `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`;
          btn.disabled = false; btn.textContent = "Submit answers";
        }
      });
    };
    draw(!a.attempts.length);
  },

  // Camp staff only: the Staff Training Acknowledgment, signed after passing the assessment. The
  // signed copy is the form filled in with their details and signature; Blackmon is notified.
  async acknowledgment(el, me) {
    const intro = "Confirm you've completed the Camp Counselor Training Program and understand your responsibilities.";
    el.innerHTML = header("Training acknowledgment", intro) + '<p class="hint">Loading…</p>';
    let a;
    try { a = await api("/api/acknowledgment"); }
    catch (err) { el.innerHTML = header("Training acknowledgment") + `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`; return; }
    if (!a.unlocked) {
      el.innerHTML = header("Training acknowledgment", intro) + `<div class="card locked">${ico("lock")}<h2>Pass the assessment first</h2>
        <p>You can sign the acknowledgment once you've passed the knowledge assessment.</p><a class="btn" href="#/assessment">Go to the assessment</a></div>`;
      return;
    }
    const statement = `<div class="ackstmt">${a.statement.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
    const draw = (signed, justSigned) => {
      const d = signed || a.details;
      const facts = `<dl class="kv ackfacts"><dt>Staff member</dt><dd>${esc(d.name)}</dd><dt>Role</dt><dd>${esc(d.role)}</dd>
        <dt>Camp location</dt><dd>${esc(d.location || "—")}</dd><dt>Training completed</dt><dd>${esc(d.trainingDate || "—")}</dd>
        <dt>Assessment score</dt><dd>${esc(d.score || "—")}</dd></dl>`;
      if (signed) {
        el.innerHTML = `${header("Training acknowledgment", intro, '<span class="pill pill--ok">Signed</span>')}
          ${justSigned ? `<p class="alert alert--ok" role="status" style="margin:0 0 16px">Thank you! Your acknowledgment is signed and Blackmon has a copy.</p>` : ""}
          <section class="card signed">${ico("check")}<div><h2>Signed on ${esc(shortDate(signed.signedAt))}</h2>
            <p>${esc(signed.signature)} signed the ${esc(a.title)}. Your camp director completes the supervisor review.</p>
            <p class="paybar"><a class="btn" href="/api/acknowledgment/signed" target="_blank" rel="noopener">View signed copy</a><a class="btn btn--ghost" href="/api/acknowledgment/signed?download=1">${ico("download")} Download</a></p></div></section>
          <section class="card" style="margin-top:16px"><h2 style="margin-bottom:12px">${esc(a.title)}</h2>${facts}<div style="margin-top:16px">${statement}</div></section>`;
        return;
      }
      const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      el.innerHTML = `${header("Training acknowledgment", intro)}
        <form class="card signform" novalidate>
          <h2>${ico("pen")} ${esc(a.title)}</h2>
          <p class="card__sub" style="margin-bottom:16px">Read the statement, then sign. Signing electronically is the same as signing on paper.</p>
          ${facts}
          <h3 style="margin:18px 0 8px;font-size:16px">Acknowledgment statement</h3>
          ${statement}
          <div class="grid grid--2" style="margin-top:18px">
            <div class="fld--full"><label class="label" for="ak-signature">Type your full name as your signature</label>
              <input class="input" id="ak-signature" name="signature" autocomplete="off" maxlength="100" aria-describedby="ak-signature-err">
              <p class="fld__err" id="ak-signature-err" data-err="signature"></p><p class="sigpreview" data-preview aria-hidden="true"></p></div>
            <div class="fld--full"><span class="label">Draw your signature <span class="muted">(optional)</span></span>
              <canvas class="sigpad" data-pad aria-label="Signature drawing area"></canvas>
              <p class="hint"><button type="button" class="linkbtn" data-clear>Clear drawing</button></p><p class="fld__err" data-err="drawing"></p></div>
            <div><span class="label">Date</span><p class="input input--static">${esc(today)}</p></div>
          </div>
          <label class="check"><input type="checkbox" name="agree" aria-describedby="ak-agree-err"> I have read and agree to the acknowledgment statement above.</label>
          <p class="fld__err" id="ak-agree-err" data-err="agree"></p>
          <div class="formbar formbar--end"><div data-msg></div><button class="btn" type="submit">${ico("pen")} Sign acknowledgment</button></div>
        </form>`;
      const form = el.querySelector("form"), btn = form.querySelector('button[type="submit"]'), msg = form.querySelector("[data-msg]");
      const setErr = (name, text) => {
        const out = form.querySelector(`[data-err="${name}"]`);
        if (out) out.textContent = text || "";
        form.elements[name]?.setAttribute?.("aria-invalid", text ? "true" : "false");
      };
      ["input", "change"].forEach((t) => form.addEventListener(t, (e) => { if (e.target.name) setErr(e.target.name, ""); }));
      const preview = form.querySelector("[data-preview]");
      form.elements.signature.addEventListener("input", () => { preview.textContent = form.elements.signature.value; });
      const pad = sigPad(form, () => setErr("drawing", ""));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = { signature: form.elements.signature.value, agree: form.elements.agree.checked };
        const { errors } = validateAcknowledgment(data);
        ["signature", "agree", "drawing"].forEach((k) => setErr(k, errors[k]));
        if (Object.keys(errors).length) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
        if (pad.drawn()) data.drawing = pad.dataUrl();
        btn.disabled = true; msg.innerHTML = "";
        try {
          const r = await api("/api/acknowledgment", { method: "POST", body: JSON.stringify(data) });
          state.me = await api("/api/me");
          draw(r.signed, true);
          el.scrollIntoView({ block: "start" });
        } catch (err) {
          if (err.fields) Object.entries(err.fields).forEach(([k, v]) => setErr(k, v));
          msg.innerHTML = `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`;
          btn.disabled = false;
        }
      });
    };
    draw(a.signed);
  },

  // Their own details. Only phone, location and ID proof can change; the rest is set by Blackmon.
  async settings(el, me) {
    el.innerHTML = header("Settings", "Your details on file with Blackmon Tutoring.") + '<p class="hint">Loading…</p>';
    let p;
    try { p = (await api("/api/profile")).profile; }
    catch (err) { el.innerHTML = header("Settings") + `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`; return; }
    const phoneText = (v) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(v || ""); return m ? `${m[1]}-${m[2]}-${m[3]}` : v || ""; };
    const ACCESS_NAMES = { none: "No access", view: "View only", admin: "Admin" };
    el.innerHTML = `${header("Settings", "Your details on file with Blackmon Tutoring. You can update your phone number, camp location and ID proof here.")}
      <div class="grid">
        <section class="card"><div class="card__h"><div><h2>Set by Blackmon Tutoring</h2>
          <p class="card__sub">To change any of these, call us at <a href="tel:+14692611625">469-261-1625</a>.</p></div>${ico("lock")}</div>
          <dl class="kv kv--left">
            <dt>Full name</dt><dd>${esc(`${p.firstName} ${p.lastName}`)}</dd>
            <dt>Email</dt><dd>${esc(p.email)}</dd>
            <dt>Gender</dt><dd>${esc(p.gender)}</dd>
            <dt>Role</dt><dd>${esc(p.role)}</dd>
            <dt>Admin dashboard access</dt><dd>${esc(ACCESS_NAMES[p.access] || "No access")}</dd>
          </dl></section>
        <form class="card" novalidate data-prof>
          <div class="card__h"><div><h2>Your details</h2><p class="card__sub">Saved to your Blackmon record; the Blackmon team sees the change right away.</p></div></div>
          <div class="grid grid--2">
            <div><label class="label" for="pf-phone">Phone number</label>
              <input class="input" id="pf-phone" name="phone" type="tel" autocomplete="tel" value="${esc(phoneText(p.phone))}" aria-describedby="pf-phone-h pf-phone-e" required>
              <p class="hint" id="pf-phone-h">US numbers can skip +1. Other countries: start with + and the country code.</p><p class="fld__err" id="pf-phone-e" data-err="phone"></p></div>
            <div><label class="label" for="pf-location">Camp location</label>
              <select class="input" id="pf-location" name="location" aria-describedby="pf-location-e">${LOCATIONS.map((l) => `<option ${l === p.location ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
              <p class="fld__err" id="pf-location-e" data-err="location"></p></div>
          </div>
          <div style="margin-top:18px"><span class="label">ID proof</span>
            <p class="curproof">${ico("doc")} <a href="/api/profile/id-proof" target="_blank" rel="noopener">${esc(p.idProofFileName)}</a></p>
            <label class="drop drop--sm">${ico("upload")}<strong data-pickname>Upload a new ID proof (optional)</strong>
              <span class="hint">${ID_PROOF.label}, up to 5 MB. It replaces the one above.</span>
              <input type="file" name="idProof" accept="${ID_PROOF.accept}" aria-describedby="pf-idProof-e"></label>
            <p class="fld__err" id="pf-idProof-e" data-err="idProof"></p></div>
          <div class="formbar formbar--end"><div data-msg></div><button class="btn" type="submit">Save changes</button></div>
        </form>
      </div>`;
    const form = el.querySelector("[data-prof]"), out = form.querySelector("[data-msg]"), btn = form.querySelector('button[type="submit"]');
    const fileIn = form.elements.idProof;
    const showErrs = (errs) => form.querySelectorAll("[data-err]").forEach((e) => {
      e.textContent = errs[e.dataset.err] || "";
      form.elements[e.dataset.err]?.setAttribute("aria-invalid", errs[e.dataset.err] ? "true" : "false");
    });
    fileIn.addEventListener("change", () => {
      const f = fileIn.files[0];
      form.querySelector("[data-pickname]").textContent = f ? `Selected: ${f.name}` : "Upload a new ID proof (optional)";
      showErrs({ idProof: fileError(f, ID_PROOF, { required: false }) || "" });
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      out.innerHTML = "";
      const errs = {};
      if (!form.elements.phone.value.trim()) errs.phone = "Please enter a phone number.";
      else if (!normalizePhone(form.elements.phone.value)) errs.phone = "Please enter a valid phone number. US numbers can skip +1; others start with + and the country code.";
      const fe = fileError(fileIn.files[0], ID_PROOF, { required: false });
      if (fe) errs.idProof = fe;
      showErrs(errs);
      if (Object.keys(errs).length) return form.querySelector('[aria-invalid="true"]')?.focus();
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const r = await api("/api/profile", { method: "PUT", body: new FormData(form) });
        if (r.changed.length && r.changed.includes("location")) state.me = await api("/api/me");
        const msg = r.changed.length ? `Saved: ${r.changed.join(", ")} updated.` : "Nothing changed.";
        await VIEWS.staff.settings(el, state.me);
        el.querySelector("[data-msg]").innerHTML = `<p class="alert alert--ok" role="status">${esc(msg)}</p>`;
      } catch (err) {
        if (err.fields) showErrs(err.fields);
        out.innerHTML = `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`;
        btn.disabled = false; btn.textContent = "Save changes";
      }
    });
  },

  video(el, me) {
    // Camp staff record their intro after the training videos (the server enforces it too).
    if (me.role === "staff" && !me.hasVideo && me.assessment && !me.assessment.unlocked) {
      el.innerHTML = header("Intro video") + `<div class="card locked">${ico("lock")}<h2>Finish your training first</h2>
        <p>You can record your intro video once you've watched all your training videos.</p><a class="btn" href="#/training">Go to training</a></div>`;
      return;
    }
    el.innerHTML = `
      ${header("Intro video", "Record a short hello (under 2 minutes): your name, what you'll be doing at Blackmon, and something fun about you.")}
      ${me.hasVideo ? `<p class="alert alert--ok">We have your intro video. Thank you! You can upload a new one below if you'd like to replace it.</p>` : ""}
      <div data-mine></div>
      <section class="card" style="margin-top:16px">
        <form novalidate>
          <label class="drop" data-drop>${ico("upload")}<strong>Choose a video or drop it here</strong><span class="hint">MP4 or MOV, up to 200 MB</span>
            <input type="file" accept="video/*" data-file></label>
          <p class="hint" data-picked></p>
          <div class="bar" hidden data-bar><i></i></div>
          <div class="formbar"><div data-msg></div><button class="btn" type="submit" disabled>${ico("upload")} Upload video</button></div>
        </form>
      </section>`;
    // The video they uploaded last (what the Blackmon team sees).
    const showMine = () => api("/api/video").then(({ video: v }) => {
      const box = el.querySelector("[data-mine]");
      if (box) box.innerHTML = v ? `<section class="card" style="margin-top:16px"><div class="card__h"><div><h2>Your intro video</h2>
        <p class="card__sub">Uploaded ${esc(new Date(v.uploadedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · ${esc(v.name)}</p></div></div>
        <video controls preload="metadata" playsinline src="/api/video/file?v=${encodeURIComponent(v.uploadedAt)}" style="width:100%;max-width:560px;border-radius:12px;background:#0B1F3F"></video></section>` : "";
    }).catch(() => {});
    showMine();
    const form = el.querySelector("form"), input = el.querySelector("[data-file]"), drop = el.querySelector("[data-drop]");
    const btn = form.querySelector('button[type="submit"]'), out = form.querySelector("[data-msg]"), bar = el.querySelector("[data-bar]");
    let file = null;
    const pick = (f) => {
      file = f && f.type.startsWith("video/") ? f : null;
      el.querySelector("[data-picked]").textContent = file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : f ? "That isn't a video file." : "";
      btn.disabled = !file;
    };
    input.addEventListener("change", () => pick(input.files[0]));
    ["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("is-over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!file) return;
      if (file.size > 200 * 1048576) { out.innerHTML = `<p class="alert alert--err">That file is over 200 MB. Try a shorter clip.</p>`; return; }
      btn.disabled = true; bar.hidden = false; out.innerHTML = "";
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/video");
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) bar.firstElementChild.style.width = `${Math.round((ev.loaded / ev.total) * 100)}%`; };
      xhr.onload = async () => {
        let data = {}; try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 200) {
          state.me = await api("/api/me");
          out.innerHTML = `<p class="alert alert--ok" role="status">Uploaded! Your onboarding status is now “Video Submitted”.</p>`;
          showMine();
        } else { out.innerHTML = `<p class="alert alert--err" role="alert">${esc(data.error || "Upload failed. Please try again.")}</p>`; btn.disabled = false; }
      };
      xhr.onerror = () => { out.innerHTML = `<p class="alert alert--err" role="alert">Upload failed. Check your connection and try again.</p>`; btn.disabled = false; };
      xhr.send(file);
    });
  },
};
VIEWS.staff = STAFF;
VIEWS.tutor = Object.fromEntries(Object.entries(STAFF).filter(([k]) => k !== "assessment" && k !== "acknowledgment")); // both are for camp staff

boot();
