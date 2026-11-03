// Announcements: admins post a message to parents' Notifications in the portal, optionally by email
// and SMS too (lib/outreach.js sends those). Each one has an audience (every family, one location,
// or chosen families), can be scheduled, and is shown to each parent in their own language
// (translations are made when it's sent). Read and removed (x) state is kept per parent (GHL
// contact). Deleting an announcement hides it everywhere. Announcements can carry files (PDF, JPG,
// PNG) that parents open from their Notifications; they're stored in <data>/announcements/.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const now = () => new Date().toISOString();
const httpError = (status, message, fields) => Object.assign(new Error(message), { httpStatus: status, fields });

export const ANNOUNCEMENT_LIMITS = { title: 120, body: 2000, families: 500, files: 5 };
export const ATTACHMENT = { maxBytes: 10 * 1024 * 1024, types: { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }, label: "PDF, JPG or PNG", accept: ".pdf,.jpg,.jpeg,.png" };
const FILE_ID = /^[0-9a-f-]{36}$/;
export const LOCATIONS = ["Plano", "Little Elm"];
const CHANNELS = ["email", "sms"]; // the portal is always included

export function validateAnnouncement(input, { scheduleOnly = false } = {}) {
  const title = String(input?.title ?? "").trim(), body = String(input?.body ?? "").trim();
  const fields = {};
  if (!title) fields.title = "Add a title.";
  else if (title.length > ANNOUNCEMENT_LIMITS.title) fields.title = `Keep the title under ${ANNOUNCEMENT_LIMITS.title} characters.`;
  if (!body) fields.body = "Write the announcement.";
  else if (body.length > ANNOUNCEMENT_LIMITS.body) fields.body = `Keep it under ${ANNOUNCEMENT_LIMITS.body} characters.`;
  const attachments = [...new Set((Array.isArray(input?.attachments) ? input.attachments : []).map(String).filter((id) => FILE_ID.test(id)))];
  if (attachments.length > ANNOUNCEMENT_LIMITS.files) fields.attachments = `Attach at most ${ANNOUNCEMENT_LIMITS.files} files.`;
  if (scheduleOnly) { // already sent: only the wording and the files can change
    if (Object.keys(fields).length) throw httpError(400, "Please fix the highlighted fields.", fields);
    return { title, body, attachments };
  }

  const a = input?.audience || {};
  let audience = { type: "all" };
  if (a.type === "location") {
    if (!LOCATIONS.includes(a.location)) fields.audience = "Choose a location.";
    audience = { type: "location", location: a.location };
  } else if (a.type === "families") {
    const ids = [...new Set((Array.isArray(a.contactIds) ? a.contactIds : []).map(String).filter((id) => /^[\w-]{1,64}$/.test(id)))];
    if (!ids.length) fields.audience = "Choose at least one family.";
    else if (ids.length > ANNOUNCEMENT_LIMITS.families) fields.audience = `Choose at most ${ANNOUNCEMENT_LIMITS.families} families.`;
    audience = { type: "families", contactIds: ids };
  }
  const channels = ["portal", ...CHANNELS.filter((c) => (input?.channels || []).includes(c))];

  let sendAt = null;
  if (input?.sendAt) {
    const t = new Date(input.sendAt);
    if (isNaN(t)) fields.sendAt = "Choose a valid date and time.";
    else if (t < Date.now() - 60_000) fields.sendAt = "Choose a time in the future, or send it now.";
    else if (t > Date.now() + 180 * 86400_000) fields.sendAt = "Choose a time within the next 6 months.";
    else sendAt = t.toISOString();
  }
  if (Object.keys(fields).length) throw httpError(400, "Please fix the highlighted fields.", fields);
  return { title, body, audience, channels, sendAt, attachments };
}

// When an announcement reached parents: its send time (scheduled ones are written earlier).
const sentTime = (a) => a.sent_at || a.created_at;
// Whether an announcement went out after the parent ({ joinedAt }) became a parent. New parents
// don't see what was announced before they joined. No joinedAt (no Winter Camp 2026 opportunity): all.
export const afterJoin = (a, parent) => !parent.joinedAt || sentTime(a) >= parent.joinedAt;

// Saves when a parent became a parent: the earliest of what's saved and the given dates (ISO, e.g.
// their Winter Camp 2026 Paid (won) opportunities' createdAt). Returns the saved value or null.
export function saveJoinedAt(db, contactId, dates) {
  const first = dates.filter(Boolean).map((d) => new Date(d).toISOString()).sort()[0];
  if (first) db.prepare(`INSERT INTO parent_access (contact_id, joined_at, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (contact_id) DO UPDATE SET joined_at = excluded.joined_at
    WHERE parent_access.joined_at IS NULL OR excluded.joined_at < parent_access.joined_at`).run(contactId, first, new Date().toISOString());
  return db.prepare("SELECT joined_at FROM parent_access WHERE contact_id = ?").get(contactId)?.joined_at || null;
}

// Whether a parent ({ contactId, location }) is in an announcement's audience.
export function inAudience(audience, parent) {
  if (audience.type === "location") return parent.location === audience.location;
  if (audience.type === "families") return audience.contactIds.includes(parent.contactId);
  return true;
}

export function createAnnouncements(db, dataDir) {
  const filesDir = path.join(dataDir, "announcements");
  fs.mkdirSync(filesDir, { recursive: true });
  const row = (id) => db.prepare("SELECT * FROM announcements WHERE id = ? AND deleted_at IS NULL").get(id);
  const fileView = (f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size });
  const filesOf = (id) => db.prepare("SELECT * FROM announcement_files WHERE announcement_id = ? ORDER BY position, created_at").all(id).map(fileView);
  const dropFile = (f) => {
    db.prepare("DELETE FROM announcement_files WHERE id = ?").run(f.id);
    fs.promises.unlink(path.join(filesDir, f.stored)).catch(() => {});
  };
  // The announcement's files become exactly `ids` (uploads not yet attached, or already its own).
  function attach(id, ids) {
    const rows = ids.map((fid) => db.prepare("SELECT * FROM announcement_files WHERE id = ?").get(fid));
    if (rows.some((f) => !f || (f.announcement_id !== null && f.announcement_id !== Number(id))))
      throw httpError(400, "One of the attachments is no longer available. Remove it and upload it again.", { attachments: "Upload the file again." });
    for (const f of db.prepare("SELECT * FROM announcement_files WHERE announcement_id = ?").all(id)) if (!ids.includes(f.id)) dropFile(f);
    rows.forEach((f, i) => db.prepare("UPDATE announcement_files SET announcement_id = ?, position = ? WHERE id = ?").run(id, i, f.id));
  }
  const parse = (a) => ({ ...a, audience: JSON.parse(a.audience), channels: JSON.parse(a.channels),
    translations: a.translations ? JSON.parse(a.translations) : {}, summary: a.send_summary ? JSON.parse(a.send_summary) : null });
  const forAdmin = (raw) => {
    const a = parse(raw);
    return {
      id: a.id, title: a.title, body: a.body, createdBy: a.created_by, createdAt: a.created_at, updatedAt: a.updated_at,
      audience: a.audience, channels: a.channels, sendAt: a.send_at, sentAt: a.sent_at, summary: a.summary,
      languages: Object.keys(a.translations), translations: a.translations, files: filesOf(a.id),
      seenBy: db.prepare("SELECT COUNT(*) AS n FROM announcement_reads WHERE announcement_id = ? AND read_at IS NOT NULL").get(a.id).n,
    };
  };

  return {
    // ----- admin -----
    all() {
      return db.prepare("SELECT * FROM announcements WHERE deleted_at IS NULL ORDER BY COALESCE(sent_at, send_at) DESC, id DESC").all().map(forAdmin);
    },
    get(id) { const a = row(id); return a && parse(a); },
    view(id) { const a = row(id); return a && forAdmin(a); },
    create(input, by) {
      const v = validateAnnouncement(input);
      db.exec("BEGIN");
      try {
        const r = db.prepare(`INSERT INTO announcements (title, body, audience, channels, send_at, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(v.title, v.body, JSON.stringify(v.audience), JSON.stringify(v.channels), v.sendAt, by, now(), now());
        attach(Number(r.lastInsertRowid), v.attachments);
        db.exec("COMMIT");
        return parse(row(r.lastInsertRowid));
      } catch (err) { db.exec("ROLLBACK"); throw err; }
    },
    // Before it's sent everything can change; after, only the wording (parents have it already).
    update(id, input) {
      const a = row(id);
      if (!a) throw httpError(404, "Announcement not found.");
      if (a.sent_at) {
        const v = validateAnnouncement(input, { scheduleOnly: true });
        attach(id, v.attachments);
        db.prepare("UPDATE announcements SET title = ?, body = ?, translations = NULL, updated_at = ? WHERE id = ?").run(v.title, v.body, now(), id);
      } else {
        const v = validateAnnouncement(input);
        attach(id, v.attachments);
        db.prepare("UPDATE announcements SET title = ?, body = ?, audience = ?, channels = ?, send_at = ?, updated_at = ? WHERE id = ?")
          .run(v.title, v.body, JSON.stringify(v.audience), JSON.stringify(v.channels), v.sendAt, now(), id);
      }
      return parse(row(id));
    },
    remove(id) {
      const a = row(id);
      if (!a) throw httpError(404, "Announcement not found.");
      db.prepare("UPDATE announcements SET deleted_at = ? WHERE id = ?").run(now(), id);
      for (const f of db.prepare("SELECT * FROM announcement_files WHERE announcement_id = ?").all(id)) dropFile(f);
      return a;
    },

    // ----- attachments -----
    // Saves an upload ({ buffer, mime, name }) unattached; it's attached when the announcement is saved.
    async addFile(file, by) {
      // Uploads nobody attached within a day are removed.
      const old = new Date(Date.now() - 86400_000).toISOString();
      for (const f of db.prepare("SELECT * FROM announcement_files WHERE announcement_id IS NULL AND created_at < ?").all(old)) dropFile(f);
      const id = crypto.randomUUID(), stored = `${id}.${ATTACHMENT.types[file.mime]}`;
      await fs.promises.writeFile(path.join(filesDir, stored), file.buffer, { flag: "wx", mode: 0o600 });
      db.prepare("INSERT INTO announcement_files (id, name, mime, size, stored, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, file.name, file.mime, file.buffer.length, stored, by, now());
      return { id, name: file.name, mime: file.mime, size: file.buffer.length };
    },
    // { path, name, mime, announcement } for a file, or null. announcement: the parsed announcement it's on (null if unattached).
    file(fileId) {
      if (!FILE_ID.test(String(fileId))) return null;
      const f = db.prepare("SELECT * FROM announcement_files WHERE id = ?").get(String(fileId));
      if (!f) return null;
      const a = f.announcement_id ? row(f.announcement_id) : null;
      if (f.announcement_id && !a) return null;
      return { path: path.join(filesDir, f.stored), name: f.name, mime: f.mime, announcement: a && parse(a) };
    },
    fileCount(id) { return db.prepare("SELECT COUNT(*) AS n FROM announcement_files WHERE announcement_id = ?").get(id).n; },

    // ----- sending (lib/admin.js) -----
    // Scheduled announcements whose time has come.
    due() {
      return db.prepare("SELECT id FROM announcements WHERE deleted_at IS NULL AND sent_at IS NULL AND (send_at IS NULL OR send_at <= ?)").all(now()).map((r) => r.id);
    },
    // Marks it sent; false if something else already did (so it's never sent twice).
    claim(id) {
      return db.prepare("UPDATE announcements SET sent_at = ? WHERE id = ? AND sent_at IS NULL AND deleted_at IS NULL").run(now(), id).changes === 1;
    },
    saveTranslations(id, translations) {
      db.prepare("UPDATE announcements SET translations = ? WHERE id = ?").run(JSON.stringify(translations), id);
    },
    saveSummary(id, summary) {
      db.prepare("UPDATE announcements SET send_summary = ? WHERE id = ?").run(JSON.stringify(summary), id);
    },

    // Sent announcements this parent can see that have no translation in `lang` yet.
    missingTranslations(parent, lang) {
      if (lang === "en") return [];
      return db.prepare(`SELECT * FROM announcements WHERE deleted_at IS NULL AND sent_at IS NOT NULL
        AND (? IS NULL OR sent_at >= ?)`).all(parent.joinedAt ?? null, parent.joinedAt ?? null).map(parse)
        .filter((a) => inAudience(a.audience, parent) && !a.translations[lang]);
    },
    addTranslation(id, lang, t) {
      const a = row(id);
      if (!a) return;
      db.prepare("UPDATE announcements SET translations = ? WHERE id = ?").run(JSON.stringify({ ...(a.translations ? JSON.parse(a.translations) : {}), [lang]: t }), id);
    },

    // ----- parent -----
    // Sent announcements for this parent ({ contactId, location, joinedAt }) that they haven't removed,
    // newest first, in their language when there's a translation. Only ones sent on or after joinedAt.
    forParent(parent, lang) {
      const joined = parent.joinedAt ?? null;
      return db.prepare(`SELECT a.*, r.read_at FROM announcements a
        LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.contact_id = ?
        WHERE a.deleted_at IS NULL AND a.sent_at IS NOT NULL AND r.dismissed_at IS NULL
          AND (? IS NULL OR a.sent_at >= ?) ORDER BY a.sent_at DESC, a.id DESC`).all(parent.contactId, joined, joined)
        .map((raw) => ({ ...parse(raw), read_at: raw.read_at }))
        .filter((a) => inAudience(a.audience, parent))
        .map((a) => {
          const t = a.translations[lang];
          return { id: a.id, title: t?.title || a.title, body: t?.body || a.body, at: a.sent_at, read: !!a.read_at, files: filesOf(a.id) };
        });
    },
    markRead(contactId, ids) {
      const ins = db.prepare(`INSERT INTO announcement_reads (announcement_id, contact_id, read_at) VALUES (?, ?, ?)
        ON CONFLICT (announcement_id, contact_id) DO UPDATE SET read_at = COALESCE(read_at, excluded.read_at)`);
      for (const id of ids) if (row(id)) ins.run(id, contactId, now());
    },
    dismiss(contactId, id) {
      if (!row(id)) return false;
      db.prepare(`INSERT INTO announcement_reads (announcement_id, contact_id, read_at, dismissed_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (announcement_id, contact_id) DO UPDATE SET dismissed_at = excluded.dismissed_at, read_at = COALESCE(read_at, excluded.read_at)`).run(id, contactId, now(), now());
      return true;
    },
  };
}
