// Blackmon admin dashboard (/admin). Talks only to /api/admin/*. The server checks every
// permission; this page just hides what the signed-in person can't use.

import { GENDERS, STAFF_ROLES, LOCATIONS, ACCESS, ID_PROOF, PHOTO, validateStaff, fileError, nameError, emailError, passwordError } from "/validate.js";

const $app = document.getElementById("app");
const state = { me: null, status: null, parents: null, parentsAt: null, staff: null };

// ---------- helpers ----------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }));
// Total paid: always cents ($1,234.00); "—" when GHL has no value.
const cents = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }));
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const phoneText = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? `+1 ${m[1]}-${m[2]}-${m[3]}` : p || ""; };
const fullName = (p) => `${p.firstName || ""} ${p.lastName || ""}`.trim();
const initials = (p) => (fullName(p) || p.email || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const avatar = (u, cls = "ava") => `<span class="${cls}" aria-hidden="true">${u.photoUrl ? `<img src="${esc(u.photoUrl)}" alt="">` : esc(initials(u))}</span>`;
const levelPill = (u) => `<span class="pill ${u.level === "view" ? "pill--sky" : "pill--ok"}">${esc(u.levelName)}</span>`;

const I = {
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3 2.6 3.5 5.5"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 16.5c.7-1.6 2-2.5 3.5-2.5s2.8.9 3.5 2.5M15 10h3M15 14h3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.9L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.9 3.9l1.1-1.4M20 20v-4.5h-4.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.8 3.7M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
  todo: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  send: '<path d="m4 12 16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="m15.5 10 6-3.5v11l-6-3.5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  cap: '<path d="M2 9.5 12 5l10 4.5-10 4.5z"/><path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5M22 9.5V15"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};
const ico = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const header = (title, sub, extra = "") => `<div class="page-h"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${extra}</div>`;

async function api(path, opts = {}) {
  const json = opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {};
  const res = await fetch(path, { credentials: "same-origin", ...opts, headers: { ...json, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/admin/login") && !path.startsWith("/api/admin/setup")) {
    state.me = null;
    renderLogin("Your session ended. Please sign in again.");
  }
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status, fields: data.fields });
  return data;
}

function toast(text, kind = "ok") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; document.body.append(box); }
  const t = document.createElement("p");
  t.className = `toast toast--${kind}`;
  t.setAttribute("role", kind === "err" ? "alert" : "status");
  t.textContent = text;
  box.append(t);
  setTimeout(() => t.remove(), kind === "ok" ? 4500 : 7000);
}

// The Parents "Meal plan" cell (p.mealState from the server): the saved plan in short, with special
// requests in red and "View" for the full plan; or why there's none.
function mealCell(p) {
  if (p.mealState === "missing") return '<span class="pill pill--warn">Not submitted</span>';
  if (p.mealState === "pending") return '<span class="muted">Pending enrollment form</span>';
  if (p.mealState !== "submitted") return '<span class="pill pill--todo">No lunch</span>';
  const picked = p.mealItems.filter((x) => x.choice), asks = p.mealItems.filter((x) => x.request);
  return `<div class="mealcell"><b>Submitted${p.mealSavedAt ? ` ${esc(day(p.mealSavedAt))}` : ""} · ${picked.length} ${picked.length === 1 ? "meal" : "meals"}</b>
    <span class="mealcell__txt">${esc(picked.map((x) => `${x.meal}: ${x.choice}`).join(" · "))}</span>
    ${asks.length ? `<span class="mealcell__req">${esc(asks.map((x) => `${x.meal}: ${x.request}`).join(" · "))}</span>` : ""}
    <button type="button" class="linkbtn" data-meal="${esc(p.contactId)}">View</button></div>`;
}
// The full meal plan in a popup.
function mealDialog(p) {
  const d = document.createElement("dialog");
  d.className = "chatpop";
  d.setAttribute("aria-labelledby", "mealpop-title");
  d.innerHTML = `<form method="dialog">
    <div class="chatpop__head"><h2 id="mealpop-title">${esc(p.name)}'s meal plan</h2>
      <p>${esc([p.childName && `For ${p.childName}`, p.mealSavedAt ? `Saved ${when(p.mealSavedAt)}` : "Saved before the portal kept dates"].filter(Boolean).join(" · "))}</p></div>
    <dl class="dl">${p.mealItems.map((x) => `<dt>${esc(x.meal)}</dt><dd>${esc(x.choice || "—")}${x.request ? `<span class="mealcell__req">Special request: ${esc(x.request)}</span>` : ""}</dd>`).join("")}</dl>
    <div class="confirm__bar"><a class="btn btn--ghost" href="/api/admin/parents/${encodeURIComponent(p.contactId)}/meals.csv">${ico("download")} Export CSV</a><button class="btn" value="close" autofocus>Close</button></div></form>`;
  document.body.append(d);
  d.showModal();
  d.addEventListener("close", () => d.remove());
}

// Resolves true when the person clicks the confirm button; Cancel or Esc resolves false.
function confirmDialog(title, text, okLabel, danger = true) {
  const d = document.createElement("dialog");
  d.className = "confirm";
  d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p>${esc(text)}</p>
    <div class="confirm__bar"><button class="btn btn--ghost" value="cancel" autofocus>Cancel</button><button class="btn ${danger ? "btn--danger" : ""}" value="ok">${esc(okLabel)}</button></div></form>`;
  document.body.append(d);
  d.showModal();
  return new Promise((resolve) => d.addEventListener("close", () => { resolve(d.returnValue === "ok"); d.remove(); }));
}

// Shows a spinner on a button while `work` runs; restores it afterwards.
async function busy(btn, label, work) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin" aria-hidden="true"></span> ${esc(label)}`;
  try { return await work(); } finally { btn.disabled = false; btn.innerHTML = html; }
}

// Inline error helpers for a form whose error slots are <p data-err="field">.
function formErrors(form) {
  const set = (name, msg) => {
    const out = form.querySelector(`[data-err="${name}"]`);
    if (out) out.textContent = msg || "";
    form.querySelector(`[name="${name}"]`)?.setAttribute("aria-invalid", msg ? "true" : "false");
  };
  const show = (errs) => form.querySelectorAll("[data-err]").forEach((n) => set(n.dataset.err, errs[n.dataset.err]));
  const focus = () => { const bad = form.querySelector('[aria-invalid="true"]'); bad?.scrollIntoView({ block: "center" }); bad?.focus(); };
  return { set, show, focus };
}
// Adds a show/hide button inside every password field in `root`.
function passwordToggles(root) {
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    const wrap = document.createElement("div");
    wrap.className = "pw";
    input.replaceWith(wrap);
    wrap.append(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw__btn";
    const set = (shown) => {
      input.type = shown ? "text" : "password";
      btn.innerHTML = ico(shown ? "eyeOff" : "eye");
      btn.setAttribute("aria-label", shown ? "Hide password" : "Show password");
      btn.setAttribute("aria-pressed", String(shown));
    };
    btn.onclick = () => { set(input.type === "password"); input.focus(); };
    set(false);
    wrap.append(btn);
  });
}

const errSlot = (name) => `<p class="fld__err" id="e-${name}" data-err="${name}"></p>`;

// ---------- boot + routing ----------
const route = () => location.hash.replace(/^#\/?/, "") || "parents";
async function loadMe() {
  const d = await api("/api/admin/me");
  state.me = d.user;
  state.unread = d.unreadNotifications || 0;
}

async function boot() {
  try { state.status = await api("/api/admin/status"); } catch { state.status = {}; }
  if (location.pathname === "/admin/setup") return renderSetup(new URLSearchParams(location.search).get("token"));
  try { await loadMe(); } catch { state.me = null; }
  state.me ? renderShell() : renderLogin();
}
window.addEventListener("hashchange", () => state.me && renderShell());

// ---------- sign-in ----------
function authPage(title, sub, body) {
  $app.innerHTML = `<div class="auth">
    <aside class="auth__art">
      <div class="photo auth__photo"><img src="/img/camp-signin.jpg" alt="Blackmon campers and coaches in team jerseys on the sports field"></div>
      <div class="auth__cap">
        <p class="eyebrow">Blackmon admin</p>
        <p class="auth__hero">The team behind every camp day.</p>
        <div class="auth__thumbs">
          <div class="photo"><img src="/img/gallery/camp-5.jpg" alt="Campers practicing soccer drills with a coach" style="object-position:center 62%" loading="lazy"></div>
          <div class="photo"><img src="/img/gallery/camp-6.jpg" alt="Campers taking a shaded break under the tent" loading="lazy"></div>
        </div>
      </div>
    </aside>
    <div class="auth__main"><div class="auth__card">
      <a class="brand" href="/admin"><img class="logo" src="/logo/blackmon-tutoring-logo.png" alt="Blackmon Tutoring"></a>
      <h1>${title}</h1><p class="si__sub">${sub}</p>
      <div class="card">${body}</div>
      <p class="hint" style="text-align:center;margin-top:16px">Parents, staff and tutors sign in at the <a href="/">Blackmon Portal</a>.</p>
    </div></div>
  </div>`;
  passwordToggles($app);
}

function renderLogin(notice = "") {
  const d = state.status?.demoLogins;
  authPage("Admin sign-in", "For the Blackmon team. Use your email and password.", `
    ${notice ? `<p class="alert alert--info" style="margin:0 0 16px">${esc(notice)}</p>` : ""}
    <form novalidate>
      <div><label class="label" for="l-email">Email</label><input class="input" id="l-email" name="email" type="email" autocomplete="username" required></div>
      <div><label class="label" for="l-pw">Password</label><input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required>
        <p class="hint" style="text-align:right"><button type="button" class="linkbtn" data-forgot>Forgot password?</button></p></div>
      <button class="btn btn--block" type="submit">Sign in</button>
      <div data-msg></div>
    </form>
    ${d ? `<div class="si__demo" style="margin-top:18px"><strong>Demo mode</strong>: sample data, nothing reaches GHL. Password for both: <code>${esc(d.password)}</code>
      <ul>${d.accounts.map((a) => `<li>${esc(a)}</li>`).join("")}<li>Owner: the ADMIN_EMAIL / ADMIN_PASSWORD in .env</li></ul></div>` : ""}`);
  const form = $app.querySelector("form"), msg = form.querySelector("[data-msg]"), btn = form.querySelector('button[type="submit"]');
  form.querySelector("[data-forgot]").onclick = () => renderForgot(form.elements.email.value.trim());
  form.elements.email.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim(), password = form.elements.password.value;
    if (!email || !password) { msg.innerHTML = `<p class="alert alert--err" role="alert">Enter your email and password.</p>`; return; }
    msg.innerHTML = "";
    try {
      await busy(btn, "Signing in…", () => api("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) }));
      await loadMe();
      if (!location.hash) history.replaceState(null, "", "/admin#/parents");
      renderShell();
    } catch (err) {
      msg.innerHTML = `<p class="alert alert--err" role="alert">${esc(err.message)}</p>`;
      form.elements.password.select();
    }
  });
}

function renderForgot(email = "") {
  authPage("Forgot password", "Enter your dashboard email. We'll send you a link to choose a new password.", `
    <form novalidate>
      <div><label class="label" for="fp-email">Email</label><input class="input" id="fp-email" name="email" type="email" autocomplete="username" value="${esc(email)}" required></div>
      <button class="btn btn--block" type="submit">Email me a reset link</button>
      <div data-msg></div>
      <p class="hint" style="margin:0;text-align:center"><button type="button" class="linkbtn" data-back>Back to sign-in</button></p>
    </form>`);
  const form = $app.querySelector("form"), msg = form.querySelector("[data-msg]"), btn = form.querySelector('button[type="submit"]');
  form.querySelector("[data-back]").onclick = () => renderLogin();
  form.elements.email.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = form.elements.email.value.trim();
    const err = emailError(value.toLowerCase());
    if (err) { msg.innerHTML = `<p class="alert alert--err" role="alert">${esc(err)}</p>`; return; }
    try {
      await busy(btn, "Sending…", () => api("/api/admin/forgot", { method: "POST", body: JSON.stringify({ email: value }) }));
      msg.innerHTML = `<p class="alert alert--ok" role="status">If ${esc(value)} has dashboard access, we've emailed a reset link. It works once and expires in 1 hour. Check your spam folder too.</p>`;
    } catch (e2) { msg.innerHTML = `<p class="alert alert--err" role="alert">${esc(e2.message)}</p>`; }
  });
}

async function renderSetup(token) {
  // Keep the token out of the address bar (and browser history) once it's read.
  history.replaceState(null, "", "/admin/setup");
  let info;
  try { info = await api(`/api/admin/setup?token=${encodeURIComponent(token || "")}`); }
  catch (err) {
    authPage("Link expired", "", `<p class="alert alert--err" style="margin:0">${esc(err.message)}</p><p style="margin:16px 0 0"><a href="/admin">Go to admin sign-in</a></p>`);
    return;
  }
  authPage(info.reset ? "Reset your password" : `Welcome, ${esc(info.firstName)}`,
    info.reset ? "Choose a new password for your dashboard account." : `Set a password for your <b>${esc(info.level)}</b> dashboard access.`, `
    <form novalidate>
      <div><label class="label" for="s-email">Email</label><input class="input" id="s-email" value="${esc(info.email)}" readonly autocomplete="username"></div>
      <div><label class="label" for="s-pw">New password</label><input class="input" id="s-pw" name="password" type="password" autocomplete="new-password" aria-describedby="s-pw-hint e-password" required>
        <p class="hint" id="s-pw-hint">At least 8 characters.</p>${errSlot("password")}</div>
      <div><label class="label" for="s-pw2">Confirm password</label><input class="input" id="s-pw2" name="confirm" type="password" autocomplete="new-password" aria-describedby="e-confirm" required>${errSlot("confirm")}</div>
      <button class="btn btn--block" type="submit">${info.reset ? "Save new password and sign in" : "Set password and sign in"}</button>
    </form>`);
  const form = $app.querySelector("form"), btn = form.querySelector("button"), fe = formErrors(form);
  form.elements.password.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = form.elements.password.value, confirm = form.elements.confirm.value;
    const errs = {};
    const pe = passwordError(password, info.email);
    if (pe) errs.password = pe; else if (password !== confirm) errs.confirm = "The two passwords don't match.";
    fe.show(errs);
    if (Object.keys(errs).length) return fe.focus();
    try {
      await busy(btn, "Saving…", () => api("/api/admin/setup", { method: "POST", body: JSON.stringify({ token, password, confirm }) }));
      history.replaceState(null, "", "/admin#/parents");
      toast(info.reset ? "Password changed. You're signed in." : "Password set. Welcome to the dashboard!");
      boot();
    } catch (err) { if (err.fields) fe.show(err.fields); toast(err.message, "err"); }
  });
}

async function signOut() {
  await api("/api/admin/logout", { method: "POST" }).catch(() => {});
  state.me = null;
  stopHandoffWatch();
  history.replaceState(null, "", "/admin");
  renderLogin();
}

// ---------- shell ----------
const NAV = [
  { r: "parents", label: "Parents", icon: "team" },
  { r: "followups", label: "Missing steps", icon: "todo" },
  { r: "roster", label: "Roster", icon: "file" },
  { r: "staff", label: "Camp staff", icon: "id" },
  { r: "tutors", label: "Tutors", icon: "cap" },
  { r: "training", label: "Training videos", icon: "video" },
  { r: "assessments", label: "Assessments", icon: "todo" },
  { r: "intros", label: "Intro videos", icon: "play" },
  { r: "notifications", label: "Notifications", icon: "bell", badge: true },
  { r: "announcements", label: "Announcements", icon: "megaphone" },
  { r: "camp", label: "Camp info", icon: "info" },
  { r: "week", label: "This week", icon: "calendar" },
  { r: "settings", label: "Settings", icon: "gear" },
];

function renderShell() {
  const me = state.me;
  let r = route();
  let arg;
  if (r.startsWith("parents/")) { arg = decodeURIComponent(r.slice(8)); r = "parent"; } // #/parents/<contactId>
  if (r.startsWith("chats/")) { arg = decodeURIComponent(r.slice(6)); r = "chat"; }     // #/chats/<conversationId>
  if (!VIEWS[r]) { r = "parents"; history.replaceState(null, "", "#/parents"); }
  const navOn = r === "parent" ? "parents" : r === "chat" ? "notifications" : r;
  $app.innerHTML = `
  <div class="shell">
    <div class="topbar">
      <a class="brand brand--chip" href="#/parents"><img class="logo" src="/logo/blackmon-tutoring-logo.png" alt="Blackmon Tutoring"><span>Admin dashboard</span></a>
      <button class="menu-btn" data-menu aria-label="Open menu" aria-expanded="false">${ico("menu")}</button>
    </div>
    <nav class="side" aria-label="Admin">
      <a class="brand brand--chip" href="#/parents"><img class="logo" src="/logo/blackmon-tutoring-logo.png" alt="Blackmon Tutoring"><span>Admin dashboard</span></a>
      <ul class="nav">
        ${NAV.map((n) => `<li><a href="#/${n.r}" ${n.r === navOn ? 'aria-current="page"' : ""}>${ico(n.icon)}<span>${n.label}</span>${n.badge && state.unread ? `<span class="badge" aria-label="${state.unread} unread">${state.unread}</span>` : ""}</a></li>`).join("")}
      </ul>
      <div class="side__foot">
        <span><a href="/" target="_blank" rel="noopener">Open the parent &amp; staff portal</a></span>
        <a class="who who--admin" href="#/settings" title="Your profile and password">${avatar(me)}<div><b>${esc(fullName(me) || me.email)}</b><span>${esc(me.email)}</span>${levelPill(me)}</div></a>
        <button class="side__out" data-out>Sign out</button>
      </div>
    </nav>
    <div class="scrim" data-scrim></div>
    <main class="main main--wide"><div class="main__in">
      ${state.status?.demo ? `<p class="demo-bar">Demo data. Nothing here reaches GHL, and emails print in the terminal instead of sending.</p>` : ""}
      ${(state.status?.aiProblem || []).map((a) => `<p class="alert alert--err" role="alert" style="margin:0 0 18px">${a.kind === "bad_key"
        ? `<b>The ${esc(a.provider)} API key in app/.env isn't valid</b> (since ${esc(when(a.since))}). ${a.provider === "Anthropic" ? "Create an API key (it starts with <code>sk-ant-api</code>) at <a href=\"https://platform.claude.com/\" target=\"_blank\" rel=\"noopener\">platform.claude.com</a> → API Keys, put it in ANTHROPIC_API_KEY and restart. Until then, Ask Blackmon answers with OpenAI." : "Check OPENAI_API_KEY and restart."}`
        : `<b>The ${esc(a.provider)} account has no credits left</b> (since ${esc(when(a.since))}): ${a.provider === "Anthropic" ? "Claude is down, so Ask Blackmon answers with OpenAI if it can" : "Talk's speech and announcement translations are down"}. <a href="${esc(a.billing)}" target="_blank" rel="noopener">Add credits</a>; it works again right away.`}</p>`).join("")}
      ${me.canManage ? "" : `<p class="viewonly">${ico("eye")} <span><b>View only.</b> You can look at everything here, but only an admin can make changes.</span></p>`}
      <div data-view></div>
    </div></main>
  </div>`;
  const shell = $app.querySelector(".shell"), menu = $app.querySelector("[data-menu]");
  const toggle = (open) => { shell.classList.toggle("is-open", open); menu.setAttribute("aria-expanded", String(open)); };
  menu.onclick = () => toggle(!shell.classList.contains("is-open"));
  $app.querySelector("[data-scrim]").onclick = () => toggle(false);
  $app.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => toggle(false)));
  $app.querySelector("[data-out]").onclick = signOut;
  VIEWS[r]($app.querySelector("[data-view]"), me, arg);
  window.scrollTo(0, 0);
  startHandoffWatch();
}

// ---------- Parents ----------
// Send notification / Delete, shared by the Parents list and the parent detail page.
// Invite status: sent to the parent, or (PARENT_MESSAGES=test) a test copy sent to the test contact.
// "Sent Nov 2, 10:21 pm" (the latest invite), with the number of sends and GHL's message id on hover.
const sentAt = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\s?(AM|PM)$/, (m, x) => ` ${x.toLowerCase()}`);
const inviteHtml = (p) => {
  const paidAgain = p.paidAgain ? `<span class="sub">Paid again – invite already sent${!p.inviteSentAt && p.firstInviteAt ? ` ${esc(sentAt(p.firstInviteAt))}` : ""}</span>` : "";
  if (p.inviteSentAt) {
    const tip = [`${p.inviteCount || 1} ${p.inviteCount > 1 ? "sends" : "send"}`, p.inviteMessageId && `GHL message ${p.inviteMessageId}`, p.inviteSmsNote && `SMS: ${p.inviteSmsNote}`].filter(Boolean).join(" · ");
    // The SMS sent with the latest invite (none for invites sent before invites had an SMS).
    const sms = { sent: " · SMS ✓", test: " · SMS → test phone", skipped: " · SMS –", failed: " · SMS ✗" }[p.inviteSms] || "";
    const smsNote = p.inviteSms === "skipped" ? `<span class="sub">SMS skipped: ${esc(p.inviteSmsNote || "")}</span>`
      : p.inviteSms === "failed" ? `<span class="sub" style="color:var(--err)">SMS failed: ${esc(p.inviteSmsNote || "")}</span>` : "";
    return `<div><span class="pill pill--ok" title="${esc(tip)}">${p.inviteSms ? "Email ✓" : "Sent"}${esc(sms)} ${esc(sentAt(p.inviteSentAt))}</span>${smsNote}${p.inviteCount > 1 ? `<span class="sub">${p.inviteCount} sends</span>` : ""}${paidAgain}</div>`;
  }
  if (p.paidAgain) return `<div><span class="pill pill--sky">Paid again – invite already sent</span>${p.firstInviteAt ? `<span class="sub">Sent ${esc(sentAt(p.firstInviteAt))} to this email</span>` : ""}</div>`;
  return '<span class="pill pill--todo">Not sent</span>';
};

// p: { contactId, name, email, inviteSentAt }. done() runs after a successful change.
async function notifyParent(p, btn, done) {
  const again = p.inviteSentAt ? " again" : "";
  if (!(await confirmDialog(`Email ${p.name}${again}?`, `We'll send “Your Blackmon Portal login – Winter Camp 2026” to ${p.email} with the portal link and sign-in steps, text the same link to their phone (if they have one and haven't opted out of SMS), and set Portal - Role = Parent and Access Granted = Yes on their GHL contact.`, "Send invite", false))) return;
  try {
    const r = await busy(btn, "Sending…", () => api(`/api/admin/parents/${encodeURIComponent(p.contactId)}/notify`, { method: "POST" }));
    Object.assign(p, { inviteSentAt: r.inviteSentAt, inviteCount: r.inviteCount, inviteMessageId: r.inviteMessageId, inviteSms: r.inviteSms, inviteSmsNote: r.inviteSmsNote });
    const sms = { sent: " and by SMS", test: "; the SMS went to the test phone", skipped: ` (SMS skipped: ${r.inviteSmsNote})`, failed: ` (SMS failed: ${r.inviteSmsNote})` }[r.inviteSms] || "";
    toast(`Portal invite sent to ${p.email}${sms}.`, r.inviteSms === "failed" ? "err" : "ok");
    done();
  } catch (err) { toast(err.message, "err"); }
}
// how "deleted": Delete (their Winter Camp 2026 opportunity is deleted in GHL); "lost": Remove from
// camp (set to Lost in GHL, kept for history: refunds, cancellations). Both done by the server.
const REMOVE_TEXT = {
  deleted: (n) => [`Remove ${n} from Winter Camp 2026?`, "This deletes their Winter Camp 2026 opportunity in GHL and removes their portal access. Payment records in GHL are kept.", "Delete"],
  lost: (n) => [`Remove ${n} from camp?`, "This sets their Winter Camp 2026 opportunity to Lost in GHL (it stays there for history, e.g. a refund or cancellation) and removes their portal access. Payment records in GHL are kept.", "Remove from camp"],
};
async function removeParent(p, btn, done, how = "deleted") {
  if (!(await confirmDialog(...REMOVE_TEXT[how](p.name || p.email)))) return;
  try {
    await busy(btn, "Removing…", () => api(`/api/admin/parents/${encodeURIComponent(p.contactId)}${how === "lost" ? "?how=lost" : ""}`, { method: "DELETE" }));
    state.parents = (state.parents || []).filter((x) => x.contactId !== p.contactId);
    toast(how === "lost" ? `${p.name} was removed from camp (set to Lost in GHL).` : `${p.name} was removed from Winter Camp 2026 and deleted from Paid (won) in GHL.`);
    done();
  } catch (err) { toast(err.message, "err"); }
}

// Waivers are signed in the portal: "x/y signed" from the portal's own signatures.
const docsPill = (d) => !d || !d.waivers ? '<span class="pill pill--todo">None yet</span>'
  : d.signed === d.waivers ? `<span class="pill pill--ok">${d.signed}/${d.waivers} signed</span>`
  : `<span class="pill pill--warn">${d.signed}/${d.waivers} signed</span>`;

async function parentsView(el, me) {
  el.innerHTML = `<section class="welcome photo">
      <img src="/img/camp-signin.jpg" alt="Blackmon campers and coaches in team jerseys on the sports field" style="object-position:center 55%">
      <div class="welcome__txt"><p class="eyebrow">Admin dashboard</p><h2>Welcome back${me.firstName ? `, ${esc(me.firstName)}` : ""}!</h2>
        <p>Families, staff and camp updates, all in one place.</p></div>
    </section>
    ${header("Parents", "Every <b>Paid (won)</b> opportunity in the Winter Camp 2026 pipeline in GHL, read from the opportunity. Click a name for the details.",
    `<div class="tools"><label class="sr" for="p-q">Search parents</label><input class="input" id="p-q" type="search" placeholder="Search name, email, phone, child…" data-q>
      <button class="btn btn--ghost" data-refresh>${ico("refresh")} Refresh</button>
      <a class="btn btn--ghost" href="/api/admin/meals.csv">${ico("download")} Export meal plans</a>
      ${me.canManage ? `<button class="btn btn--ghost" data-sync>${ico("file")} Sync documents</button>
        <button class="btn btn--ghost" data-childsync>${ico("refresh")} Sync from Winter Camp 2026</button>` : ""}</div>`)}
    <section class="card" data-list><p class="hint">Loading parents from GHL…</p></section>
    <p class="muted" data-at style="margin-top:10px"></p>`;
  const box = el.querySelector("[data-list]"), q = el.querySelector("[data-q]");

  async function load(refresh) {
    try {
      const data = await api(`/api/admin/parents${refresh === true ? "?refresh=1" : refresh === "fresh" ? "?fresh=1" : ""}`);
      state.parents = data.parents;
      state.parentsAt = data.loadedAt;
      draw();
    } catch (err) { box.innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; }
  }

  function draw() {
    const term = q.value.trim().toLowerCase();
    const list = state.parents.filter((p) => !term || [p.name, p.email, p.phone, p.childName].join(" ").toLowerCase().includes(term));
    el.querySelector("[data-at]").textContent = `${state.parents.length} Paid (won) ${state.parents.length === 1 ? "opportunity" : "opportunities"} in Winter Camp 2026 · loaded from GHL ${when(state.parentsAt)}`;
    if (!state.parents.length) {
      box.innerHTML = `<div class="empty">${ico("team")}<h2>No paid families yet</h2><p>Families appear here once their Winter Camp 2026 opportunity is moved to “Paid (won)” in GHL.</p></div>`;
      return;
    }
    if (!list.length) { box.innerHTML = `<div class="empty"><p>No parents match “${esc(q.value)}”.</p></div>`; return; }
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Contact</th><th>Child</th><th>Package</th><th>Package amount</th><th>Total paid</th><th>Lunch</th><th>Sports</th><th>Meal plan</th><th>Extended care</th><th>Transport</th><th>Location</th><th>Waivers</th><th>Portal invite</th>${me.canManage ? '<th><span class="sr">Actions</span></th>' : ""}</tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td data-label="Name"><a class="namelink" href="#/parents/${encodeURIComponent(p.contactId)}"><b>${esc(p.name || "—")}</b></a></td>
        <td data-label="Contact"><div>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "—"}${p.phone ? `<span class="sub"><a href="tel:${esc(p.phone)}">${esc(phoneText(p.phone))}</a></span>` : ""}</div></td>
        <td data-label="Child"><div>${esc(p.childName || "—")}${p.childAge ? `<span class="sub">Age ${esc(p.childAge)}</span>` : ""}</div></td>
        <td data-label="Package"><div>${esc(p.package || "—")}${p.campPackage ? `<span class="sub">${esc(p.campPackage)}</span>` : ""}</div></td>
        <td data-label="Package amount">${money(p.packageAmount)}</td>
        <td data-label="Total paid"><div>${esc(cents(p.totalPaid))}${p.discountCode ? `<span class="sub">${esc(p.discountCode)}</span>` : ""}</div></td>
        <td data-label="Lunch">${esc(p.lunch || "—")}</td>
        <td data-label="Sports">${esc(p.sports || "—")}</td>
        <td data-label="Meal plan">${mealCell(p)}</td>
        <td data-label="Extended care">${esc(p.extendedCareLabel || "—")}</td>
        <td data-label="Transport">${esc(p.transport || "—")}</td>
        <td data-label="Location">${esc(p.location || "—")}</td>
        <td data-label="Waivers">${docsPill(p.docs)}</td>
        <td data-label="Portal invite">${inviteHtml(p)}</td>
        ${me.canManage ? `<td class="act">
          <button type="button" class="btn btn--sm ${p.inviteSentAt ? "btn--ghost" : ""}" data-notify="${esc(p.contactId)}" ${p.email ? "" : "disabled"}>${ico("mail")} ${p.inviteSentAt || p.paidAgain ? "Resend invite" : "Send invite"}</button>
          <button type="button" class="btn btn--ghost btn--sm" data-lost="${esc(p.contactId)}" aria-label="Remove ${esc(p.name)} from camp (Lost)">Remove from camp</button>
          <button type="button" class="btn btn--ghost btn--sm btn--del" data-remove="${esc(p.contactId)}" aria-label="Delete ${esc(p.name)}">Delete</button></td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
    const byId = (id) => state.parents.find((p) => p.contactId === id);
    box.querySelectorAll("[data-notify]").forEach((b) => (b.onclick = () => notifyParent(byId(b.dataset.notify), b, draw)));
    box.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = () => removeParent(byId(b.dataset.remove), b, draw)));
    box.querySelectorAll("[data-lost]").forEach((b) => (b.onclick = () => removeParent(byId(b.dataset.lost), b, draw, "lost")));
    box.querySelectorAll("[data-meal]").forEach((b) => (b.onclick = () => mealDialog(byId(b.dataset.meal))));
  }

  q.addEventListener("input", () => state.parents && draw());
  el.querySelector("[data-refresh]").onclick = (e) => busy(e.currentTarget, "Refreshing…", () => load(true));
  el.querySelector("[data-sync]")?.addEventListener("click", (e) => busy(e.currentTarget, "Syncing…", async () => {
    try {
      const r = await api("/api/admin/documents/sync", { method: "POST" });
      toast(`Documents synced for ${r.parents} ${r.parents === 1 ? "family" : "families"}: ${r.added} added, ${r.removed} removed.`);
      await load(false);
    } catch (err) { toast(err.message, "err"); }
  }));
  el.querySelector("[data-childsync]")?.addEventListener("click", (e) => busy(e.currentTarget, "Syncing…", async () => {
    try {
      const r = await api("/api/admin/opportunities/sync-child", { method: "POST" });
      toast(`Loaded ${r.parents} Paid (won) ${r.parents === 1 ? "opportunity" : "opportunities"} from Winter Camp 2026. Documents: ${r.added} added, ${r.removed} removed.`);
      await load(false);
    } catch (err) { toast(err.message, "err"); }
  }));
  if (state.parents) draw();
  load("fresh"); // opening the page always shows GHL's current values
}

// ---------- Roster: every child from the enrollment forms (Camp Enrollment Forms Build Spec, section 4) ----------
async function rosterView(el, me) {
  const f = { camp: "", location: "", session: "", list: "all" };
  try { Object.assign(f, JSON.parse(sessionStorage.getItem("rosterFilters") || "{}")); } catch {}
  let data = null, term = "";
  el.innerHTML = `${header("Roster", "One row per child from the enrollment form parents submit in the portal (saved on their GHL contact), with their registration where the form is still blank. Filter by camp, location and week, switch to a quick list, and download it for Excel.")}
    <section class="card"><div data-filters class="filters"></div></section>
    <section class="card" style="margin-top:16px"><div data-list><p class="hint">Loading…</p></div></section>`;
  const query = () => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();

  async function load() {
    try { sessionStorage.setItem("rosterFilters", JSON.stringify(f)); } catch {}
    try { data = await api(`/api/admin/roster?${query()}`); f.camp = data.camp; draw(); }
    catch (err) { el.querySelector("[data-list]").innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; }
  }
  function draw() {
    const opt = (v, t, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`;
    el.querySelector("[data-filters]").innerHTML = `
      <div><label class="label" for="ro-camp">Camp</label><select class="input" id="ro-camp" data-f="camp">${data.camps.map((c) => opt(c.camp, `${c.camp === "all" ? "All paid families" : c.camp} (${c.n} ${c.n === 1 ? "child" : "children"})`, f.camp)).join("")}</select></div>
      <div><label class="label" for="ro-list">List</label><select class="input" id="ro-list" data-f="list">${data.lists.map((l) => opt(l.key, l.label, f.list)).join("")}</select></div>
      <div><label class="label" for="ro-loc">Location</label><select class="input" id="ro-loc" data-f="location">${opt("", "All locations", f.location)}${data.locations.map((l) => opt(l.value, l.label, f.location)).join("")}</select></div>
      ${data.sessions.length ? `<div><label class="label" for="ro-ses">Week</label><select class="input" id="ro-ses" data-f="session">${opt("", "All weeks", f.session)}${data.sessions.map((x) => opt(x.id, x.label, f.session)).join("")}</select></div>` : ""}
      <div><label class="label" for="ro-q">Search</label><input class="input" id="ro-q" type="search" placeholder="Child, parent, phone…" value="${esc(term)}" data-q></div>
      <div style="align-self:end"><a class="btn" href="/api/admin/roster.csv?${esc(query())}">${ico("download")} Download CSV</a></div>`;
    el.querySelectorAll("[data-f]").forEach((x) => (x.onchange = () => { f[x.dataset.f] = x.value; load(); }));
    el.querySelector("[data-q]").oninput = (e) => { term = e.target.value; table(); };
    table();
  }
  function table() {
    const box = el.querySelector("[data-list]"), t = term.trim().toLowerCase();
    const rows = data.rows.filter((r) => !t || [r.child, r.parents, r.phoneEmail, r.emergency, r.pickups].join(" ").toLowerCase().includes(t));
    if (!data.rows.length) { box.innerHTML = `<div class="empty">${ico("file")}<h2>No children on this list</h2><p>Try another camp, location or week. Paid families appear here as soon as they reach Winter Camp 2026 Paid (won).</p></div>`; return; }
    box.innerHTML = `<p class="muted" style="margin:0 0 12px">${rows.length} ${rows.length === 1 ? "child" : "children"}${t ? ` matching “${esc(term)}”` : ""} ·
      ${data.submitted} of ${data.total} from a submitted enrollment form; “from registration” = taken from their payment until the form is in.</p>
      <div class="tbl-wrap"><table class="tbl tbl--roster"><thead><tr>${data.columns.map(([, label]) => `<th>${esc(label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${data.columns.map(([k, label]) => `<td data-label="${esc(label)}">${k === "child"
        ? `<a class="namelink" href="#/parents/${encodeURIComponent(r.contactId)}"><b>${esc(r.child)}</b></a>`
        : k === "submitted" ? esc(day(r.submitted)) : esc(r[k] || "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  load();
}

// ---------- Parent detail ----------
const STATUS_PILL = { new: '<span class="pill pill--warn">New</span>', viewed: '<span class="pill pill--sky">Viewed</span>' };
const dl = (rows) => `<dl class="dl">${rows.map((r) => `<dt>${esc(r.name)}</dt><dd>${r.html ?? (r.value === "" || r.value == null ? '<span class="muted">—</span>' : esc(r.value))}</dd>`).join("")}</dl>`;

async function parentDetailView(el, me, id) {
  el.innerHTML = `${header("Parent details", "", '<a class="btn btn--ghost" href="#/parents">Back to parents</a>')}<section class="card"><p class="hint">Loading this parent's Winter Camp 2026 opportunity from GHL…</p></section>`;
  let data;
  try { data = await api(`/api/admin/parents/${encodeURIComponent(id)}`); }
  catch (err) { el.querySelector(".card").innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; return; }
  let p = data.parent;
  const base = `/api/admin/parents/${encodeURIComponent(id)}`;

  const docsHtml = () => data.documents.length ? `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Document</th><th>Type</th><th>Status</th>${me.canManage ? '<th><span class="sr">Actions</span></th>' : ""}</tr></thead>
      <tbody>${data.documents.map((d) => `<tr>
        <td data-label="Document"><div><b>${esc(d.title)}</b><span class="sub">Assigned ${esc(day(d.assignedAt))}${d.lunchOnly ? " · lunch families only" : ""}</span></div></td>
        <td data-label="Type">${d.type === "sign" ? "Waiver" : "Read"}</td>
        <td data-label="Status"><div>${d.status === "signed" ? `<span class="pill pill--ok">Signed ${esc(day(d.signedAt))}</span><span class="sub">${esc(d.signature.parentName)} (${esc(d.signature.relationship)}) for ${esc(d.signature.childName)}</span>` : STATUS_PILL[d.status]}${d.viewedAt && d.status !== "signed" ? `<span class="sub">Opened ${esc(when(d.viewedAt))}</span>` : ""}</div></td>
        ${me.canManage ? `<td class="act">${d.status === "signed" ? `<a class="btn btn--ghost btn--sm" href="${base}/documents/${d.id}/signed" target="_blank" rel="noopener">View signed PDF</a>
          <a class="btn btn--ghost btn--sm" href="${base}/documents/${d.id}/signed?download=1">${ico("download")} Download</a>
          <button type="button" class="btn btn--ghost btn--sm btn--del" data-reset="${d.id}">Reset waiver</button>` : ""}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>`
    : '<p class="hint" style="margin:0">No documents yet. They\'re assigned when the parent first signs in, or with “Sync documents”.</p>';

  function render() {
    const oppRows = (o) => [
      { name: "Name", value: o.name }, { name: "Email", value: o.email }, { name: "Phone", value: o.phone ? phoneText(o.phone) : "" },
      { name: "Child name", value: o.childName }, { name: "Child age", value: o.childAge },
      { name: "Package", value: o.package }, { name: "Camp package", value: o.campPackage }, { name: "Package amount", value: o.packageAmount == null ? "" : money(o.packageAmount) },
      { name: "Total paid", value: o.totalPaid == null ? "" : cents(o.totalPaid) },
      { name: "Lunch", value: o.lunch }, { name: "Sports", value: o.sports }, { name: "Extended care", value: o.extendedCareLabel }, { name: "Transport", value: o.transport }, { name: "Discount code", value: o.discountCode }, { name: "Location", value: o.location },
      ...o.otherFields,
      { name: "Opportunity ID", value: o.opportunityId }, { name: "Contact ID", value: o.contactId },
    ];
    el.innerHTML = `${header(esc(p.name || "—"), `${esc(p.email || "—")} · Winter Camp 2026 · Paid (won)`,
      `<div class="tools">${me.canManage ? `<button class="btn btn--sm ${p.inviteSentAt ? "btn--ghost" : ""}" data-notify ${p.email && !p.hidden ? "" : "disabled"}>${ico("mail")} ${p.inviteSentAt || p.paidAgain ? "Resend invite" : "Send invite"}</button>
        ${p.hidden ? "" : '<button class="btn btn--ghost btn--sm" data-lost>Remove from camp</button><button class="btn btn--ghost btn--sm btn--del" data-remove>Delete</button>'}` : ""}
        <button class="btn btn--ghost btn--sm" data-reload>${ico("refresh")} Reload from GHL</button>
        <a class="btn btn--ghost btn--sm" href="#/parents">Back to parents</a></div>`)}
      <p class="muted" style="margin:-8px 0 16px;font-size:14px">Last synced from GHL: ${esc(when(data.syncedAt))}</p>
      ${p.hidden ? '<p class="alert alert--info" style="margin:0 0 18px">This parent was removed from the portal (Access Granted = No) and is hidden from the Parents list.</p>' : ""}
      <div class="stack">
        ${data.opportunities.map((o) => `<section class="card"><div class="card__h"><div><h2>Winter Camp 2026 opportunity</h2><p class="card__sub">Every value here is read from the opportunity in GHL</p></div>
            <span class="pill pill--ok">Paid (won)</span></div>${dl(oppRows(o))}</section>`).join("")}
        <section class="card">
          <div class="card__h"><div><h2>Enrollment form</h2><p class="card__sub">${data.enrollment ? `${esc(data.enrollment.camp)} · ${data.enrollment.submittedAt ? `submitted ${esc(when(data.enrollment.submittedAt))}` : "submitted"}${data.enrollment.source === "submission" ? " · answers from the GHL form submission (not on this contact)" : ""}` : "Not submitted yet"}</p></div>
            ${data.enrollment?.children.length ? `<a class="btn btn--ghost btn--sm" href="#/roster">Open roster</a>` : ""}</div>
          ${data.enrollment?.children.length ? data.enrollment.children.map((c, i) => `${data.enrollment.children.length > 1 ? `<h3 style="margin:${i ? "24px" : "0"} 0 8px">${esc(c.child)}</h3>` : ""}
            ${dl(data.enrollment.columns.filter(([k]) => !["camp", "submitted"].includes(k)).map(([k, label]) => ({ name: label, value: c[k] })))}`).join("")
            : `<p class="hint" style="margin:0">${data.enrollment ? "GHL has the submission, but no answers could be read from it." : "The parent hasn\'t submitted the enrollment form in the portal yet."}</p>`}
        </section>
        <section class="card">
          <div class="card__h"><div><h2>Meal plan</h2><p class="card__sub">${data.mealsSavedAt ? `Saved by the parent in the portal ${esc(when(data.mealsSavedAt))}` : data.mealsSource === "ghl" ? "Saved by the parent before meal plans were kept in the portal" : "Not saved yet"}${p.lunch === "Yes" ? "" : ` · Lunch: ${esc(p.lunch || "—")}`}</p></div>
            ${data.meals.some((x) => x.choice) ? `<a class="btn btn--ghost btn--sm" href="${base}/meals.csv">${ico("download")} Export CSV</a>` : ""}</div>
          ${data.meals.some((x) => x.choice) ? dl(data.meals.map((x) => ({ name: x.meal, html: x.choice ? `${esc(x.choice)}${x.request ? `<span class="sub">Special request: ${esc(x.request)}</span>` : ""}` : '<span class="muted">—</span>' })))
            : '<p class="hint" style="margin:0">The parent hasn\'t saved a meal plan in the portal yet.</p>'}
        </section>
        <section class="card">
          <div class="card__h"><div><h2>Documents &amp; waivers</h2><p class="card__sub">${data.documents.filter((d) => d.type === "sign" && d.status === "signed").length} of ${data.documents.filter((d) => d.type === "sign").length} waivers signed · GHL E-Sign Status: ${esc(p.esign || "—")}</p></div>
            ${me.canManage ? `<button class="btn btn--ghost btn--sm" data-sync>${ico("refresh")} Sync documents</button>` : ""}</div>
          <div data-docs>${docsHtml()}</div>
        </section>
        <section class="card"><div class="card__h"><div><h2>Portal</h2></div></div>
          ${dl([{ name: "Portal - Role", value: p.role }, { name: "Portal - Access Granted", value: p.accessGranted },
            { name: "Portal invite", html: inviteHtml(p) }])}</section>
      </div>`;

    el.querySelector("[data-notify]")?.addEventListener("click", (e) => notifyParent(p, e.currentTarget, render));
    // Reads this parent's opportunity and contact again from GHL and redraws the page.
    el.querySelector("[data-reload]")?.addEventListener("click", (e) => busy(e.currentTarget, "Reloading…", async () => {
      try { data = await api(`${base}?reload=1`); p = data.parent; render(); toast("Reloaded from GHL."); }
      catch (err) { toast(err.message, "err"); }
    }));
    el.querySelector("[data-remove]")?.addEventListener("click", (e) => removeParent(p, e.currentTarget, () => { location.hash = "#/parents"; }));
    el.querySelector("[data-lost]")?.addEventListener("click", (e) => removeParent(p, e.currentTarget, () => { location.hash = "#/parents"; }, "lost"));
    el.querySelector("[data-sync]")?.addEventListener("click", (e) => busy(e.currentTarget, "Syncing…", async () => {
      try {
        const r = await api(`${base}/sync`, { method: "POST" });
        data.documents = r.documents;
        toast(r.added.length || r.removed.length ? `Documents updated: ${r.added.length} added, ${r.removed.length} removed.` : "Documents are already up to date.");
        render();
      } catch (err) { toast(err.message, "err"); }
    }));
    el.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = async () => {
      const d = data.documents.find((x) => x.id === b.dataset.reset);
      if (!(await confirmDialog(`Reset the ${d.title}?`, `${p.name} will need to sign it again. The current signed copy is kept on file, and the reset is recorded in the activity log.`, "Reset waiver"))) return;
      try {
        const r = await busy(b, "Resetting…", () => api(`${base}/documents/${d.id}/reset`, { method: "POST" }));
        data.documents = r.documents;
        toast(`${d.title} reset. ${p.name} can sign it again.`);
        render();
      } catch (err) { toast(err.message, "err"); }
    }));
  }
  render();
}

// ---------- Notifications ----------
function setBadge(n) {
  state.unread = n;
  const link = $app.querySelector('.nav a[href="#/notifications"]');
  if (!link) return;
  link.querySelector(".badge")?.remove();
  if (n) link.insertAdjacentHTML("beforeend", `<span class="badge" aria-label="${n} unread">${n}</span>`);
}

async function notificationsView(el, me) {
  el.innerHTML = `${header("Notifications", "Waivers parents sign, training acknowledgments camp staff sign, and “talk to a person” requests from the Ask Blackmon chat show up here.", '<button class="btn btn--ghost" data-all>Mark all as read</button>')}
    <section class="card" data-list><p class="hint">Loading…</p></section>`;
  const box = el.querySelector("[data-list]");
  let list = [];
  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });

  function draw() {
    if (!list.length) { box.innerHTML = `<div class="empty"><h2>No notifications yet</h2><p>When a parent signs a waiver, a camp staff member signs their training acknowledgment, or someone asks to talk to a person, you'll see it here.</p></div>`; return; }
    box.innerHTML = `<ul class="anotes">${list.map((n) => `<li class="${n.read ? "" : "is-unread"}">
      <div><b>${esc(n.title)}</b><span class="sub">${esc(when(n.at))}</span>
        <span class="links">${n.conversationId ? `<a href="#/chats/${encodeURIComponent(n.conversationId)}">View chat</a>` : ""}
        ${n.contactId ? `<a href="#/parents/${encodeURIComponent(n.contactId)}">Parent details</a>` : ""}
        ${n.signedActive && me.canManage ? `<a href="/api/admin/parents/${encodeURIComponent(n.contactId)}/documents/${encodeURIComponent(n.docId)}/signed" target="_blank" rel="noopener">View signed PDF</a>` : ""}
        ${n.docId && !n.signedActive ? '<span class="muted">Signature was reset</span>' : ""}
        ${n.ackId ? `${me.canManage ? `<a href="/api/admin/acknowledgments/${encodeURIComponent(n.ackId)}/file" target="_blank" rel="noopener">View signed PDF</a>` : ""}<a href="#/assessments">Staff training</a>` : ""}</span></div>
      <button type="button" class="btn btn--ghost btn--sm" data-toggle="${n.id}">${n.read ? "Mark unread" : "Mark read"}</button></li>`).join("")}</ul>`;
    box.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => {
      const n = list.find((x) => x.id === Number(b.dataset.toggle));
      try {
        const r = n.read ? await post(`/api/admin/notifications/${n.id}/unread`) : await post("/api/admin/notifications", { ids: [n.id] });
        n.read = !n.read; setBadge(r.unread); draw();
      } catch (err) { toast(err.message, "err"); }
    }));
  }

  el.querySelector("[data-all]").onclick = async (e) => {
    try {
      const r = await busy(e.currentTarget, "Saving…", () => post("/api/admin/notifications", { all: true }));
      list.forEach((n) => (n.read = true)); setBadge(r.unread); draw();
    } catch (err) { toast(err.message, "err"); }
  };
  try { const r = await api("/api/admin/notifications"); list = r.notifications; setBadge(r.unread); draw(); }
  catch (err) { box.innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; }
}

// ---------- messages to parents: shared bits ----------
const LANG_NAMES = { en: "English", es: "Spanish", hi: "Hindi", ur: "Urdu", ar: "Arabic", vi: "Vietnamese", zh: "Chinese", fr: "French" };
// Says where reminders and announcements go: the test contact (PARENT_MESSAGES=test) or parents.
const sentSummary = (r) => [`${r.email} ${r.email === 1 ? "email" : "emails"}`, `${r.sms} ${r.sms === 1 ? "text" : "texts"}`,
  r.skipped ? `${r.skipped} skipped (no email/phone)` : "", r.failed ? `${r.failed} failed` : ""].filter(Boolean).join(", ");

// ---------- Missing steps (what each family still has to do) ----------
const STEPS = [
  { key: "enroll", label: "Enrollment form" },
  { key: "meal", label: "Meal plan" },
  { key: "waiver", label: "Waivers" },
  { key: "payment", label: "Payment" },
];
const missingOf = (p) => STEPS.filter((s) => p.steps[s.key] === false).map((s) => s.key);
function stepCell(p, key) {
  const v = p.steps[key];
  if (v === null) return '<span class="muted">No lunch</span>';
  if (v) return '<span class="pill pill--ok">Done</span>';
  if (key === "meal") return '<span class="pill pill--warn">Meal plan not submitted</span>';
  if (key === "payment" && p.steps.overdue) return `<span class="pill pill--warn">${esc(money(p.steps.overdue.amount))} overdue</span><span class="sub">Due ${esc(day(p.steps.overdue.date + "T12:00:00"))}</span>`;
  return '<span class="pill pill--warn">Missing</span>';
}

async function followupsView(el, me) {
  let list = null, mode = null, loadedAt = null;
  const picked = new Set();
  el.innerHTML = `${header("Missing steps", "What each paid family still has to do. Select families and send a reminder: each parent gets only their own missing steps, in the language they use in the portal.",
    `<div class="tools"><label class="sr" for="f-q">Search families</label><input class="input" id="f-q" type="search" placeholder="Search name, child, email…" data-q>
      <button class="btn btn--ghost" data-refresh>${ico("refresh")} Refresh</button></div>`)}
    <section class="card">
      <div class="filters">
        <div><label class="label" for="f-loc">Location</label><select class="input" id="f-loc" data-loc><option value="">All locations</option><option>Little Elm</option><option value="-">No location yet</option></select></div>
        <div><label class="label" for="f-step">Show</label><select class="input" id="f-step" data-step><option value="any">Families with something missing</option>
          ${STEPS.map((s) => `<option value="${s.key}">Missing: ${s.label}</option>`).join("")}<option value="all">All families</option></select></div>
      </div>
      <p class="muted" data-counts style="margin:14px 0 0"></p>
    </section>
    <section class="card" style="margin-top:18px" data-list><p class="hint">Loading families from GHL…</p></section>
    ${me.canManage ? `<div class="fbar" data-bar hidden>
      <b data-picked></b>
      <label class="check"><input type="checkbox" data-ch="email" checked> Email</label>
      <label class="check"><input type="checkbox" data-ch="sms"> Text message</label>
      <button class="btn" data-send>${ico("send")} Send reminder</button>
    </div>` : ""}
    <p class="muted" data-at style="margin-top:10px"></p>`;
  const box = el.querySelector("[data-list]"), q = el.querySelector("[data-q]"), loc = el.querySelector("[data-loc]"), step = el.querySelector("[data-step]");

  const visible = () => {
    const term = q.value.trim().toLowerCase();
    return list.filter((p) => {
      if (loc.value === "-" ? p.location : loc.value && !String(p.location || "").startsWith(loc.value)) return false;
      const miss = missingOf(p);
      if (step.value === "any" && !miss.length) return false;
      if (STEPS.some((s) => s.key === step.value) && !miss.includes(step.value)) return false;
      return !term || [p.name, p.childName, p.email, p.phone].join(" ").toLowerCase().includes(term);
    });
  };

  function bar() {
    const b = el.querySelector("[data-bar]");
    if (!b) return;
    b.hidden = !picked.size;
    b.querySelector("[data-picked]").textContent = `${picked.size} ${picked.size === 1 ? "family" : "families"} selected`;
  }

  function draw() {
    const counts = STEPS.map((s) => `${s.label}: ${list.filter((p) => p.steps[s.key] === false).length}`).join(" · ");
    el.querySelector("[data-counts]").textContent = `${list.length} paid ${list.length === 1 ? "family" : "families"} · still missing: ${counts}`;
    el.querySelector("[data-at]").textContent = `Loaded from GHL ${when(loadedAt)}`;
    const rows = visible();
    for (const id of [...picked]) if (!list.some((p) => p.contactId === id && missingOf(p).length)) picked.delete(id);
    if (!list.length) { box.innerHTML = `<div class="empty">${ico("team")}<h2>No paid families yet</h2></div>`; return bar(); }
    if (!rows.length) { box.innerHTML = `<div class="empty">${ico("todo")}<h2>Nothing to show</h2><p>${step.value === "any" ? "Every family in this view has done all their steps." : "No families match these filters."}</p></div>`; return bar(); }
    const selectable = rows.filter((p) => missingOf(p).length);
    const allOn = selectable.length && selectable.every((p) => picked.has(p.contactId));
    box.innerHTML = `<div class="tbl-wrap"><table class="tbl tbl--steps">
      <thead><tr>${me.canManage ? `<th><label class="pickbox"><input type="checkbox" data-all aria-label="Select every family shown that has a missing step" ${allOn ? "checked" : ""} ${selectable.length ? "" : "disabled"}></label></th>` : ""}
        <th>Family</th><th>Location</th><th>Language</th>${STEPS.map((s) => `<th>${s.label}</th>`).join("")}<th>Last reminder</th></tr></thead>
      <tbody>${rows.map((p) => `<tr>
        ${me.canManage ? `<td data-label="Select"><label class="pickbox"><input type="checkbox" data-pick="${esc(p.contactId)}" aria-label="Select ${esc(p.name)}" ${picked.has(p.contactId) ? "checked" : ""} ${missingOf(p).length ? "" : "disabled"}></label></td>` : ""}
        <td data-label="Family"><div><a class="namelink" href="#/parents/${encodeURIComponent(p.contactId)}"><b>${esc(p.name)}</b></a>
          <span class="sub">${p.childName ? `Child: ${esc(p.childName)} · ` : ""}${esc(p.email || "No email")}${p.phone ? "" : " · no phone"}</span></div></td>
        <td data-label="Location">${esc(p.location || "—")}</td>
        <td data-label="Language">${esc(LANG_NAMES[p.language] || p.language)}</td>
        ${STEPS.map((s) => `<td data-label="${s.label}"><div>${stepCell(p, s.key)}</div></td>`).join("")}
        <td data-label="Last reminder">${p.lastReminded ? esc(when(p.lastReminded)) : '<span class="muted">Never</span>'}</td>
      </tr>`).join("")}</tbody></table></div>`;
    box.querySelector("[data-all]")?.addEventListener("change", (e) => { selectable.forEach((p) => (e.target.checked ? picked.add(p.contactId) : picked.delete(p.contactId))); draw(); });
    box.querySelectorAll("[data-pick]").forEach((c) => c.addEventListener("change", () => { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); draw(); }));
    bar();
  }

  async function load(refresh) {
    try {
      const d = await api(`/api/admin/followups${refresh ? "?refresh=1" : ""}`);
      list = d.parents; mode = d.mode; loadedAt = d.loadedAt;
      draw();
    } catch (err) { box.innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; }
  }

  [q, loc, step].forEach((x) => x.addEventListener("input", () => list && draw()));
  el.querySelector("[data-refresh]").onclick = (e) => busy(e.currentTarget, "Refreshing…", () => load(true));
  el.querySelector("[data-send]")?.addEventListener("click", async (e) => {
    const sendBtn = e.currentTarget; // e.currentTarget is null once the confirm dialog has been awaited
    const channels = [...el.querySelectorAll("[data-ch]:checked")].map((c) => c.dataset.ch);
    if (!channels.length) return toast("Choose email, text message, or both.", "err");
    const chosen = list.filter((p) => picked.has(p.contactId));
    const langs = [...new Set(chosen.map((p) => LANG_NAMES[p.language]))].join(", ");
    const how = channels.map((c) => (c === "email" ? "email" : "text message")).join(" and ");
    if (!(await confirmDialog(`Send a reminder to ${chosen.length} ${chosen.length === 1 ? "family" : "families"}?`,
      `Each parent gets a ${how} listing only the steps they still have to do, in their language (${langs}).${mode.live ? "" : ` Test mode: every message goes to ${mode.testEmail} instead.`}`, "Send reminders", false))) return;
    try {
      const r = await busy(sendBtn, "Sending…", () => api("/api/admin/followups/remind", { method: "POST", body: JSON.stringify({ contactIds: [...picked], channels }) }));
      for (const [id, at] of Object.entries(r.lastReminded)) { const p = list.find((x) => x.contactId === id); if (p) p.lastReminded = at; }
      picked.clear();
      toast(`Reminders sent to ${r.families} ${r.families === 1 ? "family" : "families"}: ${sentSummary(r)}${r.live ? "" : " (test mode)"}.${r.nothingMissing ? ` ${r.nothingMissing} had nothing missing anymore.` : ""}`, r.failed ? "warn" : "ok");
      draw();
    } catch (err) { toast(err.message, "err"); }
  });
  load(false);
}

// ---------- Announcements (portal Notifications, plus email / SMS in each parent's language) ----------
// Announcement attachments (the server checks the same rules).
const ATTACH = { maxBytes: 10 * 1024 * 1024, max: 5, exts: ["pdf", "jpg", "jpeg", "png"], accept: ".pdf,.jpg,.jpeg,.png" };
const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fileChips = (files, removable = false) => files.length ? `<ul class="files">${files.map((f) => `<li>
  ${ico("file")}<a href="/api/admin/announcements/files/${esc(f.id)}" target="_blank" rel="noopener">${esc(f.name)}</a><span class="muted">${fileSize(f.size)}</span>
  ${removable ? `<button type="button" class="iconbtn" data-unattach="${esc(f.id)}" aria-label="Remove ${esc(f.name)}" title="Remove">${ico("trash")}</button>` : ""}</li>`).join("")}</ul>` : "";
const audienceText = (a, parents) => a.type === "location" ? `${a.location} families`
  : a.type === "families" ? (a.contactIds.length === 1 && parents?.find((p) => p.contactId === a.contactIds[0])?.name) || `${a.contactIds.length} chosen ${a.contactIds.length === 1 ? "family" : "families"}`
  : "Every family";
const channelText = (ch) => ["Portal", ch.includes("email") && "email", ch.includes("sms") && "text"].filter(Boolean).join(" + ");
// datetime-local value <-> ISO time
const localInput = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

async function announcementsView(el, me) {
  let list = [], mode = null, editing = null, preview = null, families = new Set(), files = [];
  el.innerHTML = `${header("Announcements", "Write once in English. Each parent gets it in their own language, in the portal and, if you choose, by email and text.")}
    <div class="stack">
      ${me.canManage ? `<section class="card"><div class="card__h"><div><h2 data-formtitle>New announcement</h2>
          <p class="card__sub" data-formsub>Translated automatically for each parent. Preview the translations before you send.</p></div></div>
        <form data-ann novalidate>
          <div class="grid">
            <div><label class="label" for="an-title">Title</label><input class="input" id="an-title" name="title" maxlength="120" aria-describedby="e-title">${errSlot("title")}</div>
            <div><label class="label" for="an-body">Message</label><textarea class="input" id="an-body" name="body" rows="5" maxlength="2000" aria-describedby="h-body e-body"></textarea>
              <p class="hint" id="h-body"><span data-count>0</span> / 2000</p>${errSlot("body")}</div>
            <div><span class="label" id="l-att">Attachments (optional)</span>
              <div data-files></div>
              <label class="btn btn--ghost btn--sm filepick">${ico("upload")} <span data-pickl>Attach files</span>
                <input type="file" multiple accept="${ATTACH.accept}" data-filein aria-labelledby="l-att" aria-describedby="h-att e-attachments"></label>
              <p class="hint" id="h-att">PDF, JPG or PNG, up to 10 MB each, at most 5. Parents open them from their Notifications; emails and texts say there's an attachment in the portal.</p>${errSlot("attachments")}</div>
            <fieldset class="fset" data-lockable><legend class="label">Who gets it</legend>
              <div class="radios">
                <label class="check"><input type="radio" name="aud" value="all" checked> Every family</label>
                <label class="check"><input type="radio" name="aud" value="location"> One location</label>
                <label class="check"><input type="radio" name="aud" value="families"> Chosen families</label>
              </div>
              <div data-audloc hidden><label class="sr" for="an-loc">Location</label><select class="input" id="an-loc" name="location" style="max-width:260px"><option>Little Elm</option></select></div>
              <div data-audfam hidden>
                <label class="sr" for="an-fq">Search families</label><input class="input" id="an-fq" type="search" placeholder="Search families…" data-fq style="max-width:320px">
                <div class="picker" data-picker><p class="hint">Loading families…</p></div>
              </div>
              ${errSlot("audience")}
            </fieldset>
            <fieldset class="fset" data-lockable><legend class="label">How</legend>
              <div class="radios">
                <label class="check"><input type="checkbox" checked disabled> Portal Notifications</label>
                <label class="check"><input type="checkbox" name="email"> Email</label>
                <label class="check"><input type="checkbox" name="sms"> Text message (short version)</label>
              </div>
            </fieldset>
            <fieldset class="fset" data-lockable><legend class="label">When</legend>
              <div class="radios">
                <label class="check"><input type="radio" name="when" value="now" checked> Send now</label>
                <label class="check"><input type="radio" name="when" value="later"> Schedule</label>
              </div>
              <div data-later hidden><label class="sr" for="an-at">Send at</label><input class="input" id="an-at" type="datetime-local" name="sendAt" style="max-width:260px" aria-describedby="e-sendAt"></div>
              ${errSlot("sendAt")}
            </fieldset>
          </div>
          <div data-preview></div>
          <div class="formbar formbar--end"><button type="button" class="btn btn--ghost" data-cancel hidden>Cancel</button>
            <button type="button" class="btn btn--ghost" data-prev>Preview translations</button>
            <button class="btn" type="submit">${ico("megaphone")} <span data-submit>Send now</span></button></div>
        </form></section>` : ""}
      <section class="card"><div class="card__h"><div><h2>Announcements</h2><p class="card__sub" data-sub></p></div></div><div data-list><p class="hint">Loading…</p></div></section>
    </div>`;
  const box = el.querySelector("[data-list]");
  const form = el.querySelector("[data-ann]");
  const parentsP = me.canManage ? api("/api/admin/parents").then((d) => (state.parents = d.parents)).catch(() => state.parents || []) : Promise.resolve(state.parents || []);

  function draw() {
    el.querySelector("[data-sub]").textContent = list.length ? `${list.length} · parents can remove them from their own Notifications` : "";
    if (!list.length) { box.innerHTML = `<div class="empty"><h2>No announcements yet</h2><p>${me.canManage ? "Write one above." : "When an admin posts one, it'll show here."}</p></div>`; return; }
    box.innerHTML = `<ul class="anns">${list.map((a) => `<li>
      <div><b>${esc(a.title)}</b>
        <span class="sub">${a.sentAt ? `<span class="pill pill--ok">Sent ${esc(when(a.sentAt))}</span>` : `<span class="pill pill--warn">Scheduled for ${esc(when(a.sendAt))}</span>`}
          ${esc(audienceText(a.audience, state.parents))} · ${esc(channelText(a.channels))} · by ${esc(a.createdBy)}</span>
        ${a.summary ? `<span class="sub">${a.summary.recipients} ${a.summary.recipients === 1 ? "family" : "families"}${a.channels.length > 1 ? ` · ${esc(sentSummary(a.summary))}${a.summary.live ? "" : " (test mode)"}` : ""} · seen by ${a.seenBy} · ${a.languages.map((l) => LANG_NAMES[l]).join(", ")}</span>` : ""}
        <p>${esc(a.body)}</p>${fileChips(a.files || [])}</div>
      ${me.canManage ? `<div class="anns__acts"><button type="button" class="btn btn--ghost btn--sm" data-edit="${a.id}">Edit</button>
        <button type="button" class="btn btn--ghost btn--sm btn--del" data-del="${a.id}">Delete</button></div>` : ""}</li>`).join("")}</ul>`;
    box.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => startEdit(list.find((a) => a.id === Number(b.dataset.edit)))));
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      const a = list.find((x) => x.id === Number(b.dataset.del));
      if (!(await confirmDialog(`Delete “${a.title}”?`, a.sentAt ? "It disappears from every parent's Notifications. Emails and texts already sent can't be taken back." : "It won't be sent.", "Delete announcement"))) return;
      try {
        await busy(b, "Deleting…", () => api(`/api/admin/announcements/${a.id}`, { method: "DELETE" }));
        list = list.filter((x) => x.id !== a.id);
        if (editing?.id === a.id) startEdit(null);
        toast("Announcement deleted.");
        draw();
      } catch (err) { toast(err.message, "err"); }
    }));
  }

  if (!form) { load(); return; }
  const fe = formErrors(form), btn = form.querySelector('button[type="submit"]'), prevBtn = form.querySelector("[data-prev]");
  const F = form.elements;
  const audType = () => form.querySelector('[name="aud"]:checked').value;
  const later = () => form.querySelector('[name="when"]:checked').value === "later";
  const values = () => ({
    title: F.title.value.trim(), body: F.body.value.trim(),
    audience: audType() === "location" ? { type: "location", location: F.location.value } : audType() === "families" ? { type: "families", contactIds: [...families] } : { type: "all" },
    channels: [F.email.checked && "email", F.sms.checked && "sms"].filter(Boolean),
    sendAt: later() && F.sendAt.value ? new Date(F.sendAt.value).toISOString() : null,
    attachments: files.map((f) => f.id),
  });
  const drawFiles = () => {
    el.querySelector("[data-files]").innerHTML = fileChips(files, true);
    el.querySelectorAll("[data-unattach]").forEach((b) => (b.onclick = () => { files = files.filter((f) => f.id !== b.dataset.unattach); drawFiles(); }));
    el.querySelector(".filepick").hidden = files.length >= ATTACH.max;
  };
  el.querySelector("[data-filein]").addEventListener("change", async (e) => {
    const input = e.target, picked = [...input.files];
    input.value = "";
    fe.set("attachments", "");
    const pickl = el.querySelector("[data-pickl]");
    for (const file of picked) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (files.length >= ATTACH.max) { fe.show({ attachments: `Attach at most ${ATTACH.max} files.` }); break; }
      if (!ATTACH.exts.includes(ext)) { fe.show({ attachments: `“${file.name}” isn't a PDF, JPG or PNG.` }); continue; }
      if (file.size > ATTACH.maxBytes) { fe.show({ attachments: `“${file.name}” is over 10 MB. Please choose a smaller one.` }); continue; }
      pickl.textContent = `Uploading ${file.name}…`;
      try {
        const body = new FormData(); body.append("file", file);
        files.push((await api("/api/admin/announcements/files", { method: "POST", body })).file);
        drawFiles();
      } catch (err) { fe.show({ attachments: err.message }); }
    }
    pickl.textContent = "Attach files";
  });

  async function drawPicker() {
    const parents = await parentsP;
    const term = el.querySelector("[data-fq]").value.trim().toLowerCase();
    const shown = parents.filter((p) => !term || [p.name, p.email, p.location].join(" ").toLowerCase().includes(term));
    el.querySelector("[data-picker]").innerHTML = shown.length ? shown.map((p) => `<label class="check"><input type="checkbox" data-fam="${esc(p.contactId)}" ${families.has(p.contactId) ? "checked" : ""}>
      <span>${esc(p.name)} <span class="muted">· ${esc(p.location || "no location")}</span></span></label>`).join("") : '<p class="hint">No families match.</p>';
    el.querySelectorAll("[data-fam]").forEach((c) => c.addEventListener("change", () => { c.checked ? families.add(c.dataset.fam) : families.delete(c.dataset.fam); clearPreview(); }));
  }
  function sync() {
    el.querySelector("[data-audloc]").hidden = audType() !== "location";
    el.querySelector("[data-audfam]").hidden = audType() !== "families";
    el.querySelector("[data-later]").hidden = !later();
    if (audType() === "families") drawPicker();
    const sentAlready = !!editing?.sentAt;
    el.querySelector("[data-submit]").textContent = sentAlready ? "Save changes" : later() ? "Schedule" : editing ? "Save and send now" : "Send now";
  }
  const clearPreview = () => { preview = null; el.querySelector("[data-preview]").innerHTML = ""; };

  async function showPreview() {
    const v = values();
    const errs = {};
    if (!v.title) errs.title = "Add a title.";
    if (!v.body) errs.body = "Write the announcement.";
    if (v.audience.type === "families" && !v.audience.contactIds.length) errs.audience = "Choose at least one family.";
    fe.show(errs);
    if (Object.keys(errs).length) { fe.focus(); return null; }
    preview = await busy(prevBtn, "Translating…", () => api("/api/admin/announcements/preview", { method: "POST", body: JSON.stringify(v) }));
    el.querySelector("[data-preview]").innerHTML = `<div class="langprev">
      <p class="hint" style="margin:0 0 10px"><b>${preview.recipients} ${preview.recipients === 1 ? "family" : "families"}</b> will get this. Each version below goes to the families using that language${v.channels.includes("sms") ? "; the text message is the short version" : ""}.</p>
      ${preview.languages.map((l) => `<article><h3>${esc(l.name)} <span class="muted">· ${l.families} ${l.families === 1 ? "family" : "families"}</span></h3>
        <b dir="auto">${esc(l.title)}</b><p dir="auto">${esc(l.body)}</p>
        ${v.channels.includes("sms") ? `<p class="langprev__sms" dir="auto"><span class="muted">Text (${l.sms.length} characters):</span> ${esc(l.sms)}</p>` : ""}
        ${files.length && v.channels.includes("email") ? `<p class="langprev__sms" dir="auto"><span class="muted">Email note:</span> 📎 ${esc(l.attached)}</p>` : ""}</article>`).join("")}
      ${files.length ? `<p class="hint" style="margin:10px 0 0">📎 ${files.length} ${files.length === 1 ? "file" : "files"} attached, the same for every language.</p>` : ""}</div>`;
    return preview;
  }

  function startEdit(a) {
    editing = a; clearPreview();
    F.title.value = a?.title || ""; F.body.value = a?.body || "";
    files = [...(a?.files || [])]; drawFiles();
    el.querySelector("[data-count]").textContent = F.body.value.length;
    const aud = a?.audience || { type: "all" };
    form.querySelector(`[name="aud"][value="${aud.type}"]`).checked = true;
    if (aud.type === "location") F.location.value = aud.location;
    families = new Set(aud.type === "families" ? aud.contactIds : []);
    F.email.checked = !!a?.channels.includes("email"); F.sms.checked = !!a?.channels.includes("sms");
    form.querySelector(`[name="when"][value="${a?.sendAt && !a.sentAt ? "later" : "now"}"]`).checked = true;
    F.sendAt.value = a?.sendAt && !a.sentAt ? localInput(a.sendAt) : "";
    // Once sent, only the wording can change (parents already have it; nothing is re-sent).
    form.querySelectorAll("[data-lockable]").forEach((f) => (f.disabled = !!a?.sentAt));
    el.querySelector("[data-formtitle]").textContent = a ? "Edit announcement" : "New announcement";
    el.querySelector("[data-formsub]").textContent = a?.sentAt ? "It was already sent, so only the wording and attachments can change. Parents see the new wording in the portal; no new email or text is sent."
      : "Translated automatically for each parent. Preview the translations before you send.";
    form.querySelector("[data-cancel]").hidden = !a;
    fe.show({});
    sync();
    if (a) { form.scrollIntoView({ block: "center" }); F.title.focus(); }
  }

  F.body.addEventListener("input", () => { el.querySelector("[data-count]").textContent = F.body.value.length; });
  form.addEventListener("input", (e) => {
    if (e.target.name) fe.set(e.target.name === "aud" ? "audience" : e.target.name, "");
    if (["title", "body", "aud", "location"].includes(e.target.name)) clearPreview();
  });
  form.addEventListener("change", sync);
  el.querySelector("[data-fq]").addEventListener("input", drawPicker);
  form.querySelector("[data-cancel]").onclick = () => startEdit(null);
  prevBtn.onclick = () => showPreview().catch((err) => { if (err.fields) fe.show(err.fields); toast(err.message, "err"); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = values();
    if (later() && !v.sendAt) { fe.show({ sendAt: "Choose when to send it." }); return fe.focus(); }
    try {
      if (!editing?.sentAt) {
        const pv = preview || await showPreview();
        if (!pv) return;
        const how = channelText(v.channels).toLowerCase();
        const where = mode.live || !v.channels.length ? "" : ` Test mode: the emails and texts go to ${mode.testEmail}, not to parents.`;
        if (!(await confirmDialog(v.sendAt ? `Schedule for ${when(v.sendAt)}?` : `Send to ${pv.recipients} ${pv.recipients === 1 ? "family" : "families"} now?`,
          `“${v.title}” goes out by ${how} in ${pv.languages.filter((l) => l.families).map((l) => l.name).join(", ") || "English"}.${where}`, v.sendAt ? "Schedule" : "Send now", false))) return;
      }
      const r = await busy(btn, editing?.sentAt ? "Saving…" : v.sendAt ? "Scheduling…" : "Sending…", () => editing
        ? api(`/api/admin/announcements/${editing.id}`, { method: "PUT", body: JSON.stringify(v) })
        : api("/api/admin/announcements", { method: "POST", body: JSON.stringify(v) }));
      const a = r.announcement;
      list = editing ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list];
      toast(editing?.sentAt ? "Announcement updated in the portal." : a.sentAt ? `Sent to ${a.summary.recipients} ${a.summary.recipients === 1 ? "family" : "families"}${a.channels.length > 1 ? `: ${sentSummary(a.summary)}${a.summary.live ? "" : " (test mode)"}` : ""}.` : `Scheduled for ${when(a.sendAt)}.`,
        a.summary?.failed ? "warn" : "ok");
      startEdit(null);
      draw();
    } catch (err) { if (err.fields) { fe.show(err.fields); fe.focus(); } toast(err.message, "err"); }
  });

  async function load() {
    try {
      const d = await api("/api/admin/announcements");
      list = d.announcements; mode = d.mode;
      await parentsP;
      draw();
    } catch (err) { box.innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; }
  }
  sync();
  load();
}

// ---------- Camp info and This week (content/camp.json, shown in every parent's portal) ----------
// The forms are built from a field list. Field types: text, area, lines (a list of short texts, one
// per line), check, select, group (an object), list (repeatable items with their own fields).
const F_ = (type) => (k, label, extra = {}) => ({ type, k, label, ...extra });
const T = F_("text"), A = F_("area"), Ln = F_("lines"), C = F_("check");
const G = (k, label, fields) => ({ type: "group", k, label, fields });
const L = (k, label, item, fields) => ({ type: "list", k, label, item, fields });

const CAMP_FORM = [
  { title: "Overview", sub: "The top of the Camp info page.", fields: [
    T("title", "Title"), T("tagline", "Tagline"), A("intro", "Introduction", { rows: 4 }),
    T("dates", "Dates"), T("operatingDays", "Operating days"), T("closed", "Closed days"),
    T("hours", "Camp hours"), T("ages", "Ages"), T("location", "Location")] },
  { title: "Extended care", sub: "Early drop-off and late pickup.", fields: [G("extendedCare", "", [
    T("early", "Early care"), T("late", "Late care"), T("price", "Fee"), T("note", "Fee note"), A("coverage", "What the fee covers")])] },
  { title: "Activities", fields: [L("activities", "", "activity", [
    T("title", "Name"), T("tagline", "Tagline"), A("text", "Description"), Ln("items", "Highlights"), A("note", "Note (optional)")])] },
  { title: "Sports & athletics", fields: [G("sports", "", [
    A("intro", "Introduction"), L("list", "Sports", "sport", [T("name", "Sport"), T("text", "Description")]),
    A("included", "Which packages include sports"), A("note", "Note")])] },
  { title: "Packages & pricing", fields: [L("packages", "", "package", [
    T("name", "Name"), C("recommended", "Show as recommended"), T("price", "Full camp price (8 days)"), T("weekly", "Weekly price (5 days)"),
    A("summary", "Summary"), Ln("items", "What's included"), A("lunch", "Lunch")]),
    Ln("packageNotes", "Notes under the packages"), A("lunchNote", "Lunch note")] },
  { title: "Ways to save", fields: [L("offers", "", "offer", [T("amount", "Discount (for example 10% off)"), T("title", "Name"), A("text", "Details")]), A("offersNote", "Note")] },
  { title: "Transportation", fields: [G("transportation", "", [
    A("text", "Description"), L("prices", "Prices", "price", [T("label", "Option"), T("price", "Price"), T("note", "Note")]), Ln("items", "Highlights")])] },
  { title: "Your own sections", sub: "Add a new section to the Camp info page (for example: What to bring, Pickup rules, Holiday hours). They show at the end of the parent Camp info page.", fields: [L("sections", "", "section", [
    T("title", "Section title"), T("subtitle", "Short line under the title (optional)"), A("text", "Text", { rows: 4 }), Ln("items", "Bullet points (optional)")])] },
];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEK_FORM = [
  { title: "The week", fields: [T("label", "Week title", { hint: "For example: Week of December 21" })] },
  { title: "Days", sub: "Parents see today's card highlighted, and today's activity on their dashboard.", fields: [L("days", "", "day", [
    F_("select")("day", "Day", { options: WEEKDAYS }), T("date", "Date", { hint: "For example: December 21" }),
    T("title", "Activity"), T("tag", "Tag (optional)", { hint: "For example: Field trip, Sports clinic, Closed" }), A("description", "Description")])] },
];

let cfId = 0;
function cfHtml(f, v, locked) {
  const id = `cf-${++cfId}`, dis = locked ? " disabled" : "";
  const label = f.label ? `<label class="label" for="${id}">${esc(f.label)}</label>` : "";
  const hint = f.hint ? `<p class="hint" id="${id}-h">${esc(f.hint)}</p>` : "";
  const desc = f.hint ? ` aria-describedby="${id}-h"` : "";
  switch (f.type) {
    case "text": return `<div class="cf">${label}<input class="input" id="${id}" data-k="${f.k}" value="${esc(v ?? "")}"${desc}${dis}>${hint}</div>`;
    case "area": return `<div class="cf cf--wide">${label}<textarea class="input" id="${id}" data-k="${f.k}" rows="${f.rows || 2}"${desc}${dis}>${esc(v ?? "")}</textarea>${hint}</div>`;
    case "lines": return `<div class="cf cf--wide">${label}<textarea class="input" id="${id}" data-k="${f.k}" rows="${Math.max(3, (v || []).length + 1)}" aria-describedby="${id}-h"${dis}>${esc((v || []).join("\n"))}</textarea><p class="hint" id="${id}-h">One per line.</p></div>`;
    case "check": return `<div class="cf"><label class="check"><input type="checkbox" data-k="${f.k}" ${v ? "checked" : ""}${dis}> ${esc(f.label)}</label></div>`;
    case "select": return `<div class="cf">${label}<select class="input" id="${id}" data-k="${f.k}"${dis}>${f.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
    case "group": return `<div class="cf cf--wide">${f.label ? `<h3 class="cf__h">${esc(f.label)}</h3>` : ""}<div class="cgrid" data-k="${f.k}">${f.fields.map((x) => cfHtml(x, v?.[x.k], locked)).join("")}</div></div>`;
    case "list": return `<div class="cf cf--wide">${f.label ? `<h3 class="cf__h">${esc(f.label)}</h3>` : ""}
      <div class="clist" data-k="${f.k}" data-list>${(v || []).map((item) => citemHtml(f, item, locked)).join("")}</div>
      ${locked ? "" : `<button type="button" class="btn btn--ghost btn--sm" data-add="${f.k}">${ico("plus")} Add ${esc(f.item)}</button>`}</div>`;
  }
}
function citemHtml(f, item, locked) {
  return `<div class="citem cgrid">
    <div class="citem__bar"><b data-num></b>${locked ? "" : `<span>
      <button type="button" class="iconbtn" data-move="-1" aria-label="Move ${esc(f.item)} up" title="Move up">${ico("up")}</button>
      <button type="button" class="iconbtn" data-move="1" aria-label="Move ${esc(f.item)} down" title="Move down">${ico("down")}</button>
      <button type="button" class="iconbtn btn--del" data-remove aria-label="Remove ${esc(f.item)}" title="Remove">${ico("trash")}</button></span>`}</div>
    ${f.fields.map((x) => cfHtml(x, item?.[x.k], locked)).join("")}</div>`;
}
// Reads the fields back out of a container (only its own fields, not nested ones).
function cfRead(box, fields) {
  const out = {};
  for (const f of fields) {
    const node = box.querySelector(`:scope > .cf > [data-k="${f.k}"], :scope > .cf > .check > [data-k="${f.k}"]`);
    if (!node) continue;
    if (f.type === "check") out[f.k] = node.checked;
    else if (f.type === "lines") out[f.k] = node.value.split("\n").map((s) => s.trim()).filter(Boolean);
    else if (f.type === "group") out[f.k] = cfRead(node, f.fields);
    else if (f.type === "list") out[f.k] = [...node.children].map((item) => cfRead(item, f.fields));
    else out[f.k] = node.value.trim();
  }
  return out;
}
// Numbers the items and wires add / move / remove for every list inside `root`.
function cfLists(root, form, onChange) {
  const listField = (k, fields) => { for (const f of fields) { if (f.type === "list" && f.k === k) return f; const sub = f.fields && listField(k, f.fields); if (sub) return sub; } };
  const number = () => root.querySelectorAll("[data-list]").forEach((l) => [...l.children].forEach((item, i) => {
    const f = listField(l.dataset.k, form.flatMap((s) => s.fields));
    item.querySelector(":scope > .citem__bar [data-num]").textContent = `${f.item[0].toUpperCase()}${f.item.slice(1)} ${i + 1}`;
  }));
  root.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-add]"), move = e.target.closest("[data-move]"), rm = e.target.closest("[data-remove]");
    if (add) {
      const list = add.parentElement.querySelector(":scope > [data-list]");
      list.insertAdjacentHTML("beforeend", citemHtml(listField(list.dataset.k, form.flatMap((s) => s.fields)), {}, false));
      number(); onChange();
      list.lastElementChild.querySelector("input, textarea, select")?.focus();
    } else if (move) {
      const item = move.closest(".citem"), to = move.dataset.move === "-1" ? item.previousElementSibling : item.nextElementSibling;
      if (!to) return;
      move.dataset.move === "-1" ? to.before(item) : to.after(item);
      number(); onChange(); move.focus();
    } else if (rm) {
      const item = rm.closest(".citem");
      const name = item.querySelector(":scope > .cf > [data-k]")?.value || item.querySelector("[data-num]").textContent;
      if (!(await confirmDialog(`Remove “${name}”?`, "It disappears from the parent portal when you save.", "Remove"))) return;
      item.remove(); number(); onChange();
    }
  });
  number();
}

// One editable page of camp content. opts: { title, sub, form, value(data), save(data, value) -> data, note(data) }
function contentEditor(el, me, opts) {
  let data = null, dirty = false;
  const leave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", leave);
  const off = () => { window.removeEventListener("beforeunload", leave); window.removeEventListener("hashchange", off); };
  window.addEventListener("hashchange", off);

  async function load() {
    el.innerHTML = `${header(opts.title, opts.sub)}<p class="hint">Loading…</p>`;
    try { data = await api("/api/admin/content"); draw(); }
    catch (err) { el.innerHTML = `${header(opts.title, opts.sub)}<p class="alert alert--err" role="alert">${esc(err.message)}</p>`; }
  }
  function draw() {
    const v = opts.value(data), locked = !me.canManage;
    dirty = false;
    el.innerHTML = `${header(opts.title, opts.sub, `<div class="page-h__acts"><a class="btn btn--ghost" href="/" target="_blank" rel="noopener">${ico("eye")} Open the parent portal</a></div>`)}
      ${opts.top ? opts.top(data) : ""}
      ${v ? `<form class="stack" data-cform novalidate>
        ${me.canManage ? `<p class="alert alert--info" style="margin:0">Changes show in every parent's portal as soon as you save, and Ask Blackmon answers from the new text.${opts.bracketNote ? " Text in [square brackets] shows to parents as “To be added”." : ""}</p>` : ""}
        ${opts.form.map((s) => `<section class="card"><div class="card__h"><div><h2>${esc(s.title)}</h2>${s.sub ? `<p class="card__sub">${esc(s.sub)}</p>` : ""}</div></div>
          <div class="cgrid" data-sec>${s.fields.map((f) => cfHtml(f, v[f.k], locked)).join("")}</div></section>`).join("")}
        ${me.canManage ? `<div class="savebar"><span class="hint" data-state>No unsaved changes</span>
          <button type="button" class="btn btn--ghost" data-reset disabled>Discard changes</button>
          <button class="btn" type="submit" disabled>Save and publish</button></div>` : ""}
      </form>` : `<div class="empty"><h2>Nothing to edit</h2><p>This section isn't in the camp content file.</p></div>`}`;
    opts.wire?.(el, () => { if (dirty && !window.confirm("Discard your unsaved changes?")) return false; draw(); return true; });
    const form = el.querySelector("[data-cform]");
    if (!form || locked) return;
    const btn = form.querySelector('button[type="submit"]'), reset = form.querySelector("[data-reset]"), stateEl = form.querySelector("[data-state]");
    const changed = () => { dirty = true; btn.disabled = reset.disabled = false; stateEl.textContent = "Unsaved changes"; };
    form.addEventListener("input", changed);
    cfLists(form, opts.form, changed);
    reset.onclick = async () => { if (await confirmDialog("Discard your changes?", "The page goes back to what parents see now.", "Discard")) draw(); };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = Object.assign({}, ...[...form.querySelectorAll("[data-sec]")].map((box, i) => cfRead(box, opts.form[i].fields)));
      try {
        data = await busy(btn, "Saving…", () => opts.save(data, value));
        toast("Saved. Parents see the new version now.");
        draw();
      } catch (err) {
        toast(err.message, "err");
        if (err.status === 409) stateEl.textContent = "Not saved: reload to get the latest version";
      }
    });
  }
  load();
}

function campInfoView(el, me) {
  contentEditor(el, me, {
    title: "Camp info", sub: "What every parent sees on the Camp info page: dates, activities, packages, prices and offers.",
    form: CAMP_FORM,
    value: (d) => d.campInfo,
    save: (d, campInfo) => api("/api/admin/content/camp", { method: "PUT", body: JSON.stringify({ version: d.version, campInfo }) }),
  });
}

function weekView(el, me) {
  let loc = null;
  contentEditor(el, me, {
    title: "This week", sub: "The Little Elm camp's plan for the week. Parents see it once their dashboard is unlocked.",
    form: WEEK_FORM,
    bracketNote: true,
    value: (d) => { loc = loc && d.weeks[loc] ? loc : Object.keys(d.weeks)[0]; return d.weeks[loc]; },
    top: (d) => `<div class="seg seg--loc" role="radiogroup" aria-label="Location" style="margin:0 0 18px">${Object.keys(d.weeks).map((k) => `
      <label><input type="radio" name="wkloc" value="${esc(k)}" ${k === loc ? "checked" : ""}><span>${esc(d.locations[k] || k)}</span></label>`).join("")}</div>`,
    wire: (box, redraw) => box.querySelectorAll('[name="wkloc"]').forEach((r) => r.addEventListener("change", () => {
      const prev = loc;
      loc = r.value;
      if (!redraw()) { loc = prev; box.querySelector(`[name="wkloc"][value="${prev}"]`).checked = true; return; }
      el.querySelector(`[name="wkloc"][value="${loc}"]`)?.focus();
    })),
    save: (d, week) => api(`/api/admin/content/week/${encodeURIComponent(loc)}`, { method: "PUT", body: JSON.stringify({ version: d.version, week }) }),
  });
}

// ---------- Training videos (admins upload) and Intro videos (camp staff / tutors upload) ----------
const mb = (n) => `${(n / 1048576).toFixed(n >= 104857600 ? 0 : 1)} MB`;

async function trainingView(el, me) {
  let saved = ""; try { saved = sessionStorage.getItem("trainingAudience") || ""; } catch {}
  let audience = ["Tutor", "Both"].includes(saved) ? saved : "Camp Staff", lists = [];
  el.innerHTML = `${header("Training videos", "Upload the training videos camp staff and tutors watch in their portal. Each group sees only its own list, in this order. When someone has watched every video, their onboarding status in GHL moves to “Training Complete”.")}
    <div class="seg seg--loc" role="radiogroup" aria-label="Who the videos are for" style="margin:0 0 18px;max-width:560px">
      ${AUDIENCE_TABS.map(([v, t]) => `<label><input type="radio" name="aud" value="${v}" ${v === audience ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
    <div class="stack">
      ${me.canManage ? `<section class="card"><div class="card__h"><div><h2 data-uph></h2><p class="card__sub">MP4, MOV or WebM, up to 1 GB.</p></div></div>
        <form data-up novalidate><div class="grid">
          <div><label class="label" for="tv-title">Title</label><input class="input" id="tv-title" name="title" maxlength="120" aria-describedby="e-title">${errSlot("title")}</div>
          <div><label class="label" for="tv-desc">Description (optional)</label><textarea class="input" id="tv-desc" name="description" rows="2" maxlength="1000"></textarea></div>
          <div><span class="label" id="l-tvfile">Video</span>
            <label class="drop drop--sm" data-drop>${ico("upload")}<strong data-pickl>Choose a video or drop it here</strong>
              <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" name="file" aria-labelledby="l-tvfile" aria-describedby="e-file"></label>${errSlot("file")}
            <div class="bar" hidden data-bar><i></i></div></div>
        </div>
        <div class="formbar formbar--end"><button class="btn" type="submit">${ico("upload")} Upload video</button></div></form></section>` : ""}
      <div class="stack" data-lists><section class="card"><p class="hint">Loading…</p></section></div>
    </div>`;
  const lists$ = el.querySelector("[data-lists]");
  // "Both": uploads go to camp staff and tutors, and both lists are shown.
  const name = (a = audience) => (a === "Both" ? "camp staff and tutors" : a === "Tutor" ? "tutors" : "camp staff");

  async function load() {
    const uph = el.querySelector("[data-uph]");
    if (uph) uph.textContent = `Upload a training video for ${name()}`;
    try {
      lists = await Promise.all((audience === "Both" ? ["Camp Staff", "Tutor"] : [audience]).map((a) =>
        api(`/api/admin/training?audience=${encodeURIComponent(a)}`).then((d) => ({ audience: a, list: d.videos, people: d.people }))));
      lists$.innerHTML = lists.map((l, i) => `<section class="card"><div class="card__h"><div><h2>Videos for ${name(l.audience)}</h2><p class="card__sub" data-sub></p></div></div><div data-list="${i}"></div></section>`).join("");
      lists.forEach((l, i) => drawList(l, lists$.querySelector(`[data-list="${i}"]`)));
    } catch (err) { lists$.innerHTML = `<section class="card"><p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p></section>`; }
  }
  // One group's list (camp staff or tutors).
  function drawList({ audience, list, people }, box) {
    const name = () => (audience === "Tutor" ? "tutors" : "camp staff");
    const draw = () => drawList({ audience, list, people }, box);
    box.closest(".card").querySelector("[data-sub]").textContent = list.length ? `${list.length} ${list.length === 1 ? "video" : "videos"} · ${people} ${people === 1 ? "person" : "people"} on the ${audience === "Tutor" ? "Tutors" : "Camp staff"} page` : "";
    if (!list.length) { box.innerHTML = `<div class="empty">${ico("video")}<h2>No training videos for ${name()} yet</h2><p>${me.canManage ? "Upload one above." : "An admin can upload them."}</p></div>`; return; }
    box.innerHTML = `<ol class="vids">${list.map((v, i) => `<li data-id="${v.id}">
      <video controls preload="metadata" src="/api/admin/training/${v.id}/file"></video>
      <div class="vids__txt"><span class="muted">Video ${i + 1}</span><b>${esc(v.title)}</b>
        <span class="pill ${v.both ? "pill--sky" : "pill--todo"}" style="justify-self:start;width:fit-content">${v.both ? "Camp staff and tutors" : audience === "Tutor" ? "Tutors" : "Camp staff"}</span>${v.description ? `<p>${esc(v.description)}</p>` : ""}
        <span class="sub">${esc(v.fileName)} · ${mb(v.size)} · uploaded ${esc(day(v.createdAt))} by ${esc(v.uploadedBy)} · watched by ${v.watchedBy} of ${people}</span>
        ${me.canManage ? `<div class="vids__acts">
          <button type="button" class="iconbtn" data-move="-1" aria-label="Move ${esc(v.title)} up" ${i === 0 ? "disabled" : ""}>${ico("up")}</button>
          <button type="button" class="iconbtn" data-move="1" aria-label="Move ${esc(v.title)} down" ${i === list.length - 1 ? "disabled" : ""}>${ico("down")}</button>
          <button type="button" class="btn btn--ghost btn--sm" data-edit>Edit</button>
          <button type="button" class="btn btn--ghost btn--sm btn--del" data-del>Delete</button></div>` : ""}</div></li>`).join("")}</ol>`;
    const of = (b) => list.find((v) => v.id === Number(b.closest("li").dataset.id));
    box.querySelectorAll("[data-move]").forEach((b) => (b.onclick = async () => {
      try { await api(`/api/admin/training/${of(b).id}/move`, { method: "POST", body: JSON.stringify({ dir: Number(b.dataset.move) }) }); await load(); }
      catch (err) { toast(err.message, "err"); }
    }));
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      const v = of(b);
      if (!(await confirmDialog(`Delete “${v.title}”?`, `It's removed from every ${audience === "Tutor" ? "tutor's" : "camp staff member's"} Training page.`, "Delete video"))) return;
      try { await busy(b, "Deleting…", () => api(`/api/admin/training/${v.id}`, { method: "DELETE" })); toast("Video deleted."); await load(); }
      catch (err) { toast(err.message, "err"); }
    }));
    box.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
      const v = of(b), txt = b.closest(".vids__txt");
      txt.innerHTML = `<form class="grid" novalidate>
        <div><label class="label" for="ed-t-${v.id}">Title</label><input class="input" id="ed-t-${v.id}" name="title" maxlength="120" value="${esc(v.title)}"></div>
        <div><label class="label" for="ed-d-${v.id}">Description</label><textarea class="input" id="ed-d-${v.id}" name="description" rows="2" maxlength="1000">${esc(v.description)}</textarea></div>
        <div class="tools"><button class="btn btn--sm" type="submit">Save</button><button class="btn btn--ghost btn--sm" type="button" data-cancel>Cancel</button></div></form>`;
      const f = txt.querySelector("form");
      f.elements.title.focus();
      f.querySelector("[data-cancel]").onclick = draw;
      f.onsubmit = async (e) => {
        e.preventDefault();
        try {
          await busy(f.querySelector('[type="submit"]'), "Saving…", () => api(`/api/admin/training/${v.id}`, { method: "PUT", body: JSON.stringify({ title: f.elements.title.value, description: f.elements.description.value }) }));
          toast("Saved."); await load();
        } catch (err) { toast(err.message, "err"); }
      };
    }));
  }

  el.querySelectorAll('[name="aud"]').forEach((r) => r.addEventListener("change", () => {
    audience = r.value;
    try { sessionStorage.setItem("trainingAudience", audience); } catch {}
    load();
  }));

  const form = el.querySelector("[data-up]");
  if (form) {
    const fe = formErrors(form), input = form.elements.file, drop = form.querySelector("[data-drop]"), bar = form.querySelector("[data-bar]"), btn = form.querySelector('[type="submit"]');
    let file = null;
    const pick = (f) => {
      file = f || null;
      form.querySelector("[data-pickl]").textContent = file ? `${file.name} · ${mb(file.size)}` : "Choose a video or drop it here";
      fe.set("file", "");
      if (file && !form.elements.title.value.trim()) form.elements.title.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    };
    input.addEventListener("change", () => pick(input.files[0]));
    ["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("is-over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const errs = {}, title = form.elements.title.value.trim();
      if (!title) errs.title = "Give the video a title.";
      if (!file) errs.file = "Choose a video.";
      else if (!/\.(mp4|mov|webm)$/i.test(file.name)) errs.file = "Choose an MP4, MOV or WebM video.";
      else if (file.size > 1024 * 1048576) errs.file = "That video is over 1 GB. Please choose a smaller one.";
      fe.show(errs);
      if (Object.keys(errs).length) return fe.focus();
      const target = audience;
      const q = new URLSearchParams({ audience: target, title, description: form.elements.description.value.trim() });
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/admin/training?${q}`);
      xhr.setRequestHeader("Content-Type", file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : /\.webm$/i.test(file.name) ? "video/webm" : "video/mp4"));
      xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      btn.disabled = true; bar.hidden = false; bar.firstElementChild.style.width = "0%";
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) bar.firstElementChild.style.width = `${Math.round((ev.loaded / ev.total) * 100)}%`; };
      const finish = () => { btn.disabled = false; bar.hidden = true; };
      xhr.onload = async () => {
        finish();
        let d = {}; try { d = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 201) {
          toast(`“${d.video.title}” uploaded for ${target === "Both" ? "camp staff and tutors" : target === "Tutor" ? "tutors" : "camp staff"}.`);
          form.reset(); pick(null); await load();
        }
        else if (xhr.status === 401) renderLogin("Your session ended. Please sign in again.");
        else toast(d.error || "Upload failed. Please try again.", "err");
      };
      xhr.onerror = () => { finish(); toast("Upload failed. Check your connection and try again.", "err"); };
      xhr.send(file);
    });
  }
  load();
}
const AUDIENCE_TABS = [["Camp Staff", "Camp staff"], ["Tutor", "Tutors"], ["Both", "Both"]];

async function introVideosView(el, me) {
  let people = [], filter = "all";
  el.innerHTML = `${header("Intro videos", "The intro video each camp staff member and tutor uploads in their portal, with who uploaded it. A new upload replaces their old one.")}
    <div class="filters" style="margin:0 0 16px"><label class="sr" for="iv-f">Show</label>
      <select class="input" id="iv-f" style="max-width:260px"><option value="all">Everyone</option><option value="Camp Staff">Camp staff</option><option value="Tutor">Tutors</option><option value="missing">No video yet</option></select></div>
    <section class="card"><div data-list><p class="hint">Loading…</p></div></section>`;
  const box = el.querySelector("[data-list]");
  function draw() {
    const shown = people.filter((p) => filter === "all" || (filter === "missing" ? !p.video : p.role === filter));
    if (!shown.length) { box.innerHTML = `<div class="empty">${ico("play")}<h2>Nothing to show</h2><p>${people.length ? "No one matches this filter." : "Add camp staff or tutors first; their videos appear here once they upload them."}</p></div>`; return; }
    box.innerHTML = `<ul class="vids vids--intro">${shown.map((p) => `<li>
      ${p.video ? `<video controls preload="metadata" src="/api/admin/intro-videos/${esc(p.video.contactId)}/file"></video>` : `<div class="vids__none">${ico("video")}<span>No video yet</span></div>`}
      <div class="vids__txt"><b>${esc(p.name)}</b>
        <span class="sub">${esc(p.role === "Camp Staff" ? "Camp staff" : p.role)}${p.location ? ` · ${esc(p.location)}` : ""}${p.gender ? ` · ${esc(p.gender)}` : ""}</span>
        <span class="sub"><a href="mailto:${esc(p.email)}">${esc(p.email)}</a>${p.phone ? ` · <a href="tel:${esc(p.phone)}">${esc(phoneText(p.phone))}</a>` : ""}</span>
        ${p.video ? `<span class="sub">Uploaded ${esc(when(p.video.uploadedAt))} · ${esc(p.video.fileName)} · ${mb(p.video.size)} · <a href="/api/admin/intro-videos/${esc(p.video.contactId)}/file?download=1">Download</a></span>` : ""}</div></li>`).join("")}</ul>`;
  }
  el.querySelector("#iv-f").onchange = (e) => { filter = e.target.value; draw(); };
  try { people = (await api("/api/admin/intro-videos")).people; draw(); }
  catch (err) { box.innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; }
}

// ---------- Knowledge assessment (camp staff take it in their portal after the training videos) ----------
// Pass = any attempt at 80% or more. The portal grades each attempt against the answer key.
const assessStatus = (p) => p.attempts.some((t) => t.passed) ? "passed" : p.attempts.length ? "retake" : "none";
const assessPill = (p) => ({ passed: '<span class="pill pill--ok">Passed</span>', retake: '<span class="pill pill--warn">Review and retake</span>',
  none: '<span class="pill pill--todo">Not taken</span>' })[assessStatus(p)];
// The Staff Training Acknowledgment they sign after passing (the signed PDF is admins only, like waivers).
const ackCell = (a, me) => a ? `<div><span class="pill pill--ok">Signed</span><span class="sub">${esc(day(a.signedAt))}${me.canManage
  ? ` · <a href="/api/admin/acknowledgments/${encodeURIComponent(a.id)}/file" target="_blank" rel="noopener">View PDF</a>` : ""}</span></div>` : '<span class="pill pill--todo">Not signed</span>';
const scoreText = (t) => `${t.score} / ${t.total} · ${t.percent}%`;

async function assessmentsView(el, me) {
  let data = null, filter = "all";
  const open = new Set();
  el.innerHTML = `${header("Assessments", "The Camp Counselor Knowledge Assessment that camp staff take in their portal after watching every training video. The portal scores it with the answer key: 1 point per question, question 6 only when A, B and D are all marked and C isn't. Passing is 80% (8 of 10); below that they review the training and retake it. After passing they sign the Staff Training Acknowledgment; the signed form is here, with Supervisor review left blank for you.")}
    <div class="filters" style="margin:0 0 16px"><label class="sr" for="as-f">Show</label>
      <select class="input" id="as-f" style="max-width:260px"><option value="all">All camp staff</option><option value="passed">Passed</option><option value="retake">Review and retake</option><option value="none">Not taken yet</option></select></div>
    <section class="card"><div data-list><p class="hint">Loading…</p></div></section>`;
  const box = el.querySelector("[data-list]");
  const detail = (p) => p.attempts.map((t, i) => `<div class="adet">
      <p class="adet__h"><b>${i === 0 ? "Latest attempt" : `Attempt ${p.attempts.length - i}`}</b> · ${esc(when(t.submittedAt))} · ${scoreText(t)} ${t.passed ? '<span class="pill pill--ok">Pass</span>' : '<span class="pill pill--warn">Retake</span>'}</p>
      <ol class="adet__q">${t.results.map((r) => { const q = data.questions.find((x) => x.n === r.n); return `<li class="${r.correct ? "is-ok" : "is-miss"}">
        <b>Q${r.n}</b> ${r.correct ? "Correct" : "Incorrect"} · marked ${esc(r.picked.join(", "))}
        ${r.correct ? "" : `<span class="sub">${esc(q?.prompt || "")} Review: ${esc(r.review)}</span>`}</li>`; }).join("")}</ol></div>`).join("");
  function draw() {
    const shown = data.people.filter((p) => filter === "all" || assessStatus(p) === filter);
    const count = (k) => data.people.filter((p) => !p.removed && assessStatus(p) === k).length;
    if (!data.people.length) { box.innerHTML = `<div class="empty">${ico("todo")}<h2>No camp staff yet</h2><p>Add camp staff first; their scores appear here once they take the assessment.</p></div>`; return; }
    box.innerHTML = `<p class="hint" style="margin:0 0 14px">${count("passed")} passed · ${count("retake")} need to retake · ${count("none")} not taken yet</p>
      ${shown.length ? `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Location</th><th>Status</th><th>Latest score</th><th>Attempts</th><th>Acknowledgment</th><th><span class="sr">Details</span></th></tr></thead>
      <tbody>${shown.map((p, i) => `<tr>
        <td data-label="Name"><div><b>${esc(p.name)}</b><span class="sub"><a href="mailto:${esc(p.email)}">${esc(p.email)}</a>${p.removed ? " · Removed from camp staff" : ""}</span></div></td>
        <td data-label="Location">${esc(p.location || "—")}</td>
        <td data-label="Status">${assessPill(p)}</td>
        <td data-label="Latest score">${p.attempts[0] ? `<div><b>${scoreText(p.attempts[0])}</b><span class="sub">${esc(when(p.attempts[0].submittedAt))}</span></div>` : "—"}</td>
        <td data-label="Attempts">${p.attempts.length}</td>
        <td data-label="Acknowledgment">${ackCell(p.acknowledgment, me)}</td>
        <td class="act">${p.attempts.length ? `<button type="button" class="btn btn--ghost btn--sm" data-more="${esc(p.email)}" aria-expanded="${open.has(p.email)}">${open.has(p.email) ? "Hide answers" : "View answers"}</button>` : ""}</td>
      </tr>${open.has(p.email) ? `<tr class="adet__row"><td colspan="7">${detail(p)}</td></tr>` : ""}`).join("")}</tbody></table></div>`
      : '<p class="hint" style="margin:0">No one matches this filter.</p>'}`;
    box.querySelectorAll("[data-more]").forEach((b) => (b.onclick = () => { const k = b.dataset.more; open.has(k) ? open.delete(k) : open.add(k); draw(); }));
  }
  el.querySelector("#as-f").onchange = (e) => { filter = e.target.value; if (data) draw(); };
  try { data = await api("/api/admin/assessments"); draw(); }
  catch (err) { box.innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; }
}

// ---------- Ask Blackmon chats ("talk to a person" handoffs) ----------
const chatStatus = (c) => c.status === "handoff" ? '<span class="pill pill--warn">Needs a person</span>'
  : c.status === "handled" ? `<span class="pill pill--ok">Handled${c.handledBy ? ` by ${esc(c.handledBy)}` : ""}</span>` : '<span class="pill pill--sky">Chat only</span>';

function transcriptHtml(conv, messages) {
  const nonEn = conv.language && conv.language !== "en";
  return `<ol class="chatlog">${messages.map((m) => {
    if (m.role === "event") return `<li class="chatlog__event">${esc(m.text)} · ${esc(when(m.at))}</li>`;
    const en = nonEn && m.textEn && m.textEn !== m.text ? `<p class="chatlog__en"><b>English:</b> ${esc(m.textEn)}</p>` : "";
    const meta = m.role === "bot" ? [m.sources?.length ? `From: ${m.sources.map(esc).join(" · ")}` : "", m.answered === false ? "Couldn't answer" : "",
      m.feedback === 1 ? "Parent: helpful" : m.feedback === -1 ? "Parent: not helpful" : ""].filter(Boolean).join(" · ") : "";
    return `<li class="chatlog__msg chatlog__msg--${m.role}"><span class="chatlog__who">${m.role === "parent" ? esc(conv.parentName) : "Ask Blackmon"} · ${esc(when(m.at))}</span>
      <p>${esc(m.text)}</p>${en}${meta ? `<p class="chatlog__meta">${meta}</p>` : ""}</li>`;
  }).join("")}</ol>`;
}

function chatFactsHtml(c) {
  return `<dl class="kv">
    <dt>Email</dt><dd><a href="mailto:${esc(c.parentEmail)}">${esc(c.parentEmail)}</a></dd>
    <dt>Phone</dt><dd>${c.parentPhone ? `<a href="tel:${esc(c.parentPhone)}">${esc(c.parentPhone)}</a>` : "Not on file"}</dd>
    <dt>Child</dt><dd>${esc(c.childName || "Not on file")}</dd>
    <dt>Camp</dt><dd>${esc(c.location || "Not chosen yet")}</dd>
    <dt>Language</dt><dd>${esc(c.languageName)}</dd>
    ${c.handoffAt ? `<dt>Asked for a person</dt><dd>${esc(when(c.handoffAt))}</dd>` : ""}</dl>`;
}

async function chatView(el, me, id) {
  el.innerHTML = `${header("Chat")}<section class="card"><p class="hint">Loading…</p></section>`;
  let d;
  try { d = await api(`/api/admin/chats/${encodeURIComponent(id)}`); }
  catch (err) { el.innerHTML = `${header("Chat")}<p class="alert alert--err" role="alert">${esc(err.message)}</p>`; return; }
  const draw = () => {
    const c = d.conversation;
    el.innerHTML = `${header(`Chat with ${esc(c.parentName)}`, "From the Ask Blackmon chat in the parent portal.",
        c.status === "handoff" && me.canManage ? '<button class="btn" data-handled>Close chat</button>' : "")}
      <div class="stack">
        <section class="card"><div class="card__h"><div><h2>Parent</h2></div>${chatStatus(c)}</div>${chatFactsHtml(c)}
          <p class="hint" style="margin-top:14px"><a href="#/parents/${encodeURIComponent(c.contactId)}">Parent details</a></p></section>
        <section class="card"><div class="card__h"><div><h2>Full chat</h2><p class="card__sub">${d.messages.length} messages${c.language !== "en" ? " · English translations shown under each message" : ""}</p></div></div>
          ${transcriptHtml(c, d.messages)}</section>
      </div>`;
    el.querySelector("[data-handled]")?.addEventListener("click", async (e) => {
      try { d = await busy(e.currentTarget, "Saving…", () => api(`/api/admin/chats/${encodeURIComponent(id)}/handled`, { method: "POST" })); toast("Chat closed. The parent is told the team isn't available."); draw(); }
      catch (err) { toast(err.message, "err"); }
    });
  };
  draw();
}

// Pops up new "talk to a person" requests while the dashboard is open (checks every 20 seconds).
// Each request pops once per browser session; it stays unread in Notifications until marked read.
let handoffTimer = null, handoffOpen = false;
const seenHandoffs = () => { try { return new Set(JSON.parse(sessionStorage.getItem("seen-handoffs") || "[]")); } catch { return new Set(); } };
const markHandoffSeen = (id) => { const s = seenHandoffs(); s.add(id); try { sessionStorage.setItem("seen-handoffs", JSON.stringify([...s])); } catch {} };
function stopHandoffWatch() { clearInterval(handoffTimer); handoffTimer = null; }
function startHandoffWatch() {
  if (handoffTimer) return;
  checkHandoffs();
  handoffTimer = setInterval(checkHandoffs, 20_000);
}
async function checkHandoffs() {
  if (handoffOpen || !state.me || document.hidden) return;
  let r;
  try { r = await api("/api/admin/notifications"); } catch { return; }
  setBadge(r.unread);
  const seen = seenHandoffs();
  const n = r.notifications.find((x) => x.kind === "chat_handoff" && !x.read && x.conversationId && !seen.has(x.id));
  if (!n) return;
  markHandoffSeen(n.id);
  // Seen once = read for this admin on the server, so it doesn't pop up again in another tab or
  // after signing in again; a chat already closed doesn't pop up at all.
  const read = () => api("/api/admin/notifications", { method: "POST", body: JSON.stringify({ ids: [n.id] }) }).then((x) => setBadge(x.unread)).catch(() => {});
  let d;
  try { d = await api(`/api/admin/chats/${encodeURIComponent(n.conversationId)}`); } catch { return; }
  const c = d.conversation;
  if (c.status !== "handoff") return read();
  const dlg = document.createElement("dialog");
  dlg.className = "chatpop";
  dlg.setAttribute("aria-labelledby", "chatpop-title");
  dlg.innerHTML = `<form method="dialog">
    <div class="chatpop__head"><span class="pill pill--warn">Needs a person</span>
      <h2 id="chatpop-title">${esc(c.parentName)} wants to talk to a person</h2><p>${esc(when(c.handoffAt))} · from the Ask Blackmon chat</p></div>
    ${chatFactsHtml(c)}
    <h3>Full chat</h3><div class="chatpop__log">${transcriptHtml(c, d.messages)}</div>
    <div class="confirm__bar"><button class="btn btn--ghost" value="close">${state.me.canManage ? "Close chat" : "Close"}</button><button class="btn" value="open" autofocus>Open chat</button></div></form>`;
  document.body.append(dlg);
  handoffOpen = true;
  dlg.showModal();
  dlg.addEventListener("close", () => {
    handoffOpen = false;
    read();
    // Close chat: the parent's chat is closed and they're told the team isn't available.
    if (dlg.returnValue === "close" && state.me.canManage) api(`/api/admin/chats/${encodeURIComponent(c.id)}/handled`, { method: "POST" })
      .then(() => toast(`Chat closed. ${c.parentName} is told the team isn't available.`)).catch((err) => toast(err.message, "err"));
    if (dlg.returnValue === "open") location.hash = `#/chats/${encodeURIComponent(c.id)}`;
    dlg.remove();
  });
}

// ---------- Staff ----------
const ACCESS_TEXT = {
  admin: (n) => [`Give ${n} Admin access?`, "They'll be able to add, edit and delete staff, remove parents, send notifications and change other people's access. If they don't have a password yet, we'll email them a setup link (or use Edit to set one for them).", "Give Admin access"],
  view: (n) => [`Give ${n} View only access?`, "They'll be able to see Parents and Staff but not change anything. If they don't have a password yet, we'll email them a setup link (or use Edit to set one for them).", "Give View only access"],
  none: (n) => [`Remove ${n}'s dashboard access?`, "They'll be signed out of the dashboard right away. They keep their normal staff/tutor portal access.", "Remove access"],
};

// Camp staff and tutors share one staff list (and one form); each has its own page.
const STAFF_PAGES = {
  "Camp Staff": { r: "staff", title: "Camp staff", one: "camp staff member", many: "camp staff", icon: "id",
    sub: "Counselors and supervisors at the camps. Adding someone here also sets them up in GHL so they can sign in to the staff portal." },
  Tutor: { r: "tutors", title: "Tutors", one: "tutor", many: "tutors", icon: "cap",
    sub: "Blackmon tutors. Adding someone here also sets them up in GHL so they can sign in to the tutor portal." },
};
const staffPage = (role) => STAFF_PAGES[role] || STAFF_PAGES["Camp Staff"];

async function staffView(el, me, role = "Camp Staff") {
  const pg = staffPage(role);
  el.innerHTML = `${header(pg.title, pg.sub,
    me.canManage ? `<button class="btn" data-add>${ico("plus")} Add ${pg.one === "tutor" ? "tutor" : "camp staff"}</button>` : "")}
    <section class="card" data-list><p class="hint">Loading…</p></section>`;
  el.querySelector("[data-add]")?.addEventListener("click", () => staffForm(el, me, null, role));
  const box = el.querySelector("[data-list]");
  try {
    const [st, as] = await Promise.all([api("/api/admin/staff"), role === "Camp Staff" ? api("/api/admin/assessments").catch(() => null) : null]);
    state.staff = st.staff;
    state.assess = as ? new Map(as.people.map((p) => [p.email.toLowerCase(), p])) : null;
  }
  catch (err) { box.innerHTML = `<p class="alert alert--err" role="alert" style="margin:0">${esc(err.message)}</p>`; return; }
  drawStaff(el, box, me, role);
}
const tutorsView = (el, me) => staffView(el, me, "Tutor");

const assessCell = (p) => !p?.attempts.length ? '<span class="pill pill--todo">Not taken</span>'
  : `<div>${assessPill(p)}<span class="sub"><a href="#/assessments">${scoreText(p.attempts[0])}</a>${p.acknowledgment ? " · Acknowledgment signed" : ""}</span></div>`;

function drawStaff(el, box, me, role) {
  const pg = staffPage(role);
  const list = state.staff.filter((s) => s.role === role);
  if (!list.length) {
    box.innerHTML = `<div class="empty">${ico(pg.icon)}<h2>No ${pg.many} yet</h2><p>${me.canManage ? `Use “Add ${pg.one === "tutor" ? "tutor" : "camp staff"}” to add your first ${pg.one}.` : `${pg.title} added by an admin will appear here.`}</p></div>`;
    return;
  }
  const accessCell = (s) => {
    if (!me.canManage || s.isSelf || s.sharedLogin) return `<span class="pill ${s.access === "none" ? "pill--todo" : s.access === "view" ? "pill--sky" : "pill--ok"}">${esc(ACCESS[s.access])}</span>${s.sharedLogin ? `<span class="sub">Shares the ${esc(s.sharedLogin)} login</span>` : s.isSelf ? '<span class="sub">You can\'t change your own access</span>' : ""}`;
    return `<label class="sr" for="acc-${s.id}">Dashboard access for ${esc(fullName(s))}</label>
      <select class="input" id="acc-${s.id}" data-access="${s.id}">${Object.entries(ACCESS).map(([k, v]) => `<option value="${k}" ${k === s.access ? "selected" : ""}>${v}</option>`).join("")}</select>
      ${s.access !== "none" ? `<span class="sub">${s.setupPending ? "Setup pending · " : ""}<button type="button" class="linkbtn" data-setup="${s.id}">Resend setup link</button></span>` : ""}`;
  };
  box.innerHTML = `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Name</th><th>Location</th><th>Contact</th>${role === "Camp Staff" && state.assess ? "<th>Assessment</th>" : ""}<th>Dashboard access</th>${me.canManage ? "<th>ID proof</th><th><span class=\"sr\">Actions</span></th>" : ""}</tr></thead>
    <tbody>${list.map((s) => `<tr>
      <td data-label="Name"><div><b>${esc(fullName(s))}</b>${s.isSelf ? ' <span class="pill pill--sky">You</span>' : ""}<span class="sub">${esc(s.gender)}</span></div></td>
      <td data-label="Location">${esc(s.location)}</td>
      <td data-label="Contact"><div><a href="mailto:${esc(s.email)}">${esc(s.email)}</a><span class="sub"><a href="tel:${esc(s.phone)}">${esc(phoneText(s.phone))}</a></span></div></td>
      ${role === "Camp Staff" && state.assess ? `<td data-label="Assessment">${assessCell(state.assess.get(s.email.toLowerCase()))}</td>` : ""}
      <td data-label="Access"><div>${accessCell(s)}</div></td>
      ${me.canManage ? `<td data-label="ID proof"><a href="/api/admin/staff/${s.id}/id-proof" target="_blank" rel="noopener">View</a></td>
      <td class="act"><button type="button" class="btn btn--ghost btn--sm" data-edit="${s.id}" aria-label="Edit ${esc(fullName(s))}">Edit</button>
        <button type="button" class="btn btn--ghost btn--sm btn--del" data-del="${s.id}" aria-label="Delete ${esc(fullName(s))}" ${s.isSelf && !s.sharedLogin ? 'disabled title="You can\'t delete yourself"' : ""}>Delete</button></td>` : ""}
    </tr>`).join("")}</tbody></table></div>`;

  const byId = (id) => state.staff.find((s) => s.id === id);
  const replace = (s) => { state.staff = state.staff.map((x) => (x.id === s.id ? s : x)); drawStaff(el, box, me, role); };

  box.querySelectorAll("[data-access]").forEach((sel) => sel.addEventListener("change", async () => {
    const s = byId(sel.dataset.access), level = sel.value;
    const [title, text, ok] = ACCESS_TEXT[level](fullName(s));
    if (!(await confirmDialog(title, text, ok, level !== "view"))) { sel.value = s.access; return; }
    sel.disabled = true;
    try {
      const r = await api(`/api/admin/staff/${s.id}/access`, { method: "PUT", body: JSON.stringify({ access: level }) });
      toast(level === "none" ? `${fullName(s)} no longer has dashboard access.` : `${fullName(s)} now has ${ACCESS[level]} access.`);
      if (r.warning) toast(r.warning, "warn");
      replace(r.staff);
    } catch (err) { toast(err.message, "err"); sel.value = s.access; sel.disabled = false; }
  }));
  box.querySelectorAll("[data-setup]").forEach((b) => (b.onclick = async () => {
    const s = byId(b.dataset.setup);
    if (!(await confirmDialog(`Send ${fullName(s)} a new setup link?`, `We'll email ${s.email} a one-time link (valid 24 hours) to set their dashboard password. Any older link stops working.`, "Send link", false))) return;
    try { await api(`/api/admin/staff/${s.id}/setup-link`, { method: "POST" }); toast(`Setup link sent to ${s.email}.`); }
    catch (err) { toast(err.message, "err"); }
  }));
  box.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => staffForm(el, me, byId(b.dataset.edit), role)));
  box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const s = byId(b.dataset.del);
    if (!(await confirmDialog(`Delete ${fullName(s)}?`, "This removes their staff record, ID proof and any dashboard access, and sets Portal - Access Granted to No in GHL so they can't sign in to the staff portal. Their GHL contact itself is not deleted.", "Delete"))) return;
    try {
      await busy(b, "Deleting…", () => api(`/api/admin/staff/${s.id}`, { method: "DELETE" }));
      state.staff = state.staff.filter((x) => x.id !== s.id);
      toast(`${fullName(s)} deleted.`);
      drawStaff(el, box, me, role);
    } catch (err) { toast(err.message, "err"); }
  }));
}

// Add (s = null) or edit a camp staff member or tutor. role: the page it was opened from.
function staffForm(el, me, s, role = "Camp Staff") {
  const editing = !!s, p = s || { access: "none", role }, pg = staffPage(role);
  const field = (id, label, value, attrs = "") => `<div><label class="label" for="f-${id}">${label}</label>
    <input class="input" id="f-${id}" name="${id}" value="${esc(value)}" aria-describedby="e-${id}" ${attrs}>${errSlot(id)}</div>`;
  const select = (id, label, options, value, attrs = "") => `<div><label class="label" for="f-${id}">${label}</label>
    <select class="input" id="f-${id}" name="${id}" aria-describedby="e-${id}" ${attrs}><option value="">Choose one</option>
    ${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>${errSlot(id)}</div>`;
  const pairs = (list) => list.map((v) => [v, v]);
  el.innerHTML = `${header(editing ? `Edit ${esc(fullName(s))}` : `Add ${pg.one === "tutor" ? "a tutor" : "camp staff"}`, editing ? "Change any details and save. Uploading a new ID proof is optional." : `All fields are required. They'll be set up in GHL so they can sign in to the ${pg.one === "tutor" ? "tutor" : "staff"} portal.`,
      `<button class="btn btn--ghost" data-back>Back to ${pg.title.toLowerCase()}</button>`)}
    <form class="card" novalidate>
      <div class="grid grid--2">
        ${field("firstName", "First name", p.firstName, 'autocomplete="off" maxlength="50" required')}
        ${field("lastName", "Last name", p.lastName, 'autocomplete="off" maxlength="50" required')}
        ${select("gender", "Gender", pairs(GENDERS), p.gender, "required")}
        ${field("email", "Email", p.email, 'type="email" autocomplete="off" maxlength="200" required')}
        <div><label class="label" for="f-phone">Phone number</label>
          <input class="input" id="f-phone" name="phone" value="${esc(phoneText(p.phone))}" type="tel" placeholder="469-555-0123" aria-describedby="h-phone e-phone" required>
          <p class="hint" id="h-phone">US numbers can skip +1. Other countries: start with + and the country code.</p>${errSlot("phone")}</div>
        ${select("role", "Role", pairs(STAFF_ROLES), p.role, "required")}
        ${select("location", "Location", pairs(LOCATIONS), p.location, "required")}
        <div><label class="label" for="f-access">Dashboard access</label>
          <select class="input" id="f-access" name="access" aria-describedby="h-access e-access" ${editing && (s.isSelf || s.sharedLogin) ? "disabled" : ""}>
            ${Object.entries(ACCESS).map(([k, v]) => `<option value="${k}" ${k === p.access ? "selected" : ""}>${v}</option>`).join("")}</select>
          <p class="hint" id="h-access">${editing && s.sharedLogin ? `They share the ${esc(s.sharedLogin)} dashboard login; its access and password are changed on the record that owns it.` : editing && s.isSelf ? "You can't change your own access. Change your own password in Settings." : "Whether they can sign in to this admin dashboard at /admin. If this email already signs in, they share that login."}</p>${errSlot("access")}</div>
        <div class="fld--full" data-pwbox ${p.access === "none" || (editing && (s.isSelf || s.sharedLogin)) ? "hidden" : ""}>
          <div class="grid grid--2">
            <div><label class="label" for="f-password">Dashboard password</label>
              <input class="input" id="f-password" name="password" type="password" autocomplete="new-password" aria-describedby="h-password e-password">${errSlot("password")}</div>
            <div><label class="label" for="f-confirm">Confirm password</label>
              <input class="input" id="f-confirm" name="confirm" type="password" autocomplete="new-password" aria-describedby="e-confirm">${errSlot("confirm")}</div>
          </div>
          <p class="hint" id="h-password">${editing
            ? "Leave blank to keep their current password. If they don't have one yet, leaving it blank emails them a setup link instead. Setting a new one signs them out everywhere."
            : "At least 8 characters. They sign in at /admin with their email and this password, and are asked to change it. Share it with them privately."}</p>
          <div class="tools" style="margin-top:10px">
            <button type="button" class="btn btn--ghost btn--sm" data-gen>Generate password</button>
            <button type="button" class="btn btn--ghost btn--sm" data-copy>Copy</button>
          </div>
        </div>
        <div class="fld--full">
          <span class="label">Identity proof</span>
          ${editing ? `<div class="curfile">${ico("file")}<div><b>${esc(s.idProofFileName)}</b><a href="/api/admin/staff/${s.id}/id-proof" target="_blank" rel="noopener">View or download</a></div>
            <button type="button" class="btn btn--ghost btn--sm" data-replace aria-expanded="false">Replace file</button></div>` : ""}
          <label class="drop drop--sm" data-drop ${editing ? "hidden" : ""}>${ico("upload")}<strong>Choose a file or drop it here</strong>
            <span class="hint">${ID_PROOF.label}, up to 5 MB</span>
            <input type="file" name="idProof" accept="${ID_PROOF.accept}" data-file aria-describedby="e-idProof"></label>
          <div class="picked" data-picked></div>${errSlot("idProof")}
        </div>
      </div>
      <div class="formbar formbar--end">
        <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit">${editing ? "Save changes" : `Add ${pg.one === "tutor" ? "tutor" : "camp staff"}`}</button>
      </div>
    </form>`;
  // Back to the list; if the role changed, to the other page.
  const back = (to = role) => {
    const r = staffPage(to).r;
    if (route() === r) staffView(el, me, to); else location.hash = `#/${r}`;
  };
  el.querySelector("[data-back]").onclick = () => back();
  el.querySelector("[data-cancel]").onclick = () => back();
  const form = el.querySelector("form"), fe = formErrors(form), input = form.querySelector("[data-file]"), drop = form.querySelector("[data-drop]");
  const picked = form.querySelector("[data-picked]"), btn = form.querySelector('button[type="submit"]');
  const pwbox = form.querySelector("[data-pwbox]"), pw = form.elements.password, pw2 = form.elements.confirm;
  let file = null, tried = false, preview = null;
  passwordToggles(form);

  const check = () => {
    const { errors } = validateStaff(Object.fromEntries(new FormData(form)));
    const f = fileError(file, ID_PROOF, { required: !editing });
    if (f) errors.idProof = f;
    if (!pwbox.hidden) {
      if (!editing && !pw.value) errors.password = "Enter a password, or click “Generate password”.";
      else if (pw.value) {
        const pe = passwordError(pw.value, form.elements.email.value.trim());
        if (pe) errors.password = pe; else if (pw.value !== pw2.value) errors.confirm = "The two passwords don't match.";
      }
    }
    return errors;
  };

  // Password fields only matter when the person gets dashboard access.
  const selfEdit = editing && (s.isSelf || !!s.sharedLogin);
  form.elements.access.addEventListener("change", () => {
    pwbox.hidden = selfEdit || form.elements.access.value === "none";
    if (pwbox.hidden) { pw.value = pw2.value = ""; fe.set("password", ""); fe.set("confirm", ""); }
  });
  form.querySelector("[data-gen]").onclick = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?";
    const value = Array.from(crypto.getRandomValues(new Uint32Array(16)), (n) => chars[n % chars.length]).join("");
    pw.value = pw2.value = value;
    pwbox.querySelectorAll(".pw__btn").forEach((b) => { if (b.previousElementSibling.type === "password") b.click(); });
    fe.set("password", ""); fe.set("confirm", "");
  };
  form.querySelector("[data-copy]").onclick = async () => {
    if (!pw.value) return toast("Generate or type a password first.", "warn");
    try { await navigator.clipboard.writeText(pw.value); toast("Password copied. Share it with them privately."); }
    catch { toast("Couldn't copy. Select the password and copy it yourself.", "err"); }
  };
  const pick = (f) => {
    file = f || null;
    if (preview) URL.revokeObjectURL(preview);
    preview = file && /^image\/(jpeg|png)$/.test(file.type) ? URL.createObjectURL(file) : null;
    picked.innerHTML = file ? `<p class="hint">${esc(file.name)} · ${(file.size / 1048576).toFixed(1)} MB</p>${preview ? `<img src="${preview}" alt="Preview of the chosen file">` : ""}` : "";
    fe.set("idProof", file || tried ? fileError(file, ID_PROOF, { required: !editing }) : "");
  };
  input.addEventListener("change", () => pick(input.files[0]));
  ["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); });
  const rep = form.querySelector("[data-replace]");
  if (rep) rep.onclick = () => {
    const open = drop.hidden;
    drop.hidden = !open;
    rep.textContent = open ? "Keep current file" : "Replace file";
    rep.setAttribute("aria-expanded", String(open));
    if (open) input.focus(); else { input.value = ""; pick(null); }
  };
  form.addEventListener("focusout", (e) => {
    const n = e.target.name;
    if (n && n !== "idProof" && (tried || e.target.value.trim())) fe.set(n, check()[n]);
  });
  form.addEventListener("input", (e) => { if (tried && e.target.name && e.target.name !== "idProof") fe.set(e.target.name, check()[e.target.name]); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    tried = true;
    const errs = check();
    fe.show(errs);
    if (Object.keys(errs).length) return fe.focus();
    const access = form.elements.access;
    if (!access.disabled && access.value === "admin" && p.access !== "admin") {
      const [title, text, ok] = ACCESS_TEXT.admin(`${form.elements.firstName.value} ${form.elements.lastName.value}`.trim());
      if (!(await confirmDialog(title, text, ok))) return;
    }
    const body = new FormData(form);
    body.delete("idProof");
    if (file) body.append("idProof", file);
    const setsPassword = !pwbox.hidden && !!pw.value;
    if (!setsPassword) { body.delete("password"); body.delete("confirm"); }
    try {
      const r = await busy(btn, file ? "Uploading…" : "Saving…", () => api(editing ? `/api/admin/staff/${s.id}` : "/api/admin/staff", { method: editing ? "PUT" : "POST", body }));
      toast(editing ? `Saved changes to ${fullName(r.staff)}.` : `${fullName(r.staff)} added.`);
      if (r.note) toast(r.note);
      else if (setsPassword) toast(`${fullName(r.staff)} can sign in at /admin with their email and the password you set.`);
      if (r.warning) toast(r.warning, "warn");
      if (preview) URL.revokeObjectURL(preview);
      if (r.staff.role !== role) toast(`${fullName(r.staff)} is now listed under ${staffPage(r.staff.role).title}.`);
      back(r.staff.role);
    } catch (err) {
      if (err.fields) { fe.show(err.fields); fe.focus(); }
      toast(err.message, "err");
    }
  });
  form.elements.firstName.focus();
  window.scrollTo(0, 0);
}

// ---------- Settings ----------
async function settingsView(el, me) {
  const emailLocked = !me.canManage || me.linkedStaff;
  el.innerHTML = `${header("Settings", "Your profile, photo and password.")}
    ${me.mustChangePassword ? `<p class="alert alert--info" style="margin:0 0 18px">Your password was set for you. Please choose your own password below.</p>` : ""}
    <div class="stack">
      <section class="card">
        <div class="card__h"><div><h2>Profile photo</h2><p class="card__sub">${PHOTO.label}, up to 2 MB. Shown in the sidebar.</p></div></div>
        <form class="photo-row" data-photo novalidate>
          <span data-ava>${avatar(me, "ava ava--lg")}</span>
          <div class="tools">
            <label class="btn btn--ghost" style="position:relative">${ico("upload")} Choose photo<input type="file" name="photo" accept="${PHOTO.accept}" class="sr" data-pfile aria-describedby="e-photo"></label>
            <button class="btn" type="submit" disabled>Save photo</button>
            ${me.photoUrl ? `<button class="btn btn--ghost" type="button" data-premove>${ico("trash")} Remove photo</button>` : ""}
            <div style="flex-basis:100%">${errSlot("photo")}</div>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card__h"><div><h2>Your details</h2><p class="card__sub">Access level: ${levelPill(me)}</p></div></div>
        <form data-profile novalidate>
          <div class="grid grid--2">
            <div><label class="label" for="pf-first">First name</label><input class="input" id="pf-first" name="firstName" value="${esc(me.firstName)}" maxlength="50" aria-describedby="e-firstName">${errSlot("firstName")}</div>
            <div><label class="label" for="pf-last">Last name</label><input class="input" id="pf-last" name="lastName" value="${esc(me.lastName)}" maxlength="50" aria-describedby="e-lastName">${errSlot("lastName")}</div>
            <div class="fld--full"><label class="label" for="pf-email">Email</label>
              <input class="input" id="pf-email" name="email" type="email" value="${esc(me.email)}" ${emailLocked ? "readonly" : ""} aria-describedby="h-email e-email">
              <p class="hint" id="h-email">${emailLocked ? (me.canManage ? "Your email is part of your staff record. Change it from the Camp staff or Tutors page." : "Only admins can change their email.") : "This is the email you sign in with."}</p>${errSlot("email")}</div>
          </div>
          <div class="formbar formbar--end"><button class="btn" type="submit">Save details</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card__h"><div><h2>Change password</h2><p class="card__sub">Changing it signs you out on your other devices.</p></div></div>
        <form data-pw novalidate>
          <div class="grid grid--2">
            <div class="fld--full"><label class="label" for="pw-cur">Current password</label><input class="input" id="pw-cur" name="current" type="password" autocomplete="current-password" aria-describedby="e-current">${errSlot("current")}</div>
            <div><label class="label" for="pw-new">New password</label><input class="input" id="pw-new" name="password" type="password" autocomplete="new-password" aria-describedby="h-pw e-password"><p class="hint" id="h-pw">At least 8 characters.</p>${errSlot("password")}</div>
            <div><label class="label" for="pw-con">Confirm new password</label><input class="input" id="pw-con" name="confirm" type="password" autocomplete="new-password" aria-describedby="e-confirm">${errSlot("confirm")}</div>
          </div>
          <div class="formbar formbar--end"><button class="btn" type="submit">Change password</button></div>
        </form>
      </section>

      ${me.canManage ? `<section class="card"><div class="card__h"><div><h2>Activity log</h2><p class="card__sub">The last 200 changes made in this dashboard. Only admins see this.</p></div></div><div data-log><p class="hint">Loading…</p></div></section>` : ""}
    </div>`;

  passwordToggles(el);

  // photo
  const pf = el.querySelector("[data-photo]"), pfe = formErrors(pf), pin = pf.querySelector("[data-pfile]"), psave = pf.querySelector('button[type="submit"]');
  let photo = null, purl = null;
  pin.addEventListener("change", () => {
    photo = pin.files[0] || null;
    const err = fileError(photo, PHOTO, { required: true });
    pfe.set("photo", err);
    if (purl) URL.revokeObjectURL(purl);
    purl = photo && !err ? URL.createObjectURL(photo) : null;
    el.querySelector("[data-ava]").innerHTML = purl ? `<span class="ava ava--lg"><img src="${purl}" alt="Preview of your new photo"></span>` : avatar(me, "ava ava--lg");
    psave.disabled = !purl;
  });
  pf.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!photo) return;
    const body = new FormData();
    body.append("photo", photo);
    try {
      const r = await busy(psave, "Uploading…", () => api("/api/admin/me/photo", { method: "POST", body }));
      state.me = r.user;
      toast("Profile photo saved.");
      renderShell();
    } catch (err) { if (err.fields) pfe.show(err.fields); toast(err.message, "err"); psave.disabled = false; }
  });
  pf.querySelector("[data-premove]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!(await confirmDialog("Remove your profile photo?", "Your initials will show in the sidebar instead.", "Remove photo"))) return;
    try {
      const r = await busy(btn, "Removing…", () => api("/api/admin/me/photo", { method: "DELETE" }));
      state.me = r.user;
      toast("Profile photo removed.");
      renderShell();
    } catch (err) { toast(err.message, "err"); }
  });

  // details
  const df = el.querySelector("[data-profile]"), dfe = formErrors(df), dbtn = df.querySelector('button[type="submit"]');
  df.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(df));
    v.firstName = v.firstName.trim(); v.lastName = v.lastName.trim(); v.email = v.email.trim().toLowerCase();
    const errs = {};
    const a = nameError(v.firstName, "first name"), b = nameError(v.lastName, "last name"), c = emailLocked ? null : emailError(v.email);
    if (a) errs.firstName = a;
    if (b) errs.lastName = b;
    if (c) errs.email = c;
    dfe.show(errs);
    if (Object.keys(errs).length) return dfe.focus();
    try {
      const r = await busy(dbtn, "Saving…", () => api("/api/admin/me", { method: "PUT", body: JSON.stringify(v) }));
      state.me = r.user;
      toast("Your details are saved.");
      renderShell();
    } catch (err) { if (err.fields) { dfe.show(err.fields); dfe.focus(); } toast(err.message, "err"); }
  });

  // password
  const wf = el.querySelector("[data-pw]"), wfe = formErrors(wf), wbtn = wf.querySelector('button[type="submit"]');
  wf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(wf));
    const errs = {};
    if (!v.current) errs.current = "Enter your current password.";
    const pe = passwordError(v.password, me.email);
    if (pe) errs.password = pe; else if (v.password !== v.confirm) errs.confirm = "The two passwords don't match.";
    wfe.show(errs);
    if (Object.keys(errs).length) return wfe.focus();
    try {
      const r = await busy(wbtn, "Saving…", () => api("/api/admin/me/password", { method: "POST", body: JSON.stringify(v) }));
      state.me = r.user;
      wf.reset();
      toast("Password changed.");
      renderShell();
    } catch (err) { if (err.fields) { wfe.show(err.fields); wfe.focus(); } toast(err.message, "err"); }
  });

  // activity log (admins)
  const logBox = el.querySelector("[data-log]");
  if (logBox) {
    try {
      const { activity } = await api("/api/admin/activity");
      logBox.innerHTML = activity.length ? `<div class="tbl-wrap"><table class="tbl log">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
        <tbody>${activity.map((a) => `<tr><td data-label="When">${esc(when(a.at))}</td><td data-label="Who">${esc(a.user_name)}</td>
          <td data-label="What"><div><b>${esc(a.action)}</b><span class="sub">${esc(a.target)}</span></div></td><td data-label="Details">${esc(a.details || "")}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="hint" style="margin:0">Nothing yet. Changes made in this dashboard will show here.</p>';
    } catch (err) { logBox.innerHTML = `<p class="alert alert--err" style="margin:0">${esc(err.message)}</p>`; }
  }
}

const VIEWS = { roster: rosterView, parents: parentsView, parent: parentDetailView, followups: followupsView, staff: staffView, tutors: tutorsView, training: trainingView, assessments: assessmentsView, intros: introVideosView, notifications: notificationsView, announcements: announcementsView, camp: campInfoView, week: weekView, chat: chatView, settings: settingsView };

boot();
