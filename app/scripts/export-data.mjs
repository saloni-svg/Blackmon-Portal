// Packs the portal's live data into one file for moving to the host's disk:
//   node scripts/export-data.mjs            -> blackmon-data.tgz (next to package.json)
// It holds a consistent copy of the database (VACUUM INTO, safe while the server runs) and the
// files: signed waivers, ID proofs, photos, announcement files, training / intro videos and the
// editable camp content. Ask Blackmon's model (data/models) is left out: the host downloads it again.
// Demo data (data/demo) is left out.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.resolve(ROOT, process.env.DATA_DIR || "data");
const OUT = path.join(ROOT, "blackmon-data.tgz");
const stage = fs.mkdtempSync(path.join(ROOT, ".export-"));
const FOLDERS = ["signed", "id-proofs", "photos", "announcements", "training", "intro-videos", "content"];

try {
  const db = new DatabaseSync(path.join(DATA, "portal.db"));
  db.exec(`VACUUM INTO '${path.join(stage, "portal.db").replace(/'/g, "''")}'`);
  db.close();
  for (const dir of FOLDERS) {
    const from = path.join(DATA, dir);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(stage, dir), { recursive: true });
  }
  // COPYFILE_DISABLE: macOS tar would otherwise add "._*" metadata files.
  execFileSync("tar", ["-czf", OUT, "-C", stage, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  const counts = FOLDERS.map((d) => [d, fs.existsSync(path.join(stage, d)) ? fs.readdirSync(path.join(stage, d)).length : 0]);
  console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB): portal.db + ${counts.map(([d, n]) => `${d} ${n}`).join(", ")}`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
