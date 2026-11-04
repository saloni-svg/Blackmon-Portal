// A parent's portal account is their GHL contact with Portal - Role = Parent and Portal - Access
// Granted not "No", plus their portal record (parent_access: when they joined, invites, removal).
// Normally the invite sets this up. When a paid parent signs in (or an admin runs "Sync portal
// accounts from GHL") and it isn't set up, it's created from GHL here: any contact with a Winter
// Camp 2026 Paid (won) opportunity, or the portal-parent tag, qualifies, unless an admin removed them
// from camp in the portal or they're camp staff / a tutor.

import { saveJoinedAt } from "./announcements.js";

export const WC26_PAID = { pipelineId: "eXOcuRrWabqKkb20C3KC", stageId: "ef44a5c4-5c0c-47ba-a6c7-e677aca1f0bf" };
export const PORTAL_PARENT_TAG = "portal-parent";
const STAFF_ROLES = new Set(["Camp Staff", "Tutor"]);

// Whether this contact may have a parent account. paidOpps: its Winter Camp 2026 Paid (won)
// opportunities (live, not removed); removed: an admin removed them from camp in the portal.
// { ok, ready: the account already works, via: "paid" | "tag" } or { ok: false, why }.
export function parentEligibility(contact, { paidOpps = [], removed = false } = {}) {
  if (!contact) return { ok: false, why: "no GHL contact with this email" };
  if (removed) return { ok: false, why: "removed from Winter Camp 2026 by an admin" };
  const role = contact.fields?.portal__role;
  if (STAFF_ROLES.has(role)) return { ok: false, why: `Portal - Role is ${role}` };
  const paid = paidOpps.length > 0, tagged = (contact.tags || []).includes(PORTAL_PARENT_TAG);
  if (!paid && !tagged) return { ok: false, why: "no Winter Camp 2026 Paid (won) opportunity and no portal-parent tag" };
  return { ok: true, ready: role === "Parent" && contact.fields?.portal__access_granted !== "No", via: paid ? "paid" : "tag" };
}

// mayChange(contact): whether the portal may change this contact in GHL (test mode: portal-test only).
export function createParentAccounts({ store, db, mayChange }) {
  const isRemoved = (contactId) => !!db.prepare("SELECT 1 FROM parent_access WHERE contact_id = ? AND removed_at IS NOT NULL").get(contactId);
  async function paidOppsOf(contactId) {
    const gone = new Set(db.prepare("SELECT opportunity_id FROM removed_opportunities WHERE contact_id = ?").all(contactId).map((r) => r.opportunity_id));
    return (await store.searchOpportunities({ ...WC26_PAID, contactId })).filter((o) => !gone.has(o.id) && !/^(lost|abandoned)$/i.test(o.status || ""));
  }

  // Makes sure a qualifying contact has a working parent account. Returns { outcome, why, contact,
  // opportunityId }: "found" (it already worked), "created-from-ghl" (Role = Parent and Access
  // Granted = Yes set now, portal record saved) or "not-eligible" (why says so).
  async function ensure(contact) {
    const paidOpps = contact ? await paidOppsOf(contact.id) : [];
    const e = parentEligibility(contact, { paidOpps, removed: !!contact && isRemoved(contact.id) });
    if (!e.ok) return { outcome: "not-eligible", why: e.why, contact };
    const opportunityId = paidOpps[0]?.id || null;
    if (!e.ready && !mayChange(contact)) return { outcome: "not-eligible", why: "test mode: only contacts tagged portal-test are changed", contact };
    saveJoinedAt(db, contact.id, paidOpps.map((o) => o.createdAt)); // the portal record (parent_access)
    if (e.ready) return { outcome: "found", contact, opportunityId };
    const before = `Role ${contact.fields?.portal__role || "empty"}, Access Granted ${contact.fields?.portal__access_granted || "empty"}`;
    await store.updateFields(contact.id, { portal__role: "Parent", portal__access_granted: "Yes" });
    return { outcome: "created-from-ghl", why: `${e.via === "paid" ? `Paid (won) opportunity ${opportunityId}` : "portal-parent tag"}; was ${before}`,
      contact: await store.getContact(contact.id), opportunityId };
  }

  return { ensure, isRemoved };
}
