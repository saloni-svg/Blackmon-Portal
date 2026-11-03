// Demo store: same interface as the live GHL store, backed by sample contacts in memory.
// Field keys and dropdown options are copied from the Blackmon GHL account (Oct 22, 2026),
// so switching to live data changes nothing in the portal.

const OPTIONS = {
  sub_sandwich_chips_included: [
    "Turkey with lettuce, tomato, and mustard",
    "Ham with lettuce, tomato, and mustard",
    "Turkey with lettuce, tomato, and mayo",
    "Ham with lettuce, tomato, and mayo",
    "Veggie with lettuce, tomato, and hummus",
  ],
  soft_tacos_chips_included: [
    "Beef with lettuce, tomatoes, cheese, and salsa",
    "Chicken with lettuce, tomatoes, cheese, and salsa",
    "Vegetarian with black beans, corn, and salsa",
  ],
  chicken_nuggets_chips_included: ["Regular chicken nuggets", "Grilled chicken nuggets"],
  portal__location: ["Little Elm"],
  pizza: [
    "Cheese with marinara sauce",
    "Pepperoni with marinara sauce",
    "Veggie with mushrooms, bell peppers, onions, and olives",
  ],
};

function seed() {
  return [
    {
      id: "demo-parent-1", firstName: "Maria", lastName: "Lopez", email: "parent@demo.test", phone: "+14695550101",
      tags: ["enrollment-submitted"],
      fields: {
        portal__role: "Parent", portal__location: "Little Elm", portal__program: "Summer - Monthly with Sports",
        portal__payment_plan: "Installments", portal__plan_total: 1800, portal__amount_paid: 600, portal__balance: 1200,
        portal__next_due_date: "2027-06-01", portal__installments_remaining: 2,
        child_name: "Sofia", childs_age: "7", docs_sent: "Yes", esign_status: "Sent", docs_signed: "No",
      },
    },
    {
      id: "demo-parent-2", firstName: "James", lastName: "Carter", email: "signed@demo.test", phone: "+14695550102",
      tags: ["enrollment-submitted"],
      fields: {
        portal__role: "Parent", portal__location: "Little Elm", portal__program: "Summer - Full 10 Weeks",
        portal__payment_plan: "Pay in Full", portal__plan_total: 3200, portal__amount_paid: 3200, portal__balance: 0,
        child_name: "Eli", childs_age: "9", docs_sent: "Yes", esign_status: "Completed", docs_signed: "Yes",
        pizza: "Cheese with marinara sauce", sub_sandwich_chips_included: "Turkey with lettuce, tomato, and mayo",
        soft_tacos_chips_included: "Chicken with lettuce, tomatoes, cheese, and salsa",
        chicken_nuggets_chips_included: "Regular chicken nuggets",
      },
    },
    {
      id: "demo-staff-1", firstName: "Aisha", lastName: "Grant", email: "staff@demo.test",
      fields: { portal__role: "Camp Staff", portal__location: "Little Elm", portal__jordan_approved: "Yes", portal__onboarding_status: "Training" },
    },
    {
      id: "demo-tutor-1", firstName: "Dev", lastName: "Patel", email: "tutor@demo.test",
      fields: { portal__role: "Tutor", portal__jordan_approved: "Yes", portal__onboarding_status: "Contract Signed" },
    },
    // Paid Winter Camp 2026 parents who haven't been invited to the portal yet (no Portal - Role).
    {
      id: "demo-parent-3", firstName: "Grace", lastName: "Kim", email: "grace@demo.test", phone: "+14695550103",
      fields: { portal__location: "Little Elm", portal__program: "Winter Camp", portal__amount_paid: 450 },
    },
    {
      id: "demo-parent-4", firstName: "Omar", lastName: "Hassan", email: "omar@demo.test", phone: "+14695550104",
      fields: { portal__location: "Little Elm", portal__program: "Winter Camp", portal__amount_paid: 900 },
    },
    // Not shown in the admin Parents list: paid in the OLD "Winter Camp" pipeline, and a 2026 lead that hasn't paid.
    { id: "demo-lead-1", firstName: "Olivia", lastName: "Reed", email: "olivia@demo.test", phone: "+14695550105", fields: {} },
    { id: "demo-lead-2", firstName: "Noah", lastName: "Brooks", email: "noah@demo.test", phone: "+14695550106", fields: {} },
  ];
}

// Pipeline/stage/field IDs are the real Blackmon ones, so demo data is filtered exactly like live data.
// Lunch Included: Maria = "Yes" (gets the Meal Plan), James = "no" (doesn't).
const PAID = "ef44a5c4-5c0c-47ba-a6c7-e677aca1f0bf", WC2026 = "eXOcuRrWabqKkb20C3KC";
const LUNCH = "6TXpnRke5ZmEqe3r9Rzb", CHILD = "pUYmi0vYThlJoeqi8ucX";
const OPP_EMAIL = "23R9W4tgFxSMraNsjro5", OPP_PHONE = "AOdFXJqh5maLJbccrHfS", OPP_CHILD_AGE = "demo-opp-child-age";
const opp = (id, contactId, name, value, pipelineId, stageId, lunch, child) => ({
  id, contactId, name, value, pipelineId, stageId, status: stageId === PAID ? "won" : "open", createdAt: "2026-10-01T15:00:00.000Z",
  customFields: [lunch != null && { id: LUNCH, value: lunch }, child && { id: CHILD, value: child }].filter(Boolean),
});
const OPPORTUNITIES = [
  opp("demo-opp-1", "demo-parent-1", "Maria Lopez", 600, WC2026, PAID, "Yes", "Sofia Lopez"),
  opp("demo-opp-2", "demo-parent-2", "James Carter", 3200, WC2026, PAID, "no", "Eli Carter"),
  opp("demo-opp-3", "demo-parent-3", "Grace Kim", 450, WC2026, PAID, "", null),
  opp("demo-opp-4", "demo-parent-4", "Omar Hassan", 900, WC2026, PAID, "y", "Zara Hassan"),
  opp("demo-opp-5", "demo-lead-1", "Olivia Reed", 500, "KI5wP7tlO3m2TQecWW7x", "37f27262-4e8c-4fda-b068-716dfcf252a9", "Yes", null),
  opp("demo-opp-6", "demo-lead-2", "Noah Brooks", 0, WC2026, "efc7e1b1-7cc9-47d7-a490-9fd84055fe40", null, null),
];
// Maria has a Camp Package and Package Amount (opportunity.camp_package / package_amount); the other
// paid parents haven't had one set yet.
OPPORTUNITIES[0].customFields.push({ id: "h1rnZpVWWVMlFzrdkMu3", value: "Premium - Full camp (8 days) - $500" }, { id: "BFkNFdq93TyS0lYCFF5g", value: 500 });
const STAGES = { efc7e1b1: "New Lead", ef44a5c4: "Paid (won)" };
const titleCase = (key) => key.replace(/__/g, " - ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function createDemoStore() {
  const contacts = seed();
  const invoices = new Map();
  const byId = (id) => contacts.find((c) => c.id === id) || null;
  const clone = (c) => (c ? structuredClone(c) : null);

  return {
    live: false,
    // Sign-in page list: only contacts that can actually sign in.
    get accounts() {
      return contacts.filter((c) => c.fields.portal__role && c.fields.portal__access_granted !== "No").map((c) => ({ email: c.email, role: c.fields.portal__role }));
    },

    async findByEmail(email) {
      return clone(contacts.find((c) => c.email.toLowerCase() === email.toLowerCase()));
    },
    async getContact(id) { return clone(byId(id)); },
    async findAllByEmail(email) { return contacts.filter((c) => c.email.toLowerCase() === email.toLowerCase()).map(clone); },
    async fieldOptions(key) { return OPTIONS[key] || []; },
    async updateFields(id, values) { Object.assign(byId(id).fields, values); },
    async updateContact(id, standard, values) { const c = byId(id); Object.assign(c, standard); Object.assign(c.fields, values); },
    // Demo invoice: a local page whose Pay button marks the amount as paid, so the portal flow can be tried.
    async createInvoice(contact, { amount }) {
      const invoiceId = `demo-inv-${Date.now()}`;
      invoices.set(invoiceId, { contactId: contact.id, amount, paid: false });
      return { invoiceId, url: `/api/demo/invoice?id=${invoiceId}` };
    },
    async payDemoInvoice(invoiceId) {
      const inv = invoices.get(invoiceId);
      if (!inv || inv.paid) return false;
      const f = byId(inv.contactId).fields;
      f.portal__amount_paid = Math.round(((f.portal__amount_paid || 0) + inv.amount) * 100) / 100;
      f.portal__balance = Math.round(((f.portal__balance || 0) - inv.amount) * 100) / 100;
      if (f.portal__installments_remaining > 0) f.portal__installments_remaining -= 1;
      inv.paid = true;
      return inv;
    },
    async createContact(email, values, tags, standard = {}) {
      const c = { id: `demo-${contacts.length + 1}`, firstName: "", lastName: "", phone: "", ...standard, email, fields: { ...values }, tags: [...tags] };
      contacts.push(c);
      return clone(c);
    },
    async addTags(id, tags) { const c = byId(id); c.tags = [...new Set([...(c.tags || []), ...tags])]; },
    async uploadToField(id, key, file) { byId(id).fields[key] = file.name; },
    async links() {
      return {
        portalLogin: "https://example.com/DUMMY-portal-login",
        payment: "https://example.com/DUMMY-payment",
        introVideoForm: "https://example.com/DUMMY-intro-video-form",
        whatsappLittleElm: "https://example.com/DUMMY-whatsapp-little-elm",
        wiseInvite: "https://example.com/DUMMY-wise-invite",
      };
    },
    async sendCode() { /* demo never emails; the server prints the code */ },
    async searchOpportunities({ pipelineId, stageId, contactId }) {
      return OPPORTUNITIES.filter((o) => o.pipelineId === pipelineId && (!stageId || o.stageId === stageId) && (!contactId || o.contactId === contactId))
        .map((o) => ({ ...structuredClone(o), contactEmail: byId(o.contactId)?.email || "" }));
    },
    async getContactRaw(id) {
      const c = byId(id);
      if (!c) return null;
      return {
        id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone || "", tags: c.tags || [],
        address1: "123 Demo St", city: "Little Elm", state: "TX", postalCode: "75024", country: "US",
        source: "Demo data", type: "customer", dateAdded: "2026-10-01T15:00:00.000Z",
        customFields: Object.entries(c.fields).map(([k, v]) => ({ id: `demo-${k}`, value: v })),
      };
    },
    async fieldDefinitions(model) {
      if (model === "opportunity") return [
        { id: LUNCH, key: "lunch_included", name: "Lunch Included", type: "TEXT" }, { id: CHILD, key: "child_name", name: "Child name", type: "TEXT" },
        { id: OPP_CHILD_AGE, key: "child_age", name: "Child age", type: "TEXT" }, { id: OPP_EMAIL, key: "email", name: "Email", type: "TEXT" },
        { id: OPP_PHONE, key: "phone_number", name: "Phone Number", type: "TEXT" },
      ];
      const keys = [...new Set(contacts.flatMap((c) => Object.keys(c.fields)).concat(Object.keys(OPTIONS)))];
      return keys.map((k) => ({ id: `demo-${k}`, key: k, name: titleCase(k), type: "TEXT" }));
    },
    async pipelineInfo(pipelineId) {
      return { name: pipelineId === WC2026 ? "Winter Camp 2026" : "Winter Camp", stages: Object.fromEntries(OPPORTUNITIES.map((o) => [o.stageId, STAGES[o.stageId.slice(0, 8)] || "Paid (won)"])) };
    },
    async updateOpportunityFields(id, values) {
      const o = OPPORTUNITIES.find((x) => x.id === id);
      for (const [fid, value] of Object.entries(values)) o.customFields = [...o.customFields.filter((f) => f.id !== fid), { id: fid, value }];
    },
    async addNote(contactId, body) { console.log(`  [demo GHL note] ${byId(contactId)?.email}: ${body}`); },
    async ensureAlertContact(email) { return { id: "demo-admin-alerts", email, firstName: "Blackmon", lastName: "Admin Alerts" }; },
    async sendSms(contact, message) { console.log(`\n  [demo SMS] To: ${contact.email}\n  ${message}\n`); },
    // Demo never emails; the subject and any links print in the terminal instead.
    async sendEmail(contact, subject, html) {
      const links = [...new Set(html.match(/https?:\/\/[^"'<\s]+/g) || [])];
      console.log(`\n  [demo email] To: ${contact.email}\n  Subject: ${subject}${links.length ? `\n  Links: ${links.join("  ")}` : ""}\n`);
    },
  };
}
