// Camp staff knowledge assessment. The questions and answer key live in content/assessment.json;
// only the questions go to the browser. Answers are graded here: 1 point per question, and a
// select-all question scores only when exactly the right options are marked (no partial credit).
// Pass mark: passPercent (80%). Every attempt is kept, so admins see retakes too.

import fs from "node:fs";

const now = () => new Date().toISOString();
const httpError = (status, message) => Object.assign(new Error(message), { httpStatus: status });

export function createAssessment(db, file) {
  const load = () => JSON.parse(fs.readFileSync(file, "utf8"));
  // An attempt as staff and admins see it: the score, and for each question what they picked and
  // whether it was right; missed questions also carry the answer key's feedback and review scene.
  const view = (r, key = load()) => {
    const byN = new Map(key.questions.map((q) => [q.n, q]));
    return {
      id: r.id, score: r.score, total: r.total, percent: r.percent, passed: !!r.passed, submittedAt: r.submitted_at,
      results: JSON.parse(r.answers).map((a) => ({ ...a, ...(a.correct ? {} : { why: byN.get(a.n)?.why || "", review: byN.get(a.n)?.review || "" }) })),
    };
  };

  return {
    // The questions without the answer key.
    questions() {
      const key = load();
      return { title: key.title, passPercent: key.passPercent, note: key.note,
        questions: key.questions.map(({ n, type, prompt, options }) => ({ n, type, prompt, options })) };
    },
    // answers: { "1": "B", "6": ["A", "B", "D"], "9": "False", ... }. Every question must be answered.
    submit({ contactId, email, name }, answers) {
      const key = load();
      const results = key.questions.map((q) => {
        const raw = answers?.[q.n] ?? answers?.[String(q.n)];
        const picked = [...new Set((Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw]).map(String))]
          .filter((k) => q.options.some((o) => o.key === k)).sort();
        if (!picked.length || (q.type !== "multi" && picked.length > 1)) throw httpError(400, `Please answer question ${q.n}.`);
        const correct = picked.length === q.answer.length && [...q.answer].sort().every((k, i) => k === picked[i]);
        return { n: q.n, picked, correct };
      });
      const score = results.filter((r) => r.correct).length, total = results.length;
      const percent = Math.round((score / total) * 100), passed = percent >= key.passPercent;
      const r = db.prepare(`INSERT INTO assessment_attempts (contact_id, email, name, answers, score, total, percent, passed, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(contactId, email, name || "", JSON.stringify(results), score, total, percent, passed ? 1 : 0, now());
      return view(db.prepare("SELECT * FROM assessment_attempts WHERE id = ?").get(r.lastInsertRowid), key);
    },
    // Their attempts, newest first.
    attempts(contactId) {
      const key = load();
      return db.prepare("SELECT * FROM assessment_attempts WHERE contact_id = ? ORDER BY id DESC").all(contactId).map((r) => view(r, key));
    },
    passed(contactId) { return !!db.prepare("SELECT 1 FROM assessment_attempts WHERE contact_id = ? AND passed = 1").get(contactId); },
    // Every attempt by email (lowercased), newest first, for the admin pages.
    byEmail() {
      const key = load(), out = new Map();
      for (const r of db.prepare("SELECT * FROM assessment_attempts ORDER BY id DESC").all()) {
        const k = r.email.toLowerCase();
        if (!out.has(k)) out.set(k, { name: r.name, email: r.email, attempts: [] });
        out.get(k).attempts.push(view(r, key));
      }
      return out;
    },
  };
}
