// Camp content the admin dashboard can edit: Camp info (camp.json -> winterCamp) and This week
// (camp.json -> weeks.<location>). The parent portal reads camp.json on every page load, and Ask
// Blackmon rebuilds its knowledge when the file changes, so a save shows for every parent at once.
//
// An edit has to keep the shape the portal expects: each value is checked against the current one
// (text stays text, lists stay lists of the same kind of item), and anything the editor doesn't send
// (the photo gallery, for example) is kept as it is. Saves are atomic, keep the previous file as
// camp.previous.json, and are refused if someone else saved in the meantime.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MAX_TEXT = 3000;
// Sections admins add themselves to the Camp info page (camp.json -> winterCamp.sections).
const SECTION = { title: "", subtitle: "", text: "", items: [""] };
const MAX_ITEMS = 60;
const httpError = (status, message, fields) => Object.assign(new Error(message), { httpStatus: status, fields });

// input reshaped like `like` (the current value). Missing parts keep the current value.
function shaped(like, input, where) {
  if (input === undefined) return like;
  if (typeof like === "string") {
    if (typeof input !== "string" && typeof input !== "number") throw httpError(400, `${where} should be text.`);
    const s = String(input).replace(/\r\n/g, "\n").trim();
    if (s.length > MAX_TEXT) throw httpError(400, `${where} is too long (keep it under ${MAX_TEXT} characters).`);
    return s;
  }
  if (typeof like === "boolean") return input === true;
  if (Array.isArray(like)) {
    if (!Array.isArray(input)) throw httpError(400, `${where} should be a list.`);
    if (input.length > MAX_ITEMS) throw httpError(400, `${where} has too many items.`);
    if (!like.length) return like; // nothing to compare against: keep it
    // Items look like the union of the current items (some have optional parts, like a note).
    const template = like.every((x) => typeof x === "string") ? "" : Object.assign({}, ...like.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, blank(v)]))));
    return input.map((item, i) => shaped(template, item ?? (typeof template === "string" ? "" : {}), `${where} item ${i + 1}`))
      .filter((item) => (typeof item === "string" ? item : Object.values(item).some((v) => v && (typeof v !== "object" || v.length))));
  }
  if (like && typeof like === "object") {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw httpError(400, `${where} is in the wrong format.`);
    return Object.fromEntries(Object.entries(like).map(([k, v]) => [k, shaped(v, input[k], `${where}: ${k}`)]));
  }
  return like;
}
const blank = (v) => (typeof v === "string" ? "" : typeof v === "boolean" ? false : Array.isArray(v) ? v : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)])) : v);

// file: the live camp.json (on the data disk); defaults to the app's content/camp.json.
export function createContent(root, file = path.join(root, "content", "camp.json")) {
  const read = () => fs.readFileSync(file, "utf8");
  const versionOf = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

  function load() {
    const text = read();
    const c = JSON.parse(text);
    return {
      version: versionOf(text),
      campInfo: c.winterCamp || null,
      weeks: c.weeks || {},
      locations: Object.fromEntries(Object.entries(c.locations || {}).map(([k, l]) => [k, l.name])),
    };
  }

  // change(content) edits the parsed camp.json in place. Returns the new load().
  function save(version, change) {
    const text = read();
    if (version !== versionOf(text)) throw httpError(409, "Someone else saved changes to this page while you were editing. Reload to see them, then make your change again.");
    const c = JSON.parse(text);
    change(c);
    const next = JSON.stringify(c, null, 2) + "\n";
    fs.writeFileSync(path.join(path.dirname(file), "camp.previous.json"), text);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, next);
    fs.renameSync(tmp, file);
    return load();
  }

  return {
    load,
    saveCampInfo(version, input) {
      return save(version, (c) => {
        if (!c.winterCamp) throw httpError(404, "There's no camp info to edit.");
        // A list's items are checked against its current items, so new sections need a template.
        const next = shaped({ ...c.winterCamp, sections: [SECTION, ...(c.winterCamp.sections || [])] }, input, "Camp info");
        if (input?.sections === undefined) next.sections = c.winterCamp.sections || [];
        next.sections = next.sections.filter((x) => x.title || x.text || x.items.length);
        if (next.sections.some((x) => !x.title)) throw httpError(400, "Each new section needs a title.");
        if (!next.title) throw httpError(400, "The camp needs a title.", { title: "Add a title." });
        c.winterCamp = next;
      });
    },
    saveWeek(version, location, input) {
      return save(version, (c) => {
        const current = c.weeks?.[location];
        if (!current) throw httpError(404, "Unknown camp location.");
        c.weeks[location] = shaped(current, input, "This week");
      });
    },
  };
}
