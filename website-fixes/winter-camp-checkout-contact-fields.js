// Drop-in for the website backend's POST /api/winter-camp-checkout.
// Call it BEFORE the invoice is created, with the same contact id the invoice uses:
//
//   const fieldsResult = await writeCheckoutFields({ token: GHL_TOKEN, contactId, checkout: body });
//   console.log("WC26 checkout fields:", fieldsResult);
//   // ...existing tag + invoice code, unchanged...
//
// All 10 fields are written on every checkout (a parent who restarts checkout gets fresh values).
// The field ids were checked against location dbijRKgKjGLpLDU9lJxv (all 10 exist; Days/Age are NUMERICAL).

const FIELDS = {
  package: "IZs1Y40OThScb4TYu7IY",          // "Premium" | "Standard" | "Basic"
  campLength: "93dxp4eC9TghoEyxVIGX",       // "Full camp (8 days)" | "Weekly (5 days)"
  lunch: "2i186wJIBjV9jnGh7Pzw",            // "Yes" | "No"
  sports: "2GBGjTE2gpMekrxOACP9",           // "Yes" | "No"
  extendedCare: "vfEoymnj350h0dpYUSGt",     // "None" | "Early care (7:00–9:00 AM)" | "Late care (4:00–6:00 PM)" | "Early + late care"
  extendedCareDays: "yeYPj4ucWBPoGBvnXDFi", // number, 0 if none
  transportDays: "tlclAGEdPd39J9O0LiZF",    // number, 0 if none
  childName: "QuWbKRrAiIsCh5jXjvWr",        // text
  childAge: "bgllDYrqibCYjuRq5WNf",         // number
  discountCode: "NSJnTKck7NA6AdUP7pHK",     // text, "" if none
};

const CARE = { none: "None", early: "Early care (7:00–9:00 AM)", late: "Late care (4:00–6:00 PM)", both: "Early + late care" };
const count = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

// checkout: the request body. Adjust the property names on the right to match the website's form
// (package, length, standardChoice, extendedCare, extendedCareDays, transportDays, childName, childAge, discountCode).
export function checkoutFieldValues(checkout) {
  const pkg = /^prem/i.test(checkout.package) ? "Premium" : /^basic/i.test(checkout.package) ? "Basic" : "Standard";
  // Standard families pick lunch OR sports; Premium gets both, Basic neither.
  const standardPick = /sport/i.test(checkout.standardChoice || checkout.option || "") ? "sports" : "lunch";
  const lunch = pkg === "Premium" ? "Yes" : pkg === "Basic" ? "No" : standardPick === "lunch" ? "Yes" : "No";
  const sports = pkg === "Premium" ? "Yes" : pkg === "Basic" ? "No" : standardPick === "sports" ? "Yes" : "No";
  const care = CARE[String(checkout.extendedCare || "none").toLowerCase()] || (Object.values(CARE).includes(checkout.extendedCare) ? checkout.extendedCare : "None");
  return {
    package: pkg,
    campLength: /week|5/i.test(checkout.length || checkout.campLength || "") ? "Weekly (5 days)" : "Full camp (8 days)",
    lunch, sports,
    extendedCare: care,
    extendedCareDays: care === "None" ? 0 : count(checkout.extendedCareDays),
    transportDays: count(checkout.transportDays),
    childName: String(checkout.childName || "").trim(),
    childAge: count(checkout.childAge),
    discountCode: String(checkout.discountCode || "").trim(),
  };
}

// Never throws: a failed update (or a network error) is logged and the checkout goes on to the invoice.
export async function writeCheckoutFields({ token, contactId, checkout }) {
  const values = checkoutFieldValues(checkout);
  const customFields = Object.entries(FIELDS).map(([k, id]) => ({ id, field_value: values[k] }));
  try {
    const res = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ customFields }),
    });
    const text = await res.text();
    if (res.status === 200) {
      console.log(`WC26 checkout fields: GHL PUT /contacts/${contactId} -> 200. Sent ${JSON.stringify(values)}. GHL response: ${text}`);
    } else {
      console.error(`WC26 checkout fields: GHL PUT /contacts/${contactId} -> ${res.status} (continuing to the invoice). Sent ${JSON.stringify(values)}. Error body: ${text}`);
    }
    return { ok: res.status === 200, status: res.status, contactId, values, body: text };
  } catch (err) {
    console.error(`WC26 checkout fields: GHL PUT /contacts/${contactId} failed (continuing to the invoice): ${err.message}`);
    return { ok: false, status: null, contactId, values, error: err.message };
  }
}
