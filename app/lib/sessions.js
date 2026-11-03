// Sign-in sessions kept in the database, so restarting the server doesn't sign anyone out. The
// session id lives only in the browser's cookie; the database keeps a hash of it, so a copy of the
// database can't be used to sign in. kind: "portal" (parents, staff, tutors) or "admin".

import crypto from "node:crypto";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function createSessions(db, kind) {
  return {
    // A new session for subject (contact id / admin user id), valid for ms. Returns the id for the cookie.
    create(subject, ms) {
      const sid = crypto.randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
      db.prepare("INSERT INTO sessions (sid_hash, kind, subject, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(sha(sid), kind, String(subject), Date.now() + ms, new Date().toISOString());
      return sid;
    },
    // { subject, exp } for a live session, else null.
    get(sid) {
      const r = db.prepare("SELECT subject, expires_at FROM sessions WHERE sid_hash = ? AND kind = ?").get(sha(sid), kind);
      if (!r) return null;
      if (r.expires_at < Date.now()) { this.remove(sid); return null; }
      return { subject: r.subject, exp: r.expires_at };
    },
    remove(sid) { db.prepare("DELETE FROM sessions WHERE sid_hash = ?").run(sha(sid)); },
    // Signs a subject out everywhere (except the session exceptSid).
    removeFor(subject, exceptSid = "") {
      db.prepare("DELETE FROM sessions WHERE kind = ? AND subject = ? AND sid_hash != ?").run(kind, String(subject), exceptSid ? sha(exceptSid) : "");
    },
  };
}
