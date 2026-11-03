// Turns a GHL contact into what the portal shows. The rules mirror the GHL workflows:
//   Parent: enrollment form -> Send Enrollment Documents (docs_sent / esign_status = Sent)
//           waiver signed   -> Parent Documents Signed (esign_status = Completed, dashboard unlocks)
//   Staff/Tutor: Jordan approved -> Training -> Training Complete -> Contract Signed
//                -> Video Submitted -> Group/Wise Link Sent  (portal__onboarding_status)

export const MEAL_FIELDS = [
  { key: "sub_sandwich_chips_included", label: "Sub sandwich", note: "Chips included", request: "sub_sandwich_special_request" },
  { key: "soft_tacos_chips_included", label: "Soft tacos", note: "Chips included. Other condiments will be on the side.", request: "soft_tacos_special_request_note_here" },
  { key: "chicken_nuggets_chips_included", label: "Chicken nuggets", note: "Chips included" },
  { key: "pizza", label: "Pizza" },
];

// Added on enrollment submit; GHL starts the waiver workflow from this tag.
export const ENROLLMENT_TAG = "enrollment-submitted";

export const ONBOARDING =["Not Started", "Training", "Training Complete", "Contract Signed", "Video Submitted", "Group/Wise Link Sent"];

const ROLE = { Parent: "parent", "Camp Staff": "staff", Tutor: "tutor" };
// Blackmon Tutoring runs one camp, Little Elm (content/camp.json -> locations.littleelm). Everyone sees
// it, whatever their GHL Portal - Location says (older contacts may still say "Plano").
const CAMP = { key: "littleelm", name: "Little Elm" };

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const num = (v) => (filled(v) && !isNaN(Number(v)) ? Number(v) : null);

// Next installment: Balance ÷ Installments left, rounded to cents; the full Balance when none are left.
// Null when nothing is owed.
export function nextInstallment(f) {
  const balance = num(f.portal__balance);
  if (!balance || balance <= 0) return null;
  const left = num(f.portal__installments_remaining);
  return left > 0 ? Math.round((balance / left) * 100) / 100 : balance;
}

// What a paid parent still has to do, for the admin's Missing steps page (true = done).
// lunch: their plan includes lunch (only then are meal choices needed; meal is null otherwise).
// waivers: their portal waiver counts { waivers, signed }; GHL's E-Sign Status / Docs Signed also count.
// meal: whether they've saved a meal plan (lib/meals.js).
export function parentSteps(contact, { lunch, waivers, meal }) {
  const f = contact.fields;
  const balance = num(f.portal__balance);
  const raw = f.portal__next_due_date;
  const due = filled(raw) ? new Date(isNaN(raw) ? raw : Number(raw)) : null;
  const today = new Date(new Date().toDateString());
  const overdue = balance > 0 && due && !isNaN(due) && due < today;
  return {
    enroll: (contact.tags || []).includes(ENROLLMENT_TAG),
    meal: lunch ? (meal ?? MEAL_FIELDS.some((m) => filled(f[m.key]))) : null,
    waiver: (waivers?.waivers > 0 && waivers.signed === waivers.waivers) || f.esign_status === "Completed" || f.docs_signed === "Yes",
    payment: !overdue,
    overdue: overdue ? { amount: nextInstallment(f), date: due.toISOString().slice(0, 10) } : null,
  };
}

// "Yes" / "No" from a GHL text field (any case, y / true / n / false); anything else null.
export const yesNo = (v) => { const s = String(v ?? "").trim(); return /^(yes|y|true)$/i.test(s) ? "Yes" : /^(no|n|false)$/i.test(s) ? "No" : null; };

// Lunch and sports for a Winter Camp package. Premium includes sports, Basic doesn't, Standard is the
// parent's choice of lunch OR sports (so one answer gives the other). Lunch is always the opportunity's
// own Lunch Included. tier: Basic / Standard / Premium (or ""); lunchRaw / sportsRaw: the opportunity's
// Lunch Included / Sports Included. Returns:
//   lunch, sports: "Yes" / "No" / null
//   pending: a Standard family whose Lunch Included is still empty ("Pending enrollment form")
//   formMissing: a Standard family without both answers yet (Missing steps: enrollment form not submitted)
export function campInclusions(tier, lunchRaw, sportsRaw) {
  const t = String(tier || "").trim().toLowerCase(), lunch = yesNo(lunchRaw), given = yesNo(sportsRaw);
  const standard = t === "standard";
  const sports = t === "premium" ? "Yes" : t === "basic" ? "No"
    : given ?? (standard && lunch ? (lunch === "Yes" ? "No" : "Yes") : null);
  return { lunch, sports, pending: standard && !lunch, formMissing: standard && (!lunch || !given) };
}

// The parent's Winter Camp 2026 package, for the Payment plan page. Every parent who can sign in has
// a Paid (won) opportunity, which means the whole package is paid: there are no installments, so
// Paid = the package amount and the balance is 0.
// opp: their Paid (won) opportunity (or null); f: contact fields by key; content: camp.json.
// Camp Package looks like "Premium - Full camp (8 days) - $500". Amount: the Package Amount field,
// else the opportunity's value, else Portal - Plan Total, else the price in the package name.
// Returns { set: false } until a package is chosen (nothing is guessed).
const PACKAGE_RE = /^\s*(Premium|Standard|Basic)\s*-\s*(Full camp|Weekly)[^-]*-\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/i;
export function campPackage(opp, f, content, packageField, amountField) {
  const raw = String(opp?.customFields?.find((cf) => cf.id === packageField)?.value ?? "").trim();
  if (!raw) return { set: false };
  const m = PACKAGE_RE.exec(raw);
  const tier = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : raw;
  const weekly = m ? /weekly/i.test(m[2]) : /weekly/i.test(raw);
  const price = m ? num(m[3].replace(/,/g, "")) : null;
  const positive = (v) => { const n = num(typeof v === "string" ? v.replace(/[$,\s]/g, "") : v); return n > 0 ? n : null; };
  const amount = positive(opp?.customFields?.find((cf) => cf.id === amountField)?.value) ?? positive(opp?.value) ?? positive(f.portal__plan_total) ?? price;
  const info = (content.winterCamp?.packages || []).find((p) => p.name.toLowerCase() === tier.toLowerCase());
  return {
    set: true, name: raw, tier, length: weekly ? "Weekly – 5 days" : "Full camp – 8 days", price, amount,
    summary: info?.summary || "", items: info?.items || [], lunch: info?.lunch || "",
    total: amount, paid: amount, balance: 0,
  };
}

// Portal - Access Granted = "No" (set when an admin removes someone) means no portal access.
export function roleOf(contact) {
  if (contact?.fields?.portal__access_granted === "No") return null;
  return ROLE[contact?.fields?.portal__role] || null;
}

export async function buildView(contact, store, content) {
  const f = contact.fields;
  const role = roleOf(contact);
  const location = CAMP.key;
  const links = await store.links();
  const base = {
    role,
    live: store.live,
    person: { firstName: contact.firstName, lastName: contact.lastName, email: contact.email },
    location,
    locationName: CAMP.name,
    camp: location ? content.locations[location] : null,
  };

  if (role === "parent") {
    const esign = f.esign_status || "Not Sent";
    const docsSigned = esign === "Completed" || f.docs_signed === "Yes";
    const enrolled = (contact.tags || []).includes(ENROLLMENT_TAG);
    const meals = {};
    for (const m of MEAL_FIELDS) {
      meals[m.key] = f[m.key] || "";
      if (m.request) meals[m.request] = f[m.request] || "";
    }
    const mealDone = MEAL_FIELDS.some((m) => filled(f[m.key]));
    const mealOptions = {};
    for (const m of MEAL_FIELDS) mealOptions[m.key] = await store.fieldOptions(m.key);

    return {
      ...base,
      child: f.childs_name || f.child_name || "",
      unlocked: docsSigned,
      checklist: [
        { id: "enroll", title: "Enrollment form", desc: "Your child's details and camp location.", done: enrolled, go: "#/enroll" },
        { id: "meal", title: "Meal plan", desc: "Pick lunches at least 7 days before your child's first camp day.", done: mealDone, go: "#/meals" },
        {
          id: "waiver", title: "Sign the waivers", desc: "Day Camp Liability Release and Short Game Waiver & Code of Conduct, signed in the portal.",
          done: docsSigned, go: "#/documents", status: "Ready to sign under Documents",
        },
      ],
      plan: {
        program: f.portal__program || "",
        type: f.portal__payment_plan || "",
        total: num(f.portal__plan_total),
        paid: num(f.portal__amount_paid),
        balance: num(f.portal__balance),
        nextDue: f.portal__next_due_date || null,
        installmentsLeft: num(f.portal__installments_remaining),
        nextAmount: nextInstallment(f),
        payLink: links.payment || "",
      },
      meals,
      mealFields: MEAL_FIELDS,
      mealOptions,
      enrollment: {
        firstName: contact.firstName, lastName: contact.lastName, phone: contact.phone || "", email: contact.email,
        child_name: f.child_name || "", childs_age: f.childs_age || "", portal__location: f.portal__location || "",
      },
      locationOptions: await store.fieldOptions("portal__location"),
      schedule: content.schedule,
      campInfo: content.winterCamp || null,
      week: location ? content.weeks[location] : null,
      team: location ? content.teams[location] : [],
    };
  }

  if (role === "staff" || role === "tutor") {
    const approved = f.portal__jordan_approved === "Yes";
    const stage = Math.max(0, ONBOARDING.indexOf(f.portal__onboarding_status || "Not Started"));
    const at = (name) => stage >= ONBOARDING.indexOf(name);
    const groupLink = role === "tutor"
      ? links.wiseInvite
      : links.whatsappLittleElm;
    return {
      ...base,
      approved,
      status: ONBOARDING[stage],
      hasVideo: filled(f.portal__intro_video) || at("Video Submitted"),
      steps: [
        { id: "approved", title: "Application approved", desc: "Jordan reviewed your application.", done: approved },
        { id: "training", title: "Complete your training", desc: "Watch the training course in the Blackmon membership area.", done: at("Training Complete"), link: links.portalLogin, linkText: "Open training" },
        { id: "contract", title: "Sign your contract", desc: "We email your contract after training. Open it and sign.", done: at("Contract Signed") },
        { id: "video", title: "Record your intro video", desc: "A short hello for parents and the team.", done: at("Video Submitted"), go: "#/video" },
        {
          id: "group",
          title: role === "tutor" ? "Accept your Wise invite" : "Join your camp WhatsApp group",
          desc: role === "tutor" ? "Wise is where you'll teach and see your students." : `Your ${CAMP.name} team chat.`,
          done: at("Group/Wise Link Sent"),
          link: at("Video Submitted") ? groupLink : "",
          linkText: role === "tutor" ? "Open Wise invite" : "Open WhatsApp group",
        },
      ],
    };
  }

  return { ...base, role: null };
}
