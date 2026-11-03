// Enrollment form check: the child's name and age must match the parent's Winter Camp registration.
// The registered values come from the parent's most recently updated opportunity in the paid
// pipelines (opportunity fields Child name / Child age), else from the contact's child fields.
// Only read from GHL; the values never leave the server (the reply only says which field is wrong).

import { PAID_PIPELINES, CHILD_CONTACT_KEYS, oppField } from "./documents.js";

// "John  Smith " = "john smith": case, extra and outer spaces don't count.
export const sameName = (a, b) => norm(a) === norm(b);
const norm = (s) => String(s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
// "13", 13 or "13 years" -> 13; anything without a number -> null.
export const ageOf = (v) => { const m = /\d+/.exec(String(v ?? "")); return m ? Number(m[0]) : null; };

export function createChildCheck({ store }) {
  // { name, age, source } from GHL; name "" / age null when GHL has none. Throws if GHL can't be reached.
  async function registered(contact) {
    const [defs, opps] = await Promise.all([
      store.fieldDefinitions("opportunity"),
      Promise.all(PAID_PIPELINES.map((pipelineId) => store.searchOpportunities({ pipelineId, contactId: contact.id }))).then((l) => l.flat()),
    ]);
    const opp = opps.sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0))[0] || null;
    const oppValue = (key) => oppField(opp, defs.find((d) => d.key === key)?.id);
    const fromContact = (keys) => keys.map((k) => contact.fields?.[k]).find((v) => String(v ?? "").trim() !== "");
    const oppName = String(oppValue("child_name") ?? "").trim(), oppAge = ageOf(oppValue("child_age"));
    return {
      name: oppName || String(fromContact(CHILD_CONTACT_KEYS.name) ?? "").trim(),
      age: oppAge ?? ageOf(fromContact(CHILD_CONTACT_KEYS.age)),
      opportunityId: opp?.id || null,
    };
  }

  // { fields: { child_name?: "mismatch", childs_age?: "mismatch" }, unchecked: [what GHL lacks] }
  function compare(reg, name, age) {
    const fields = {}, unchecked = [];
    if (!reg.name) unchecked.push("child name");
    else if (!sameName(reg.name, name)) fields.child_name = "mismatch";
    if (reg.age === null) unchecked.push("child age");
    else if (reg.age !== ageOf(age)) fields.childs_age = "mismatch";
    return { fields, unchecked };
  }

  return { registered, compare };
}
