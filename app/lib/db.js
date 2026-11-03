// SQLite database for data the portal owns itself (GHL stays the source for contacts).
// Uses Node's built-in node:sqlite, so there's nothing to install. Pending files in
// migrations/ run in name order at startup; each one runs once.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDb(file, migrationsDir) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");

  const applied = new Set(db.prepare("SELECT name FROM migrations").all().map((r) => r.name));
  const pending = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();
  for (const name of pending) {
    db.exec("BEGIN");
    try {
      db.exec(fs.readFileSync(path.join(migrationsDir, name), "utf8"));
      db.prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)").run(name, new Date().toISOString());
      db.exec("COMMIT");
      console.log(`  Database: applied migration ${name}`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${name} failed: ${err.message}`);
    }
  }
  return db;
}
