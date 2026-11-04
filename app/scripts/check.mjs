// npm run build: there's nothing to compile (plain Node ESM and browser modules), so the build
// checks every script parses and that the database migrations apply to an empty database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openDb } from "../lib/db.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["server.js", ...["lib", "public", "scripts", "tests"].flatMap((d) =>
  fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(d, f)) : [])];
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "pipe" }); }
  catch (err) { failed++; console.error(`✗ ${f}\n${err.stderr}`); }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blackmon-build-"));
try { openDb(path.join(tmp, "portal.db"), path.join(ROOT, "migrations")).close(); }
catch (err) { failed++; console.error(`✗ migrations: ${err.message}`); }
finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `Build failed: ${failed} problem(s).` : `Build OK: ${files.length} files parse, migrations apply.`);
process.exit(failed ? 1 : 0);
