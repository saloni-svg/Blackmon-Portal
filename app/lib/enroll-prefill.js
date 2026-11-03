// Pre-fill for the GHL "Portal - Winter Camp 2026 Enrollment Form" (embedded on #/enroll). GHL fills a
// field from the iframe's URL when the query parameter is the field's query key: the field's name in
// lower case with spaces as "_" ("WC26 - Child 1 Full Name" -> "wc26_-_child_1_full_name").
//
// Order of precedence: what comes from payment (package, session, lunch, extended care, transportation)
// is always the registration's; everything else is the parent's own saved answer (contact wc26__*
// fields) first, then what GHL has from checkout (contact, Winter Camp 2026 opportunity).

const OPP = {
  child: "pUYmi0vYThlJoeqi8ucX", age: "ifkdoMOs26DdZS1ZCuda", lunch: "6TXpnRke5ZmEqe3r9Rzb", campPackage: "h1rnZpVWWVMlFzrdkMu3",
  tier: "jFha8u0CpPgP4GKyyffL", extendedCare: "4A81muplpw733oLYkF5X", transport: "JAEUtXidfYfzoPT9ElE3",
  location: "coYVcHIc7JCJTsuxbAgo", phone: "AOdFXJqh5maLJbccrHfS",
};
// Consents and the signature are always given fresh, never pre-filled.
const NEVER = new Set(["wc26__parent_signature", "wc26__signature_date", "wc26__camp_policies_agreement", "wc26__liability_release_agreement"]);
// The form's options (GHL form 2Txp1V54yk7ysmdQadR3).
const OPTION = {
  fullCamp: "Full camp (Dec 21 – Jan 1)", lunchYes: "Lunch included", lunchNo: "Will pack lunch",
  early: "2 hours before camp (7:00 AM)", late: "2 hours after camp (6:00 PM)", none: "None",
  locations: [[/little\s*elm/i, "Little Elm – 520 Lobo Lane"]],
};
const queryKey = (name) => String(name).trim().toLowerCase().replace(/\s+/g, "_");
const text = (v) => String(v ?? "").trim();
const field = (opp, id) => text(opp?.customFields?.find((f) => f.id === id)?.value);

// raw: GET /contacts/{id} contact; contactDefs: fieldDefinitions("contact"); opp: their Winter Camp
// 2026 opportunity (or null); portalLocation: Portal - Location ("Little Elm"); submitted: their latest
// form submission's answers by field key (lib/enrollform.js), used where the contact itself is empty
// (e.g. GHL saved the submission on a second contact with the same email).
export function enrollPrefill({ raw, contactDefs, opp, portalLocation = "", submitted = {} }) {
  const query = {};
  const put = (key, value) => { if (text(value)) query[key] = text(value); };
  const saved = new Map(); // wc26__ key -> the parent's saved answer
  const defById = new Map(contactDefs.map((d) => [d.id, d]));
  for (const f of raw?.customFields || []) {
    const d = defById.get(f.id);
    const v = Array.isArray(f.value) ? f.value.join(", ") : text(f.value);
    if (d && /^wc26__/.test(d.key) && !NEVER.has(d.key) && v) saved.set(d.key, { q: queryKey(d.name), v });
  }
  const defByKey = new Map(contactDefs.map((d) => [d.key, d]));
  for (const [key, v] of Object.entries(submitted)) {
    const d = defByKey.get(key);
    if (d && /^wc26__/.test(key) && !NEVER.has(key) && !saved.has(key) && text(v)) saved.set(key, { q: queryKey(d.name), v: text(v) });
  }
  const savedOr = (key, fallback) => saved.get(key)?.v || fallback;
  const qOf = (key, name) => saved.get(key)?.q || queryKey(name);

  // Parent / contact.
  put("first_name", raw?.firstName || submitted.first_name); put("last_name", raw?.lastName || submitted.last_name); put("email", raw?.email);
  // GHL's phone box needs the country code ("(470) 261-1623" alone is read as a non-US number).
  const phone = text(raw?.phone) || field(opp, OPP.phone) || text(submitted.phone), digits = phone.replace(/\D/g, "");
  put("phone", phone.startsWith("+") ? phone : digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === "1" ? `+${digits}` : phone);
  put("address", raw?.address1 || submitted.address); put("city", raw?.city || submitted.city);
  put("state", raw?.state || submitted.state); put("postal_code", raw?.postalCode || submitted.postal_code);
  for (const [, s] of saved) put(s.q, s.v);

  // Child and camp location (the parent can change these).
  put(qOf("wc26__child_1_full_name", "WC26 - Child 1 Full Name"), savedOr("wc26__child_1_full_name", field(opp, OPP.child)));
  const where = field(opp, OPP.location) || text(portalLocation);
  const location = OPTION.locations.find(([re]) => re.test(where))?.[1] || where;
  put(qOf("wc26__camp_location", "WC26 - Camp Location"), savedOr("wc26__camp_location", location));

  // From the registration (payment): always these values; shown read-only on the page.
  const pkgText = field(opp, OPP.campPackage); // "Standard - Weekly (5 days) - $250"
  const tier = (/\b(Premium|Standard|Basic)\b/i.exec(field(opp, OPP.tier) || pkgText)?.[1] || "").replace(/^./, (c) => c.toUpperCase());
  const weekly = /weekly/i.test(pkgText), full = /full\s*camp/i.test(pkgText);
  const lunch = /^(yes|y|true)$/i.test(field(opp, OPP.lunch)) ? OPTION.lunchYes : /^(no|n|false)$/i.test(field(opp, OPP.lunch)) ? OPTION.lunchNo : "";
  const care = field(opp, OPP.extendedCare), transport = field(opp, OPP.transport);
  const paid = !!(pkgText || tier); // a registration to take these from
  const registration = [];
  const fixed = (label, key, name, value, shown = value) => {
    if (!value) return;
    put(qOf(key, name), value);
    registration.push({ label, value: shown });
  };
  fixed("Package", "wc26__package", "WC26 - Package", tier);
  if (full) fixed("Session", "wc26__session", "WC26 - Session", OPTION.fullCamp);
  else if (weekly) registration.push({ label: "Session", value: "Weekly (5 days): choose your week in the form" });
  fixed("Lunch", "wc26__lunch", "WC26 - Lunch", lunch);
  if (paid) {
    fixed("Early drop-off", "wc26__early_dropoff", "WC26 - Early Drop-off", /early/i.test(care) ? OPTION.early : OPTION.none, /early/i.test(care) ? "Yes, 7:00 AM" : "No");
    fixed("Late pick-up", "wc26__late_pickup", "WC26 - Late Pick-up", /late/i.test(care) ? OPTION.late : OPTION.none, /late/i.test(care) ? "Yes, until 6:00 PM" : "No");
    fixed("Transportation needed", "wc26__transportation_needed", "WC26 - Transportation Needed", transport ? "Yes" : "No", transport ? `Yes${/\d+\s*days?/i.test(transport) ? ` (${/(\d+\s*days?)/i.exec(transport)[1]})` : ""}` : "No");
  }
  return { query, registration, ageHint: field(opp, OPP.age), filled: Object.keys(query).length };
}
