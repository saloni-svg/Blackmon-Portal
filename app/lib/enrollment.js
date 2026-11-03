// Camp enrollment form (Camp Enrollment Forms Build Spec, Oct 2026): settings per camp
// (content/enrollment.json), checking a submitted form, saving it (migrations/012_enrollments.sql)
// and the admin roster (one row per child).

import fs from "node:fs";
import path from "node:path";

const LUNCH = ["Lunch included", "Will pack lunch"];
const YES_NO = ["Yes", "No"];
const DIRECTIONS = ["To camp", "From camp", "Both"];
export const OTHER_STOP = "Other – type address";

// The current camp's settings, plus the lists every camp shares. Read on every call, so edits to
// content/enrollment.json apply without a restart.
export function enrollmentSettings(root) {
  const all = JSON.parse(fs.readFileSync(path.join(root, "content", "enrollment.json"), "utf8"));
  const camp = all.camps[all.current];
  return { key: all.current, ...camp, policiesUrl: all.policiesUrl, grades: all.grades, shirtSizes: all.shirtSizes, packages: all.packages,
    lunchOptions: LUNCH, directions: DIRECTIONS, otherStop: OTHER_STOP };
}

const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const long = (v) => text(v, 2000);
const digits = (p) => String(p || "").replace(/\D/g, "");
const phoneOk = (p) => digits(p).length >= 10;

// Age on a date from a YYYY-MM-DD date of birth.
export function ageOn(dob, on = new Date()) {
  const [y, m, d] = String(dob).split("-").map(Number);
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age--;
  return age;
}

// body (the form, as the page sends it) -> { data, errors: { "path.to.field": message } }.
// Field paths match the form's input names (e.g. "children.1.allergies").
export function checkEnrollment(body, s) {
  const errors = {};
  const need = (path, value, message) => { if (!value) errors[path] = message; return value; };
  const pick = (path, value, options, message) => { if (!options.includes(value)) errors[path] = message; return options.includes(value) ? value : ""; };
  const b = body || {}, p = b.parent || {};

  const parent = {
    firstName: need("parent.firstName", text(p.firstName, 100), "Enter your first name."),
    lastName: need("parent.lastName", text(p.lastName, 100), "Enter your last name."),
    relationship: need("parent.relationship", text(p.relationship, 60), "Enter your relationship to the child(ren)."),
    phone: text(p.phone, 30),
    street: need("parent.street", text(p.street), "Enter your street address."),
    city: need("parent.city", text(p.city, 80), "Enter your city."),
    state: need("parent.state", text(p.state, 40), "Enter your state."),
    zip: need("parent.zip", text(p.zip, 12), "Enter your ZIP code."),
    guardian2Name: text(p.guardian2Name, 100),
    guardian2Phone: text(p.guardian2Phone, 30),
  };
  if (!phoneOk(parent.phone)) errors["parent.phone"] = "Enter a phone number with area code.";
  if (parent.guardian2Phone && !phoneOk(parent.guardian2Phone)) errors["parent.guardian2Phone"] = "Enter a phone number with area code.";
  if (parent.guardian2Phone && !parent.guardian2Name) errors["parent.guardian2Name"] = "Enter the second parent or guardian's name.";

  // Emergency contact 1 is required; 2 only when any of its fields is filled in.
  const emergency = [0, 1].map((i) => {
    const e = (b.emergency || [])[i] || {};
    const row = { name: text(e.name, 100), relationship: text(e.relationship, 60), phone: text(e.phone, 30) };
    if (i === 0 || row.name || row.relationship || row.phone) {
      need(`emergency.${i}.name`, row.name, "Enter a name.");
      need(`emergency.${i}.relationship`, row.relationship, "Enter their relationship to the child.");
      if (!phoneOk(row.phone)) errors[`emergency.${i}.phone`] = "Enter a phone number with area code.";
    }
    return row;
  }).filter((e, i) => i === 0 || e.name || e.phone);

  const kids = Array.isArray(b.children) ? b.children.slice(0, 8) : [];
  if (!kids.length) errors.children = "Add at least one child.";
  const today = new Date().toISOString().slice(0, 10);
  const children = kids.map((c, i) => {
    const at = (f) => `children.${i}.${f}`;
    const k = {
      name: need(at("name"), text(c.name, 100), "Enter the child's full name."),
      dob: text(c.dob, 10),
      age: text(c.age, 3),
      grade: pick(at("grade"), text(c.grade, 20), s.grades, "Choose a grade."),
      shirt: pick(at("shirt"), text(c.shirt, 20), s.shirtSizes, "Choose a T-shirt size."),
      allergies: need(at("allergies"), long(c.allergies), "List any allergies, or write “None”."),
      medical: need(at("medical"), long(c.medical), "List any medical conditions, or write “None”."),
      medications: long(c.medications),
      specialNeeds: long(c.specialNeeds),
      location: pick(at("location"), text(c.location, 60), s.locations.map((l) => l.value), "Choose a camp location."),
      sessions: (Array.isArray(c.sessions) ? c.sessions : []).filter((x) => s.sessions.some((y) => y.id === x)),
      package: pick(at("package"), text(c.package, 30), s.packages, "Choose a package."),
      lunch: pick(at("lunch"), text(c.lunch, 30), LUNCH, "Choose lunch included or will pack lunch."),
      dietary: "",
      early: pick(at("early"), text(c.early, 60), s.earlyDropoff, "Choose an early drop-off option."),
      late: pick(at("late"), text(c.late, 60), s.latePickup, "Choose a late pick-up option."),
      transport: pick(at("transport"), text(c.transport, 3), YES_NO, "Choose yes or no."),
      transportDir: "", transportStop: "", transportAddress: "",
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k.dob) || k.dob > today || isNaN(Date.parse(k.dob))) errors[at("dob")] = "Enter the date of birth.";
    const [lo, hi] = s.ages;
    if (!/^\d{1,2}$/.test(k.age) || +k.age < lo || +k.age > hi) errors[at("age")] = `Enter an age from ${lo} to ${hi}.`;
    if (s.sessions.length && !k.sessions.length) errors[at("sessions")] = "Choose at least one week.";
    if (k.lunch === "Lunch included") k.dietary = long(c.dietary);
    if (k.transport === "Yes") {
      k.transportDir = pick(at("transportDir"), text(c.transportDir, 20), DIRECTIONS, "Choose to camp, from camp, or both.");
      k.transportStop = pick(at("transportStop"), text(c.transportStop, 120), [...s.transportStops, OTHER_STOP], "Choose a pick-up / drop-off location.");
      if (k.transportStop === OTHER_STOP) k.transportAddress = need(at("transportAddress"), text(c.transportAddress), "Type the address.");
    }
    return k;
  });

  const pickups = (Array.isArray(b.pickups) ? b.pickups.slice(0, 10) : []).map((x) => ({ name: text(x.name, 100), relationship: text(x.relationship, 60), phone: text(x.phone, 30) }))
    .filter((x, i) => i === 0 || x.name || x.relationship || x.phone);
  if (!pickups.length) pickups.push({ name: "", relationship: "", phone: "" });
  pickups.forEach((x, i) => {
    need(`pickups.${i}.name`, x.name, "Enter a name.");
    need(`pickups.${i}.relationship`, x.relationship, "Enter their relationship to the child.");
    if (!phoneOk(x.phone)) errors[`pickups.${i}.phone`] = "Enter a phone number with area code.";
  });

  const data = {
    parent, emergency, children, friends: text(b.friends, 500), pickups,
    photoRelease: pick("photoRelease", text(b.photoRelease, 3), YES_NO, "Choose yes or no."),
    policies: b.policies === true || b.policies === "on",
    signature: need("signature", text(b.signature, 100), "Type your full name to sign."),
    signedOn: text(b.signedOn, 10),
  };
  if (!data.policies) errors.policies = "Please confirm you've read the camp policies.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.signedOn) || isNaN(Date.parse(data.signedOn))) errors.signedOn = "Enter today's date.";
  return { data, errors };
}

export function createEnrollments(db) {
  const view = (r) => r && { ...JSON.parse(r.data), contactId: r.contact_id, camp: r.camp, email: r.email, createdAt: r.created_at, updatedAt: r.updated_at };
  return {
    get(contactId, camp) { return view(db.prepare("SELECT * FROM enrollments WHERE contact_id = ? AND camp = ?").get(String(contactId), camp)); },
    save(contact, camp, data, ip) {
      const t = new Date().toISOString();
      db.prepare(`INSERT INTO enrollments (contact_id, camp, email, data, signed_name, signed_on, ip, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (contact_id, camp) DO UPDATE SET email = excluded.email, data = excluded.data, signed_name = excluded.signed_name,
          signed_on = excluded.signed_on, ip = excluded.ip, updated_at = excluded.updated_at`)
        .run(String(contact.id), camp, contact.email || "", JSON.stringify(data), data.signature, data.signedOn, ip || "", t, t);
    },
    camps() { return db.prepare("SELECT camp, COUNT(*) AS n FROM enrollments GROUP BY camp ORDER BY MAX(updated_at) DESC").all(); },
    list(camp) { return db.prepare(`SELECT * FROM enrollments ${camp ? "WHERE camp = ?" : ""} ORDER BY updated_at DESC`).all(...(camp ? [camp] : [])).map(view); },
  };
}

// ----- admin roster: one row per child (spec section 4) -----
const person = (x) => [x.name, x.relationship && `(${x.relationship})`, x.phone].filter(Boolean).join(" ");
export const ROSTER_COLUMNS = [
  ["child", "Child name"], ["age", "Age"], ["dob", "Date of birth"], ["grade", "Grade"], ["shirt", "T-shirt"],
  ["camp", "Camp"], ["sessions", "Session"], ["location", "Location"], ["package", "Package"],
  ["parents", "Parent/guardian name(s)"], ["phone", "Parent phone"], ["email", "Parent email"], ["address", "Home address"],
  ["emergency", "Emergency contact(s)"], ["allergies", "Allergies"], ["medical", "Medical conditions"], ["medications", "Medications"],
  ["specialNeeds", "Special needs"], ["siblings", "Siblings"], ["friends", "Friends attending with"],
  ["early", "Early drop-off"], ["late", "Late pick-up"], ["transport", "Transportation"],
  ["pickups", "Authorized pick-ups"], ["lunch", "Lunch / meal plan"], ["dietary", "Dietary restrictions"],
  ["photoRelease", "Photo release"], ["signedOn", "Signed date"], ["submitted", "Last updated"],
];
export function rosterRows(enrollments, settings) {
  const sessionLabel = (id) => settings.sessions.find((x) => x.id === id)?.label || id;
  return enrollments.flatMap((e) => e.children.map((c) => ({
    contactId: e.contactId, camp: e.camp, child: c.name, age: c.age, dob: c.dob, grade: c.grade, shirt: c.shirt,
    sessions: c.sessions.map(sessionLabel).join("; "), sessionIds: c.sessions, location: c.location, package: c.package,
    parents: [`${e.parent.firstName} ${e.parent.lastName}`.trim() + (e.parent.relationship ? ` (${e.parent.relationship})` : ""), e.parent.guardian2Name && `${e.parent.guardian2Name}${e.parent.guardian2Phone ? ` ${e.parent.guardian2Phone}` : ""}`].filter(Boolean).join("; "),
    phone: e.parent.phone, email: e.email, address: [e.parent.street, e.parent.city, e.parent.state, e.parent.zip].filter(Boolean).join(", "),
    emergency: e.emergency.map(person).join("; "),
    allergies: c.allergies, medical: c.medical, medications: c.medications, specialNeeds: c.specialNeeds,
    siblings: e.children.filter((x) => x !== c).map((x) => x.name).join(", "), friends: e.friends,
    early: c.early, late: c.late,
    transport: c.transport === "Yes" ? `${c.transportDir}: ${c.transportStop === OTHER_STOP ? c.transportAddress : c.transportStop}` : "No",
    pickups: e.pickups.map(person).join("; "), lunch: c.lunch, dietary: c.dietary,
    photoRelease: e.photoRelease, signedOn: e.signedOn, submitted: e.updatedAt,
  })));
}
