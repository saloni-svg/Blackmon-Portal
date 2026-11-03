// Meal plans: what each parent picks on the portal's Meal plan page. Saved in the portal's database
// only (migrations/011_meal_plans.sql), never sent to GHL. Parents who saved before that have their
// choices in GHL contact fields; those are still read (never written) until the parent saves again.

import { MEAL_FIELDS } from "./portal.js";

const KEYS = MEAL_FIELDS.flatMap((m) => (m.request ? [m.key, m.request] : [m.key]));
const blank = () => Object.fromEntries(KEYS.map((k) => [k, ""]));
// At least one meal picked.
export const mealChosen = (choices) => MEAL_FIELDS.some((m) => String(choices?.[m.key] ?? "").trim() !== "");

export function createMeals(db) {
  return {
    // contact: { id, fields? } -> { choices (every key, "" when empty), savedAt, source: "portal" | "ghl" | null }
    of(contact) {
      const r = db.prepare("SELECT choices, updated_at FROM meal_plans WHERE contact_id = ?").get(String(contact.id));
      if (r) return { choices: { ...blank(), ...JSON.parse(r.choices) }, savedAt: r.updated_at, source: "portal" };
      const old = { ...blank(), ...Object.fromEntries(KEYS.map((k) => [k, String(contact.fields?.[k] ?? "")])) };
      return mealChosen(old) ? { choices: old, savedAt: null, source: "ghl" } : { choices: blank(), savedAt: null, source: null };
    },
    save(contact, choices) {
      const clean = Object.fromEntries(KEYS.map((k) => [k, String(choices[k] ?? "")]));
      db.prepare(`INSERT INTO meal_plans (contact_id, email, choices, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (contact_id) DO UPDATE SET email = excluded.email, choices = excluded.choices, updated_at = excluded.updated_at`)
        .run(String(contact.id), contact.email || "", JSON.stringify(clean), new Date().toISOString());
    },
  };
}
