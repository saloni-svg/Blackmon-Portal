# Blackmon Tutoring — Parent, Staff & Tutor Portal (front-end pieces)

The portal runs on GoHighLevel (memberships, forms, Documents & Contracts, workflows). This folder holds only the custom code pasted into GHL: **Custom HTML/Code widgets**, **form CSS**, **workflow emails**, and **website fixes**.

All real-world values still to fill in are listed in [placeholders.md](placeholders.md).

## How to paste a widget

Each widget file is a full HTML page you can open in a browser to preview. In GHL, add a **Custom HTML/Code** element and paste **only** what's between:

```
<!-- ===== BEGIN WIDGET ===== -->   …   <!-- ===== END WIDGET ===== -->
```

Every widget is self-contained: its CSS is scoped to its own root class (`.bt-sched`, `.bt-plan`, …), so it can't affect the rest of the GHL page.

## Files

| File | What it is | Where to paste in GHL | What to edit |
|---|---|---|---|
| `shared/tokens.css` | Brand colors, fonts, radii, shadows | Reference only (each widget carries its own copy) | Change a brand value here *and* in each widget's `<style>` |
| `shared/ghl-form-theme.css` | Styles GHL forms/surveys to match the portal, plus the cleaned-up meal plan options (comment at bottom) | Forms/Surveys > Enrollment form + Meal plan form > Styles > Custom CSS | Nothing. Type the meal plan options from the bottom comment into the form builder |
| `pages/portal-signin.html` | Sign-in page built from the approved design. The Parent / Camp staff / Tutor tabs send people to GHL's real login | Funnel/website page (e.g. `/portal`) > full-width Custom HTML | EDIT block: login URL per role, forgot-password, camp plans and apply links. Photo `camp-signin.jpg` |
| `widgets/daily-schedule.html` | "A day at camp" timeline with live "Happening now" | Parent portal > Camp info lesson > Custom HTML | EDIT block at top: extra-charge prices + `[EARLY_DROPOFF_LINK]` |
| `widgets/plan-summary.html` | "My payment plan" card (paid, balance, next due, progress bar) | Parent portal > Dashboard > Custom HTML | `data-payment-link`. If merge fields don't render in membership code, use it on a funnel page instead (see file header) |
| `widgets/this-week.html` | "This week at camp" day cards | Parent portal > This week lesson > Custom HTML (one per location) | Jordan edits the EDIT block weekly. Set `data-location` to `plano` or `littleelm` |
| `widgets/staff-directory.html` | "Your camp team" cards with tap-to-call | Parent portal > Camp team lesson > Custom HTML (one per location) | EDIT block: names, roles, phones, photos. Set `data-location` |
| `widgets/documents-checklist.html` | "Your enrollment checklist" (4 steps, To do / Done) | Parent portal > Dashboard (top) > Custom HTML | Form links. Set each step's `data-status` to `done` (or a GHL field) |
| `emails/welcome-after-payment.html` | Payment received + next steps | Workflow: payment received > Send Email > Code editor | `[PORTAL_LOGIN_LINK]` |
| `emails/documents-ready.html` | Your 2 documents are ready to sign | Workflow: forms submitted > Send Email | `[PORTAL_LOGIN_LINK]` |
| `emails/installment-reminder.html` | Next installment due + balance | Workflow: before next due date > Send Email | `[PAYMENT_LINK]` |
| `emails/payment-failed.html` | Payment didn't go through | Workflow: payment failed > Send Email | `[PAYMENT_LINK]` |
| `emails/staff-approved.html` | Welcome to the team + onboarding steps | Workflow: application approved > Send Email | `[PORTAL_LOGIN_LINK]`, `[INTRO_VIDEO_FORM_LINK]` |
| `emails/onboarding-complete-links.html` | Final link: **A** camp staff (WhatsApp by location) / **B** tutors (Wise) | Staff workflow and tutor workflow > Send Email | Reference copy with both versions. For GHL, use the 3 split files below |
| `emails/onboarding-staff-plano.html` | Onboarding done: join the Plano WhatsApp group | Staff/Tutor Video Submitted > "Email: Staff – Plano WhatsApp" | `[WHATSAPP_PLANO_LINK]` |
| `emails/onboarding-staff-littleelm.html` | Onboarding done: join the Little Elm WhatsApp group | Staff/Tutor Video Submitted > "Email: Staff – Little Elm WhatsApp" | `[WHATSAPP_LITTLEELM_LINK]` |
| `emails/onboarding-tutor-wise.html` | Onboarding done: accept the Wise invite | Staff/Tutor Video Submitted > "Email: Tutor – Wise invite" | `[WISE_INVITE_LINK]` |
| `emails/parent-dashboard-unlocked.html` | Documents signed, dashboard unlocked | Parent Documents Signed > "Email parent - dashboard unlocked" | `[PORTAL_LOGIN_LINK]` |
| `emails/payment-failed-reminder.html` | Payment still not through (2nd reminder) | Installment Payment Failed > "Email - payment failed (2nd reminder)" | `[PAYMENT_LINK]` |
| `emails/staff-training-complete.html` | Training done, sign your contract | Staff/Tutor Training Complete > "Email: Training complete" | `[PORTAL_LOGIN_LINK]` |
| `emails/staff-contract-signed.html` | Contract signed, record your intro video | Staff/Tutor Contract Signed > "Email: record intro video" | `[INTRO_VIDEO_FORM_LINK]` |
| `website-fixes/summer-camp-locations.html` | "Our camp locations" (Plano + Little Elm), replaces the wrong Dallas/Plano/Frisco block | Website > Summer Camp page > Custom HTML | Upload the 2 photos to GHL Media and swap the `src` URLs |
| `website-fixes/apply-buttons.html` | "Apply now" CTA with 3-step how-it-works | Website > Become an Instructor (`data-variant="tutor"`) / Become a Caregiver (`data-variant="staff"`) | `[APPLY_FORM_LINK]`, `data-variant` |
| `assets/logo/`, `assets/images/` | Logo + photos | Upload to GHL Media and use the URLs | Add files (see placeholders.md) |
| `index.html` | Local preview menu linking every page | Not for GHL | Nothing |
| `docs/` | Source documents (itinerary, waivers, meal plan) | — | Add `PRD-portal.pdf` (missing) |

## Notes

- **Images on GHL:** relative paths like `../assets/images/x.jpg` only work in local preview. In GHL, upload to Media and paste the full URL.
- **Emails:** table layout + inline styles, 600px, Georgia/Arial fonts (no web fonts) so they look right in Gmail and Outlook.
- **Facts:** camp times, addresses and document names come from `docs/`. Prices, the meal plan deadline and the "Short Game! waiver required for every camper" rule are working values to confirm with Jordan (placeholders.md §3).
