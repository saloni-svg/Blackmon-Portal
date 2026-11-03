// The parent's Winter Camp 2026 registration for the Payment plan page,
// read from their paid GHL invoices ("Winter Camp 2026: ..."), or, for older payment-link purchases,
// their paid orders. Read only. Each registration:
// { source, number, paidAt, length, package, includes, campPackage, extendedCare, transport, other,
//   subTotal, discount, discountCode, fee, feeRate, totalPaid, balanceDue }
// where campPackage / extendedCare / transport / other[] are { label, amount } (null when not bought).

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const cents = (n) => Math.round(n * 100) / 100;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Sorts the line items into the checkout's rows. item: { name, description, amount, qty, rate }
export function registrationRows(items) {
  const out = { length: "", package: "", includes: "", campPackage: null, extendedCare: null, transport: null, other: [] };
  for (const it of items) {
    const name = String(it.name || "").trim(), total = cents((it.amount ?? 0) * (it.qty ?? 1));
    const pkg = /\b(Premium|Standard|Basic)\b/i.exec(name);
    if (!out.campPackage && /winter camp/i.test(name) && pkg) {
      // "Winter Camp 2026 Standard, Weekly (5 days), Lunch option"
      out.package = pkg[1][0].toUpperCase() + pkg[1].slice(1).toLowerCase();
      const len = /(full camp|weekly)\s*\((\d+)\s*days?\)/i.exec(name);
      out.length = len ? `${/full/i.test(len[1]) ? "Full camp" : "Weekly"}, ${plural(Number(len[2]), "day")}` : "";
      out.includes = out.package === "Premium" ? "Lunch and sports" : out.package === "Basic" ? "Camp activities only"
        : /lunch option/i.test(name) ? "Daily lunch" : /sports option/i.test(name) ? "Organized sports" : "";
      out.campPackage = { label: "Camp package", amount: total };
    } else if (/^extended care/i.test(name)) {
      // "Extended care: Early care, 7:00 to 9:00 AM" -> "Early care, 6 days"
      const kind = name.replace(/^extended care:?\s*/i, "").replace(/,\s*\d{1,2}:\d{2}.*$/, "").trim() || "Extended care";
      out.extendedCare = { label: `${kind}, ${plural(it.qty ?? 1, "day")}`, amount: total };
    } else if (/^transportation/i.test(name)) {
      out.transport = { label: plural(it.qty ?? 1, "day"), amount: total };
    } else {
      out.other.push({ label: name, amount: total });
    }
  }
  return out;
}

function registration({ source, number, paidAt, items, subTotal, discount, discountCode, total, amountPaid, amountDue }) {
  subTotal ??= cents(items.reduce((t, i) => t + (i.amount ?? 0) * (i.qty ?? 1), 0));
  discount ??= 0;
  const rates = [...new Set(items.map((i) => i.rate).filter((r) => r != null))];
  return {
    source, number, paidAt, ...registrationRows(items),
    subTotal, discount, discountCode,
    fee: total != null ? cents(total - (subTotal - discount)) : null, feeRate: rates.length === 1 ? rates[0] : null,
    totalPaid: amountPaid, balanceDue: amountDue,
  };
}

export const paidWinterCampInvoice = (inv) => String(inv.status || "").toLowerCase() === "paid" && /^Winter Camp 2026:/.test(String(inv.name || ""));
const paidOrder = (o) => /^(paid|completed|succeeded)$/i.test(o.paymentStatus || o.status || "");

export function invoiceRegistration(inv, discountCode = "") {
  const sum = inv.totalSummary || {};
  return registration({
    source: "invoice",
    number: inv.invoiceNumber ? `${inv.invoiceNumberPrefix || "INV-"}${inv.invoiceNumber}` : "",
    paidAt: inv.lastPaidAt || null,
    items: (inv.invoiceItems || []).map((it) => ({ name: it.name, description: it.description, amount: num(it.amount) ?? 0, qty: num(it.qty) ?? 1, rate: it.taxes?.[0]?.rate ?? null })),
    subTotal: num(sum.subTotal), discount: num(sum.discount), discountCode,
    total: num(inv.total), amountPaid: num(inv.amountPaid), amountDue: num(inv.amountDue),
  });
}

export function orderRegistration(o, discountCode = "") {
  const sum = o.amountSummary || {}, total = num(o.amount);
  return registration({
    source: "order", number: o.fulfillmentNumber || o.orderNumber || "", paidAt: o.updatedAt || o.createdAt || null,
    items: (o.items || []).map((it) => ({ name: it.name || it.product?.name, amount: num(it.price?.amount ?? it.amount) ?? 0, qty: num(it.qty) ?? 1, rate: null })),
    subTotal: num(sum.subtotal), discount: num(sum.discount), discountCode: o.couponCode || discountCode,
    total, amountPaid: total, amountDue: 0,
  });
}

// Newest first; [] when the contact has neither. Errors are logged, never thrown.
export async function registrationsFor(store, contactId, discountCode = "") {
  const read = (fn, what) => fn(contactId).catch((err) => {
    console.log(`  Payment details: couldn't read ${what} for ${contactId}: ${err.message}`);
    return [];
  });
  const newest = (a, b) => (Date.parse(b.paidAt || "") || 0) - (Date.parse(a.paidAt || "") || 0);
  const invoices = store.invoicesFor ? (await read((id) => store.invoicesFor(id), "invoices")).filter(paidWinterCampInvoice) : [];
  if (invoices.length) return invoices.map((i) => invoiceRegistration(i, discountCode)).sort(newest);
  const orders = store.ordersFor ? (await read((id) => store.ordersFor(id), "orders")).filter(paidOrder) : [];
  return orders.map((o) => orderRegistration(o, discountCode)).sort(newest);
}

