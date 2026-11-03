// Drop-in for the website backend's POST /api/winter-camp-checkout.
// Call it BEFORE the new invoice is created, with the same contact id the invoice uses:
//
//   const voided = await voidUnpaidWinterCampInvoices({ token: GHL_TOKEN, contactId });
//   console.log("WC26 abandoned invoices:", voided);
//   // ...writeCheckoutFields (winter-camp-checkout-contact-fields.js), tags, invoice creation, unchanged...
//
// Voids this contact's unpaid Winter Camp 2026 invoices (status "sent" or "draft", name starting with
// "Winter Camp 2026:") so GHL stops sending payment reminders for abandoned checkouts. Paid and
// partially paid invoices are never touched. A failure is logged and never blocks the new checkout.
// The token needs the invoices.write scope.

const LOCATION_ID = "dbijRKgKjGLpLDU9lJxv";
const API = "https://services.leadconnectorhq.com";
const UNPAID = new Set(["sent", "draft"]);

export async function voidUnpaidWinterCampInvoices({ token, contactId }) {
  const headers = { Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" };
  const alt = `altId=${LOCATION_ID}&altType=location`;
  const result = { contactId, voided: [], failed: [] };
  let invoices;
  try {
    const res = await fetch(`${API}/invoices/?${alt}&contactId=${encodeURIComponent(contactId)}&limit=100&offset=0`, { headers });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${res.status} ${body?.message || ""}`.trim());
    invoices = body?.invoices || [];
  } catch (err) {
    console.log(`WC26 void unpaid: couldn't list invoices for contact ${contactId}: ${err.message}`);
    return { ...result, error: err.message };
  }
  const stale = invoices.filter((i) => UNPAID.has(String(i.status || "").toLowerCase()) && String(i.name || "").startsWith("Winter Camp 2026:"));
  for (const inv of stale) {
    const label = `${inv.invoiceNumberPrefix || "INV-"}${inv.invoiceNumber || "?"} (${inv._id}, ${inv.status}, "${inv.name}")`;
    try {
      const res = await fetch(`${API}/invoices/${encodeURIComponent(inv._id)}/void`, {
        method: "POST", headers, body: JSON.stringify({ altId: LOCATION_ID, altType: "location" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`${res.status} ${body?.message || ""}`.trim());
      result.voided.push(label);
    } catch (err) {
      result.failed.push(`${label}: ${err.message}`);
    }
  }
  console.log(`WC26 void unpaid for contact ${contactId}: ${stale.length} unpaid Winter Camp 2026 invoice(s); voided ${result.voided.length}${result.voided.length ? ` [${result.voided.join(", ")}]` : ""}; failed ${result.failed.length}${result.failed.length ? ` [${result.failed.join("; ")}]` : ""}.`);
  return result;
}
