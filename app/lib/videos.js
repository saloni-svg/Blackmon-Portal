// Videos: training videos admins upload (a list for camp staff and a list for tutors, which they
// watch on their Training page) and the intro video each camp staff member / tutor uploads (kept
// here so admins can watch it, and also sent to their GHL contact). Files live in <data>/training/
// and <data>/intro-videos/, are streamed to disk as they arrive, and are played with seeking support.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const VIDEO_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
export const TRAINING_MAX = 1024 * 1024 * 1024; // 1 GB
export const INTRO_MAX = 200 * 1024 * 1024;
export const AUDIENCES = ["Camp Staff", "Tutor"];
const now = () => new Date().toISOString();
const httpError = (status, message) => Object.assign(new Error(message), { httpStatus: status });
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// The real type from the first bytes (MP4 / MOV have "ftyp" at byte 4; WebM starts with 1A 45 DF A3).
function sniff(head) {
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp") return head.toString("latin1", 8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  return null;
}

// Streams one video request body to `dir`. Returns { stored, mime, size }.
function receive(req, dir, limit) {
  if (Number(req.headers["content-length"]) > limit) return Promise.reject(httpError(413, `That video is over ${limit / 1048576} MB. Please choose a smaller one.`));
  const tmp = path.join(dir, `.${crypto.randomUUID()}.part`);
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp, { mode: 0o600 });
    let size = 0, head = Buffer.alloc(0), failed = null;
    const fail = (err) => { if (failed) return; failed = err; req.unpipe(out); out.destroy(); fs.promises.unlink(tmp).catch(() => {}); reject(err); };
    req.on("data", (c) => {
      size += c.length;
      if (head.length < 16) head = Buffer.concat([head, c]).subarray(0, 16);
      if (size > limit) { fail(httpError(413, `That video is over ${limit / 1048576} MB. Please choose a smaller one.`)); req.destroy(); }
    });
    req.on("error", fail);
    out.on("error", fail);
    out.on("finish", async () => {
      if (failed) return;
      const mime = sniff(head);
      if (!size) { await fs.promises.unlink(tmp).catch(() => {}); return reject(httpError(400, "Please choose a video file.")); }
      if (!mime) { await fs.promises.unlink(tmp).catch(() => {}); return reject(httpError(400, "That isn't an MP4, MOV or WebM video.")); }
      const stored = `${crypto.randomUUID()}.${VIDEO_TYPES[mime]}`;
      await fs.promises.rename(tmp, path.join(dir, stored));
      resolve({ stored, mime, size });
    });
    req.pipe(out);
  });
}

// Plays a video file, answering browser "Range" requests so the player can seek.
export async function serveVideo(req, res, file, mime, name, download = false) {
  let stat;
  try { stat = await fs.promises.stat(file); } catch { res.writeHead(404, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "The video file is missing." })); }
  const headers = { "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}` };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : stat.size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : stat.size - 1;
    if (start < 0) start = 0;
    end = Math.min(end, stat.size - 1);
    if (start > end) { res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  fs.createReadStream(file).pipe(res);
}

export function createVideos(db, dataDir) {
  const trainingDir = path.join(dataDir, "training"), introDir = path.join(dataDir, "intro-videos");
  fs.mkdirSync(trainingDir, { recursive: true });
  fs.mkdirSync(introDir, { recursive: true });
  const row = (id) => db.prepare("SELECT * FROM training_videos WHERE id = ?").get(Number(id));
  const view = (v) => ({ id: v.id, audience: v.audience, title: v.title, description: v.description, fileName: v.file_name, mime: v.mime, size: v.size,
    uploadedBy: v.uploaded_by, createdAt: v.created_at,
    // Uploaded with "Both": the same file is also in the other group's list.
    both: !!db.prepare("SELECT 1 FROM training_videos WHERE stored = ? AND audience != ?").get(v.stored, v.audience),
    watchedBy: db.prepare("SELECT COUNT(*) AS n FROM training_progress WHERE video_id = ?").get(v.id).n });
  const listRows = (audience) => db.prepare("SELECT * FROM training_videos WHERE audience = ? ORDER BY position, id").all(audience);

  return {
    // ----- training (admins) -----
    trainingList(audience) { return listRows(audience).map(view); },
    // audience "Both": the file is stored once and added to the end of both lists. Returns the new videos.
    async addTraining(req, { audience, title, description, fileName, by }) {
      const audiences = audience === "Both" ? AUDIENCES : [audience];
      if (!audiences.every((a) => AUDIENCES.includes(a))) throw httpError(400, "Choose camp staff, tutors, or both.");
      title = clean(title, 120); description = String(description ?? "").trim().slice(0, 1000);
      if (!title) throw httpError(400, "Give the video a title.");
      const f = await receive(req, trainingDir, TRAINING_MAX);
      return audiences.map((a) => {
        const pos = (db.prepare("SELECT MAX(position) AS p FROM training_videos WHERE audience = ?").get(a).p ?? -1) + 1;
        const r = db.prepare(`INSERT INTO training_videos (audience, title, description, file_name, stored, mime, size, position, uploaded_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a, title, description, clean(fileName, 120) || `training.${VIDEO_TYPES[f.mime]}`, f.stored, f.mime, f.size, pos, by, now(), now());
        return view(row(r.lastInsertRowid));
      });
    },
    updateTraining(id, { title, description }) {
      const v = row(id);
      if (!v) throw httpError(404, "Video not found.");
      title = clean(title, 120);
      if (!title) throw httpError(400, "Give the video a title.");
      db.prepare("UPDATE training_videos SET title = ?, description = ?, updated_at = ? WHERE id = ?").run(title, String(description ?? "").trim().slice(0, 1000), now(), v.id);
      return view(row(v.id));
    },
    // dir: -1 (up) or 1 (down) within its list.
    moveTraining(id, dir) {
      const v = row(id);
      if (!v) throw httpError(404, "Video not found.");
      const list = listRows(v.audience), i = list.findIndex((x) => x.id === v.id), j = i + (dir < 0 ? -1 : 1);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((x, k) => db.prepare("UPDATE training_videos SET position = ? WHERE id = ?").run(k, x.id));
    },
    removeTraining(id) {
      const v = row(id);
      if (!v) throw httpError(404, "Video not found.");
      db.prepare("DELETE FROM training_progress WHERE video_id = ?").run(v.id);
      db.prepare("DELETE FROM training_videos WHERE id = ?").run(v.id);
      // A video uploaded for both groups shares its file: keep it while the other list still has it.
      if (!db.prepare("SELECT 1 FROM training_videos WHERE stored = ?").get(v.stored)) fs.promises.unlink(path.join(trainingDir, v.stored)).catch(() => {});
      return v;
    },
    trainingFile(id) { const v = row(id); return v && { file: path.join(trainingDir, v.stored), mime: v.mime, name: v.file_name, audience: v.audience }; },

    // ----- training (camp staff / tutors) -----
    trainingFor(audience, contactId) {
      const seen = new Set(db.prepare("SELECT video_id FROM training_progress WHERE contact_id = ?").all(contactId).map((r) => r.video_id));
      return listRows(audience).map((v) => ({ id: v.id, title: v.title, description: v.description, size: v.size, watched: seen.has(v.id) }));
    },
    // Marks one video watched. Returns { done: all of their videos watched }.
    markWatched(audience, contactId, id) {
      const v = row(id);
      if (!v || v.audience !== audience) throw httpError(404, "Video not found.");
      db.prepare("INSERT OR IGNORE INTO training_progress (contact_id, video_id, watched_at) VALUES (?, ?, ?)").run(contactId, v.id, now());
      const left = db.prepare(`SELECT COUNT(*) AS n FROM training_videos t WHERE t.audience = ? AND NOT EXISTS
        (SELECT 1 FROM training_progress p WHERE p.video_id = t.id AND p.contact_id = ?)`).get(audience, contactId).n;
      return { done: left === 0 };
    },

    // ----- intro videos -----
    async saveIntro(req, { contactId, email, fileName }) {
      const f = await receive(req, introDir, INTRO_MAX);
      const old = db.prepare("SELECT stored FROM intro_videos WHERE contact_id = ?").get(contactId);
      const name = clean(fileName, 120) || `intro-video.${VIDEO_TYPES[f.mime]}`;
      db.prepare(`INSERT INTO intro_videos (contact_id, email, file_name, stored, mime, size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (contact_id) DO UPDATE SET email = excluded.email, file_name = excluded.file_name, stored = excluded.stored, mime = excluded.mime, size = excluded.size, uploaded_at = excluded.uploaded_at`)
        .run(contactId, email, name, f.stored, f.mime, f.size, now());
      if (old) fs.promises.unlink(path.join(introDir, old.stored)).catch(() => {});
      return { file: path.join(introDir, f.stored), name, mime: f.mime, size: f.size };
    },
    intro(contactId) {
      const v = db.prepare("SELECT * FROM intro_videos WHERE contact_id = ?").get(contactId);
      return v && { file: path.join(introDir, v.stored), name: v.file_name, mime: v.mime, size: v.size, uploadedAt: v.uploaded_at, email: v.email };
    },
    intros() { return db.prepare("SELECT contact_id, email, file_name, size, uploaded_at FROM intro_videos ORDER BY uploaded_at DESC").all(); },
  };
}
