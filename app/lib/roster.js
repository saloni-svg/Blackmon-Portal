// The admin Roster (Camp Enrollment Forms Build Spec, section 4): one row per child, from the answers
// the GHL enrollment form saves on the parent's contact (contact.wc26__* fields: Child 1 and Child 2
// are two rows), plus their Winter Camp 2026 opportunity (the Parents row) where the form is blank.

// The spec's 15 columns, in its order, with its exact headers (also the CSV headers).
export const ROSTER_COLUMNS = [
  ["child", "Child name"], ["ageDob", "Age · date of birth"], ["campSessionLocation", "Camp / session / location"],
  ["parents", "Parent/guardian name(s)"], ["phoneEmail", "Parent phone · email"], ["emergency", "Emergency contact(s) + phone"],
  ["allergies", "Allergies"], ["medical", "Medical notes / medications"], ["attendingWith", "Siblings · friends attending with"],
  ["early", "Early drop-off"], ["late", "Late pick-up"], ["transport", "Transportation (direction + location)"],
  ["pickups", "Authorized pick-ups"], ["lunch", "Lunch / meal plan"], ["photo", "Photo release · signed date"],
];

// Quick lists: which children, and which columns show on screen (the CSV always has all 15).
const blank = (v) => !String(v ?? "").trim() || /^(none|n\/a|na|no|nil|-)\.?$/i.test(String(v).trim());
export const ROSTER_LISTS = {
  all: { label: "Full roster", keep: () => true, columns: ROSTER_COLUMNS.map(([k]) => k) },
  allergies: { label: "Allergy list", keep: (r) => !blank(r.allergiesRaw) || !blank(r.medicalRaw),
    columns: ["child", "ageDob", "campSessionLocation", "allergies", "medical", "lunch", "parents", "phoneEmail", "emergency"] },
  care: { label: "Early drop-off / late pick-up list", keep: (r) => !blank(r.earlyRaw) || !blank(r.lateRaw),
    columns: ["child", "ageDob", "campSessionLocation", "early", "late", "parents", "phoneEmail", "pickups"] },
  transport: { label: "Transportation list", keep: (r) => r.transportNeeded,
    columns: ["child", "ageDob", "campSessionLocation", "transport", "parents", "phoneEmail", "pickups"] },
};

// The camp tag on a contact ("winter 2026" -> "Winter 2026").
export const CAMP_TAG = /^(winter|summer|fall|spring)\s+(20\d\d)$/i;
const campTags = (tags) => (tags || []).map((t) => CAMP_TAG.exec(String(t).trim())).filter(Boolean).map((m) => `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`);

const t = (v) => String(v ?? "").trim();
const join = (sep, ...parts) => parts.map(t).filter(Boolean).join(sep);
const person = (name, rel, phone) => (t(name) ? join(" ", t(name), t(rel) && `(${t(rel)})`, t(phone)) : "");
// GHL date fields can come back as a timestamp; lists (checkboxes) as arrays.
const show = (v) => {
  if (Array.isArray(v)) return v.map(t).filter(Boolean).join(", ");
  if (typeof v === "number" || /^\d{11,13}$/.test(t(v))) return new Date(Number(v)).toISOString().slice(0, 10);
  return t(v);
};
const fromRegistration = (v) => (v ? `${v} (from registration)` : "");

// Which weeks a session covers: "Full camp (Dec 21 – Jan 1)" is both weeks.
export function sessionWeeks(session) {
  if (/full\s*camp/i.test(session)) return ["week1", "week2"];
  const m = /week\s*(\d)/i.exec(session);
  return m ? [`week${m[1]}`] : [];
}

// p: a Parents row (lib/admin.js, from the Winter Camp 2026 opportunity); c: their GHL contact
// ({ firstName, lastName, email, phone, tags, fields } with every custom field by key).
export function familyRows(p, c) {
  const f = (k) => show(c?.fields?.[`wc26__${k}`]);
  const camps = campTags(c?.tags);
  const session = f("session") || (p.campPackage ? fromRegistration(/(full camp|weekly)[^-]*/i.exec(p.campPackage)?.[0]?.trim() || "") : "");
  const location = f("camp_location") || t(p.location);
  const parentName = join(" ", c?.firstName, c?.lastName) || t(p.name);
  const careFromOpp = t(p.extendedCare);
  const early = f("early_dropoff") || (/early/i.test(careFromOpp) ? fromRegistration("Early care, 7:00 AM") : "");
  const late = f("late_pickup") || (/late/i.test(careFromOpp) ? fromRegistration("Late care, until 6:00 PM") : "");
  const transportForm = f("transportation_needed");
  const transportNeeded = /^yes/i.test(transportForm) || (!transportForm && !!t(p.transport));
  const stop = /^other/i.test(f("transportation_pickup_location")) ? f("transportation_other_address") : f("transportation_pickup_location");
  const transport = /^yes/i.test(transportForm) ? join(" · ", f("transportation_direction") || "Yes", stop)
    : transportForm ? transportForm : t(p.transport) ? fromRegistration(t(p.transport)) : "";
  const lunchChoice = f("lunch") || (p.lunchRaw ? fromRegistration(/^(yes|y|true)$/i.test(p.lunchRaw) ? "Lunch included" : "Will pack lunch") : "");
  const children = [1, 2].map((n) => ({
    n, name: f(`child_${n}_full_name`) || (n === 1 ? t(p.childName) : ""), age: f(`child_${n}_age`) || (n === 1 ? t(p.childAge) : ""),
    dob: f(`child_${n}_date_of_birth`), allergies: f(`child_${n}_allergies`), medical: f(`child_${n}_medical_conditions`),
    medications: f(`child_${n}_medications`), needs: f(`child_${n}_special_needs`), dietary: f(`child_${n}_dietary_restrictions`),
  })).filter((k) => k.name || k.n === 1);
  const more = f("additional_children_3");
  return children.map((k) => {
    const siblings = [...children.filter((x) => x !== k).map((x) => x.name), more && `more: ${more}`].filter(Boolean).join(", ");
    return {
      contactId: p.contactId, camps, location, sessionWeeks: sessionWeeks(session),
      child: k.name || "(child name not given)",
      ageDob: join(" · ", k.age && `Age ${k.age}`, k.dob),
      campSessionLocation: join(" / ", camps.join(", ") || "No camp tag", session, location),
      parents: join("; ", person(parentName, f("relationship_to_child")), person(f("parent_2_name"), "", f("parent_2_phone"))),
      phoneEmail: join(" · ", c?.phone || p.phone, c?.email || p.email),
      emergency: join("; ", person(f("emergency_contact_1_name"), f("ec1_relationship_dropdown") || f("emergency_contact_1_relationship"), f("emergency_contact_1_phone")),
        person(f("emergency_contact_2_name"), f("ec2_relationship_dropdown") || f("emergency_contact_2_relationship"), f("emergency_contact_2_phone"))),
      allergies: k.allergies, allergiesRaw: k.allergies,
      medical: join(" · ", k.medical && `Conditions: ${k.medical}`, k.medications && `Medications: ${k.medications}`, k.needs && `Special needs: ${k.needs}`),
      medicalRaw: [k.medical, k.medications, k.needs].find((v) => !blank(v)) || "",
      attendingWith: join(" · ", siblings && `Siblings: ${siblings}`, f("friends_attending") && `Friends: ${f("friends_attending")}`, f("siblings_attending") && !siblings ? `Siblings: ${f("siblings_attending")}` : ""),
      early, late, earlyRaw: /^none$/i.test(early) ? "" : early, lateRaw: /^none$/i.test(late) ? "" : late,
      transport, transportNeeded,
      pickups: join("; ", person(f("authorized_pickup_1_name"), f("pickup_1_relationship_dropdown") || f("authorized_pickup_1_relationship"), f("authorized_pickup_1_phone")),
        f("other_authorized_pickup_adults") && `Also: ${f("other_authorized_pickup_adults")}`),
      lunch: join(" · ", lunchChoice, p.sports && !/pending/i.test(p.sports) ? `Sports: ${p.sports}` : "", k.dietary && `Dietary: ${k.dietary}`),
      photo: join(" · ", f("photo_release") ? (/^yes/i.test(f("photo_release")) ? "Yes" : "No") : "", f("signature_date") && `Signed ${f("signature_date")}`),
      formSubmitted: !!f("child_1_full_name"),
    };
  });
}
