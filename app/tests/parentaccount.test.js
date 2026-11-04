// Parent accounts created from GHL (lib/parentaccount.js): who qualifies, and what ensure() changes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../lib/db.js";
import { parentEligibility, createParentAccounts, WC26_PAID } from "../lib/parentaccount.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const contact = (fields = {}, tags = []) => ({ id: "c1", email: "p@example.com", fields, tags });
const paid = [{ id: "o1", createdAt: "2026-10-01T00:00:00.000Z" }];

test("a paid contact with no role qualifies and isn't ready yet", () => {
  assert.deepEqual(parentEligibility(contact(), { paidOpps: paid }), { ok: true, ready: false, via: "paid" });
});
test("Access Granted = No set outside the portal doesn't block a paid parent", () => {
  assert.equal(parentEligibility(contact({ portal__role: "Parent", portal__access_granted: "No" }), { paidOpps: paid }).ready, false);
  assert.equal(parentEligibility(contact({ portal__role: "Parent", portal__access_granted: "No" }), { paidOpps: paid }).ok, true);
});
test("the portal-parent tag qualifies without an opportunity", () => {
  assert.equal(parentEligibility(contact({}, ["portal-parent"])).via, "tag");
});
test("removed parents, staff, tutors and unpaid contacts don't qualify", () => {
  assert.equal(parentEligibility(contact(), { paidOpps: paid, removed: true }).ok, false);
  assert.equal(parentEligibility(contact({ portal__role: "Camp Staff" }), { paidOpps: paid }).ok, false);
  assert.equal(parentEligibility(contact({ portal__role: "Tutor" }), { paidOpps: paid }).ok, false);
  assert.equal(parentEligibility(contact()).ok, false);
  assert.equal(parentEligibility(null).ok, false);
});
test("a working account is found as is", () => {
  assert.equal(parentEligibility(contact({ portal__role: "Parent", portal__access_granted: "Yes" }), { paidOpps: paid }).ready, true);
});

function setup(c, opps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blackmon-test-"));
  const db = openDb(path.join(dir, "portal.db"), path.join(ROOT, "migrations"));
  const writes = [];
  const store = {
    async searchOpportunities(q) { assert.equal(q.pipelineId, WC26_PAID.pipelineId); return opps; },
    async updateFields(id, values) { writes.push({ id, values }); Object.assign(c.fields, values); },
    async getContact() { return structuredClone(c); },
  };
  return { db, writes, accounts: createParentAccounts({ store, db, mayChange: () => true }), done: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test("ensure() sets Role = Parent and Access Granted = Yes, saves the portal record, and is safe to repeat", async () => {
  const c = contact({ portal__role: "Parent", portal__access_granted: "No" });
  const t = setup(c, paid);
  const first = await t.accounts.ensure(structuredClone(c));
  assert.equal(first.outcome, "created-from-ghl");
  assert.equal(first.opportunityId, "o1");
  assert.deepEqual(t.writes, [{ id: "c1", values: { portal__role: "Parent", portal__access_granted: "Yes" } }]);
  assert.equal(t.db.prepare("SELECT joined_at FROM parent_access WHERE contact_id = 'c1'").get().joined_at, "2026-10-01T00:00:00.000Z");
  const again = await t.accounts.ensure(structuredClone(c));
  assert.equal(again.outcome, "found");
  assert.equal(t.writes.length, 1);
  t.done();
});
test("ensure() leaves parents an admin removed alone", async () => {
  const c = contact();
  const t = setup(c, paid);
  t.db.prepare("INSERT INTO parent_access (contact_id, removed_at, updated_at) VALUES ('c1', '2026-11-01', '2026-11-01')").run();
  const r = await t.accounts.ensure(structuredClone(c));
  assert.equal(r.outcome, "not-eligible");
  assert.equal(t.writes.length, 0);
  t.done();
});
test("ensure() ignores opportunities the portal removed or that are Lost", async () => {
  const c = contact();
  const t = setup(c, [{ id: "gone", createdAt: "2026-10-01" }, { id: "lost", status: "lost", createdAt: "2026-10-01" }]);
  t.db.prepare("INSERT INTO removed_opportunities (opportunity_id, contact_id, how, removed_at) VALUES ('gone', 'c1', 'deleted', '2026-11-01')").run();
  assert.equal((await t.accounts.ensure(structuredClone(c))).outcome, "not-eligible");
  t.done();
});
