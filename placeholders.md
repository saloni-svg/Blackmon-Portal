# Placeholders

Everything that still needs a real value before going live. Search the project for the exact text in the first column to find every place it's used.

## 1. Links

### 1a. Already switched to GHL custom values

These are no longer placeholders. The files use the same merge tags as the GHL email templates, and GHL fills them in from **Settings > Custom Values**. To go live, change the value there once; nothing in the files needs editing. They currently hold example.com dummy URLs.

| Merge tag | GHL custom value | Used in | Real value |
|---|---|---|---|
| `{{custom_values.portal_login_link}}` | Portal Login Link | pages/portal-signin, emails/welcome-after-payment, emails/documents-ready, emails/staff-approved, emails/staff-training-complete, emails/parent-dashboard-unlocked | |
| `{{custom_values.portal_payment_link}}` | Portal Payment Link | widgets/plan-summary, emails/installment-reminder, emails/payment-failed, emails/payment-failed-reminder | |
| `{{custom_values.portal_intro_video_form_link}}` | Portal Intro Video Form Link | emails/staff-approved, emails/staff-contract-signed | |
| `{{custom_values.portal_whatsapp_plano_link}}` | Portal WhatsApp Plano Link | emails/onboarding-complete-links, emails/onboarding-staff-plano | |
| `{{custom_values.portal_whatsapp_little_elm_link}}` | Portal WhatsApp Little Elm Link | emails/onboarding-complete-links, emails/onboarding-staff-littleelm | |
| `{{custom_values.portal_wise_invite_link}}` | Portal Wise Invite Link | emails/onboarding-complete-links, emails/onboarding-tutor-wise | |

Note: merge tags only fill in on pages built inside GHL. If the sign-in page is hosted anywhere else, type the real login URL in instead.

### 1b. Still placeholders (need real links)

| Placeholder | What it's for | Used in | Real value |
|---|---|---|---|
| `[ENROLLMENT_FORM_LINK]` | GHL parent enrollment form (testing: "DUMMY – Parent Enrollment") | widgets/documents-checklist | |
| `[MEAL_PLAN_FORM_LINK]` | GHL meal plan form | widgets/documents-checklist | |
| `[EARLY_DROPOFF_LINK]` | Where parents add early drop-off (7:00–9:00 AM) | widgets/daily-schedule (EDIT block) | |
| `[FORGOT_PASSWORD_LINK]` | GHL's password-reset page for the portal | pages/portal-signin (EDIT block) | |
| `[CAMP_PLANS_LINK]` | Page where new parents choose a camp plan | pages/portal-signin (EDIT block) | |
| `[APPLY_FORM_LINK]` | Application form for instructors and caregivers (use two links if the forms are separate) | website-fixes/apply-buttons (once per variant), pages/portal-signin | |

## 2. Content placeholders

| Placeholder | What it's for | Used in | Real value |
|---|---|---|---|
| `[STAFF_NAME]` | Each staff member's name (3 sample rows per location) | widgets/staff-directory (EDIT block) | |
| `[STAFF_PHONE]` | Each staff member's phone, becomes tap-to-call | widgets/staff-directory (EDIT block) | |
| `[MONDAY_TITLE]` … `[FRIDAY_TITLE]` | Day titles in the sample week, plus the bracketed `[Short description …]` lines | widgets/this-week (EDIT block) | Jordan fills in weekly |
| `[FIELD_TRIP_DESTINATION]` | Field trip name in the sample week | widgets/this-week (EDIT block) | Jordan fills in weekly |
| "Week of June 8" sample dates | Sample week label + dates, replace each week | widgets/this-week (EDIT block) | Jordan fills in weekly |

## 3. Facts to confirm with Jordan

These were supplied as working values. Each one is a **placeholder, confirm with Jordan.**

| Fact | Exact wording / value used | Used in | Confirmed value |
|---|---|---|---|
| Meal plan deadline | "Please submit your meal plan at least 7 days before your child's first camp day." | shared/ghl-form-theme.css (meal plan notes), widgets/documents-checklist (step 2), emails/welcome-after-payment (step 2) | Placeholder, confirm with Jordan |
| Short Game! waiver required for every camper | Now part of the ONE combined waiver (step 3, "Camp waiver (Liability Release + Short Game!)"), so every parent signs it. The documents email calls it "required for every camper". | widgets/documents-checklist, emails/documents-ready, emails/welcome-after-payment | Placeholder, confirm with Jordan |
| Early drop-off price | `+$15/day` (7:00–9:00 AM, per child per day) | widgets/daily-schedule (EDIT block → `earlyDropoffPrice`) | Winter Camp brief: early care 7:00–9:00 AM, $50 flat extended-care fee (portal app updated). Coverage period still to confirm |
| Late pick-up price | `+$15/day` (after 5:00 PM, per child per day) | widgets/daily-schedule (EDIT block → `latePickupPrice`) | Winter Camp brief: late care 4:00–6:00 PM, same $50 flat fee (portal app updated). Coverage period still to confirm |
| Meal text: veggie sub | "Veggie with lettuce, tomato, and hummus" | shared/ghl-form-theme.css (meal plan notes) | Placeholder, confirm with Jordan |
| Meal text: beef taco | "Beef with lettuce, tomatoes, cheese, and salsa" | shared/ghl-form-theme.css (meal plan notes) | Placeholder, confirm with Jordan |
| Meal text: chicken taco | "Chicken with lettuce, tomatoes, cheese, and salsa" | shared/ghl-form-theme.css (meal plan notes) | Placeholder, confirm with Jordan |
| Field trip lunch notice | "On field trip days, please pack your child's lunch. If it's forgotten, we'll have PB&J available." | widgets/daily-schedule, shared/ghl-form-theme.css (meal plan notes) | Placeholder, confirm with Jordan |

## 4. GHL contact custom fields

Checked in your GHL account (location `dbijRKgKjGLpLDU9lJxv`) on Oct 22, 2026. **All the fields the code uses already exist**, and GHL fills them in automatically.

| Merge field | GHL type / options | Used in |
|---|---|---|
| `{{contact.first_name}}` | Standard field | all emails |
| `{{contact.portal__program}}` | Dropdown: Summer - Full 10 Weeks · Summer - Monthly with Sports · Summer - Monthly without Sports · Winter Camp | widgets/plan-summary, emails/welcome-after-payment |
| `{{contact.portal__location}}` | Dropdown: Plano · Little Elm | widgets/plan-summary, widgets/documents-checklist (step 1 is "Done" once set by the enrollment form), emails/welcome-after-payment, emails/onboarding-complete-links |
| `{{contact.portal__payment_plan}}` | Dropdown: Pay in Full · Installments ("Pay in Full" shows the Paid in full badge) | widgets/plan-summary, emails/welcome-after-payment |
| `{{contact.portal__plan_total}}` | Money | widgets/plan-summary |
| `{{contact.portal__amount_paid}}` | Money | widgets/plan-summary |
| `{{contact.portal__balance}}` | Money | widgets/plan-summary, emails/installment-reminder |
| `{{contact.portal__next_due_date}}` | Date | widgets/plan-summary, emails/installment-reminder |
| `{{contact.portal__installments_remaining}}` | Number | widgets/plan-summary, emails/installment-reminder |
| `{{contact.portal__role}}` | Dropdown: Parent · Camp Staff · Tutor (same three tabs as the sign-in page) | For GHL workflow branching |
| `{{contact.esign_status}}` | Dropdown: Not Sent · Sent · Completed (set by the Portal workflows) | widgets/documents-checklist (step 3, combined waiver) |
| `{{contact.sub_sandwich_chips_included}}` | Radio (meal plan answer) | widgets/documents-checklist (step 2 is "Done" once answered) |

Other portal fields in GHL that aren't used in the code yet: `portal__access_granted` (Yes/No), `portal__jordan_approved` (Yes/No), `portal__onboarding_status` (Not Started · Training · Training Complete · Contract Signed · Video Submitted · Group/Wise Link Sent), `portal__intro_video` (file upload), `docs_signed`, `docs_sent`.

**Gaps found in GHL:**
- Fixed: checklist step 1 now uses `portal__location`, which only the parent enrollment form sets.
- Fixed: the two waivers are one combined GHL template, so one `esign_status` field is correct.
- The meal plan's chicken nuggets field has a "Grilled chicken nuggets" option that isn't in the Word doc. There's also no dipping-sauce, allergies or pizza special-request field. Details are at the bottom of shared/ghl-form-theme.css.

## 5. Files and assets still needed

| Item | Where it goes | Status |
|---|---|---|
| `plano-camp.jpg` | assets/images/, then upload to GHL Media and paste the URL in website-fixes/summer-camp-locations and pages/portal-signin | Stock stand-in (Unsplash), replace with a real Plano camp photo |
| `littleelm-camp.jpg` | same as above | Stock stand-in (Unsplash), replace with a real Little Elm camp photo |
| Staff photos (optional) | assets/images/ or GHL Media, then file name/URL in widgets/staff-directory EDIT block | Missing |
| Logo files | assets/logo/ | Added: blackmon-tutoring-logo.png (full logo) + blackmon-mark.png (B icon). Emails still use a text wordmark until the logo has a GHL Media URL |
| `docs/PRD-portal.pdf` | docs/ | Missing. Not found on this computer |
| `camp-signin.jpg` (kids & counselors, portrait-friendly) | assets/images/, then GHL Media URL in pages/portal-signin | Stock stand-in (Unsplash), replace with a real camp photo |
