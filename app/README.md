# Blackmon Portal (app)

One responsive portal for parents, camp staff and tutors. Its data comes from GoHighLevel.

## Run it

```
cd ~/Desktop/blackmon-portal/app
npm start
```

Then open http://localhost:3000. Stop it with `Ctrl+C`.

- **No GHL key yet:** the portal runs on demo data. The sign-in page lists the demo emails, and each sign-in code prints in the terminal.
- **Live GHL data:** paste your Private Integration token after `GHL_TOKEN=` in `app/.env`, then restart.

## How it connects to GHL

| In the portal | GHL data / workflow |
|---|---|
| Sign in | Finds the contact by email. **Portal - Role** decides what they see. |
| Checklist: Enrollment form | Your real GHL form (DUMMY – Parent Enrollment), embedded in the portal. Submitting it fires **Send Enrollment Documents**. |
| Checklist: Meal plan | Saves to the meal fields on the contact (sub, tacos, nuggets, pizza + special requests). |
| Checklist: Waiver | Reads **E-Sign Status** / **Docs Signed**. Once it's Completed, This week, A day at camp and Camp team unlock (same rule as **Parent Documents Signed**). |
| Payment plan | Reads the Portal - Plan Total, Amount Paid, Balance, Next Due Date and Installments Remaining fields. The button uses the **Portal Payment Link** custom value. |
| Staff/Tutor onboarding | Follows **Portal - Onboarding Status**. Training opens the **Portal Login Link**. The last step opens **WhatsApp Little Elm** or **Wise Invite**. |
| Intro video upload | Uploads to **Portal - Intro Video** and sets Onboarding Status to **Video Submitted**. |

## Admin dashboard (`/admin`)

A separate area for the Blackmon team at http://localhost:3000/admin, with its own email + password sign-in (not the email code).

- **Owner:** created on first start from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. It can't be deleted or downgraded. Change the password in **Settings** after the first sign-in.
- **Parents:** contacts whose opportunity is in **Winter Camp 2026 → Paid (won)** (not the older "Winter Camp" pipeline). **Send notification** emails the portal link (`emails/portal-ready.html`) and sets Portal - Role = Parent and Access Granted = Yes. **Delete** only sets Access Granted = No and hides them; nothing is deleted in GHL.
- **Training videos** (admin sidebar): admins upload training videos (MP4, MOV or WebM, up to 1 GB) separately for camp staff and for tutors, and can rename, reorder and delete them. Each group watches its own list on its portal Training page; a video counts as watched when played to the end, and when all are watched their GHL Portal - Onboarding Status moves to Training Complete (it never moves backwards). Files are stored in `data/training/`.
- **Assessments** (admin sidebar): the Camp Counselor Knowledge Assessment (`content/assessment.json`: the 10 questions plus the answer key, feedback and review scenes). Camp staff (not tutors) take it on their portal's Assessment page once they've watched every training video (or GHL already says Training Complete); it's also an onboarding step. The portal grades it against the key (1 point each; question 6 only when exactly A, B and D are marked) and the answer key never reaches the browser. 80% (8 of 10) passes; below that they see feedback for each missed question and retake it. Every attempt is kept (`assessment_attempts` table) and shown here and in the Camp staff table. Passing doesn't change any GHL field.
- **Training acknowledgment**: after passing the assessment, camp staff sign the Staff Training Acknowledgment (`documents/Blackmon_Staff_Training_Acknowledgment.pdf`) on their portal's Acknowledgment page; it's also an onboarding step. The signed copy is the form filled in with their name, role, location, training completion date, assessment score, signature and date, plus a signature record page; Supervisor review is left blank for the camp director. Signing adds an admin notification (with View signed PDF), a note on their GHL contact, and shows on the Assessments page. Stored in `data/signed/` (`staff_acknowledgments` table).
- **Intro videos** (admin sidebar): every camp staff member and tutor, with the intro video they uploaded in their portal (name, role, location, gender, email, phone, upload time, download). Uploads are kept in `data/intro-videos/` and still sent to their GHL contact (Portal - Intro Video) as before; a new upload replaces the old one. Videos uploaded before this feature are only in GHL.
- **Camp staff** and **Tutors** (two sidebar pages, one list underneath, split by role): saved in the portal's database (`data/`), with ID proofs kept private there. Adding or editing someone also creates or updates their GHL contact (Portal - Role, Location, Access Granted = Yes, Jordan Approved = Yes) so they can sign in to the staff/tutor portal. Deleting sets Access Granted = No in GHL. On the portal sign-in page, the Camp staff and Tutor tabs only accept an email an admin added on the matching page (even with DEV_ALLOW_ANY_EMAIL=1); any other email gets "Incorrect email", and the wrong tab is told which tab to use. In the staff/tutor portal, **Settings** lets them change only their phone, camp location and ID proof (name, email, gender, role, dashboard access and password stay with admins); changes save to the same staff record and their GHL contact, so the admin pages show them, and appear in the activity log.
- **Access levels:** each staff member has No access, View only or Admin. In Add/Edit staff, the admin sets their dashboard password directly (with Generate and Copy); it's stored hashed only, and they're asked to change it after signing in. Alternatively, "Resend setup link" emails a one-time link (`emails/admin-setup.html`, valid 24 hours). Changing their access or password signs them out immediately. The server checks the level on every request.
- **Forgot password?** on the sign-in page emails a one-time reset link (`emails/admin-reset.html`, valid 1 hour) to the person's existing GHL contact. With `DEV_PRINT_CODES=1` the link also prints in the terminal. Stored passwords are never shown anywhere.
- **Portal - Access Granted = No** now means no portal access for anyone, so removing someone in the dashboard really locks them out.
- **Demo mode** (no `GHL_TOKEN`) uses sample parents and staff in `data/demo/`, separate from live data. Sign in as `admin@demo.test` or `view@demo.test` with `demo-pass-123`, or as the Owner. Emails print in the terminal.

The GHL token needs the **View Opportunities** scope for the Parents list.

## Camp documents and waivers

Paid parents (Winter Camp 2026 → Paid (won)) get the documents listed in `content/documents.json`; the PDFs are in `app/documents/` and are only served to the signed-in parent they belong to, or to admins.

- **Who gets what:** the opportunity's **Lunch Included** field decides the Meal Plan (yes / y / true = yes, anything else = no). Documents are assigned when the parent opens the portal, on the admin's Parents **Refresh**, and with **Sync documents**. If Lunch Included changes, the Meal Plan is added or removed. No duplicates.
- **Parent portal:** **Notifications** (unread badge) lists each document; **Documents** on the dashboard shows New / Viewed / Signed. Waivers have a sign form (name, child, relationship, typed signature, optional drawn signature, agreement). Signing saves a signed copy (the original PDF plus a signature page with the details, date/time and IP) in `data/signed/`, adds a note to the GHL contact, and can't be done twice.
- **Admin:** **Notifications** shows each signed waiver. Click a parent's name on **Parents** for everything GHL has on them, their documents, signed PDFs and **Reset waiver** (admins only; the old signed copy is kept). View only users can look but can't open signed PDFs or reset.
- **To add a document:** put the PDF in `app/documents/` and add a line to `content/documents.json` (`type`: `read` or `sign`, `lunchOnly`: true/false). Parents get it the next time documents sync.
- **Child info sync:** empty Winter Camp 2026 opportunity fields **Child name**, **Child age**, **Email** and **Phone Number** are filled from the contact (Child Name, Child's age, email, phone) when the Parents page loads, on a parent's detail page, when a parent opens the portal, and after the enrollment form. A value already on the opportunity is never overwritten. **Sync child info from contacts** on the Parents page runs it for every opportunity in the pipeline. Opportunity fields are matched by key (`child_name`, `child_age`, `email`, `phone_number`), so a field that doesn't exist yet is skipped. Needs the token scope **Edit Opportunities**.
- The signed PDF is not uploaded to GHL; GHL only accepts files into a "file upload" contact field, and none exists for waivers yet.

## Parent Documents, Notifications and Announcements

- **Documents** (sidebar) lists every camp document with its status; the badge counts waivers still to sign. A document page has **Back** (to where the parent came from) and, for an unsigned waiver, **Sign this waiver**, which jumps to the sign form under the PDF.
- **Notifications** shows admin announcements and "new document" notices, newest first. The **x** removes one from that parent's list only; documents stay under Documents.
- **Announcements** (admin sidebar): admins write once in English and choose who gets it (every family, one location, or chosen families), how (portal Notifications always; email and/or a short text message optional) and when (now, or scheduled; the server sends scheduled ones within a minute of their time). Each parent gets it in their language (the one they picked in Ask Blackmon; English otherwise), translated by the OpenAI model; **Preview translations** shows every version, including the SMS, before sending. Admins can attach up to 5 files (PDF, JPG or PNG, 10 MB each); parents open or download them from the announcement in their Notifications (only parents in the audience can), and the email/text says there's an attachment in the portal. Files are stored in `data/announcements/`. Once sent, only the wording and attachments can be edited (the portal updates; nothing is re-sent). The list shows recipients, emails/texts sent and "seen by". View only users can read but not post.
- **Missing steps** (admin sidebar): every paid family with what they still have to do: enrollment form, meal choices (only when their plan includes lunch), waivers (the portal waivers; GHL's e-sign status before any are assigned) and an overdue installment (`portal__balance` > 0 and `portal__next_due_date` past). Filter by location and step, select families and **Send reminder** by email and/or text: each parent gets only their own missing steps, in their language, with the portal link. "Last reminder" shows when each family was last reminded. Every email/SMS (reminders and announcements) is logged in the `outreach_log` table.
- **Test mode:** `PARENT_MESSAGES=test` (the default) sends every reminder and announcement email/text to `ADMIN_ALERT_EMAIL` / `ADMIN_ALERT_PHONE` instead of the parent, labelled `[TEST for <parent>]`; both admin pages say so. Set `PARENT_MESSAGES=live` at launch.

## Ask Blackmon (parent chat)

A chat bubble on every parent page answers questions from camp information, using retrieval-augmented generation (RAG).

- **What it knows:** `content/camp.json` (hours, packages and prices, activities, transportation, extended care, schedule, locations), the text of every PDF in `content/documents.json`, and the signed-in parent's own portal data (child, camp, lunch, payment plan, checklist, documents, this week, camp team). Nothing about other families, no phone numbers or ID.
- **How:** the content is split into sections, each turned into a vector by a local multilingual embedding model (runs on this server; downloaded once into `data/models/`). A question finds the closest sections, and the OpenAI model answers only from them, names its sources and says so when it doesn't know. PDFs are read once by the model and cached; editing camp.json or replacing a PDF updates the index automatically.
- **Languages:** English, Spanish, Hindi, Urdu, Arabic, Vietnamese, Chinese and French (picker in the chat header). Admins see an English translation of every non-English message.
- **Talk to a person:** the parent's button (or the bot offering it) records the request, shows a popup with the full chat in `/admin` (plus a Notifications entry with **View chat**), and emails and texts `ADMIN_ALERT_EMAIL` / `ADMIN_ALERT_PHONE` through GHL. Admins can **Mark as handled**.
- Unanswered questions print in the terminal (`Ask Blackmon: unanswered question …`), so missing content is easy to spot. Each parent can ask 20 questions per 10 minutes.
- **Talk (voice):** the **Talk** button in the chat header turns the chat into a spoken conversation (`lib/voice.js` + `public/voice.js`). The browser records each thing the parent says (a turn ends when they pause), the server transcribes it with `gpt-4o-transcribe` in the language picked in the chat, answers it with the chat itself (same search, same parent data, same rules, a shorter spoken style), and reads the answer out with `gpt-4o-mini-tts`. So spoken and typed questions get the same answers and land in the same conversation, which admins see. The language is the chat's dropdown only (it's never guessed from speech). Saying yes to "shall I connect you with the team?" hands the chat to a person (same popup + email + SMS). The mic isn't recorded while an answer plays. Calls end after 10 minutes; 6 calls per parent per hour. Needs the microphone, so the portal must be on HTTPS once hosted (localhost is fine).

## Settings (`app/.env`)

| Setting | Meaning |
|---|---|
| `GHL_TOKEN` | Private Integration token. Empty means demo data. |
| `GHL_LOCATION_ID` | Blackmon sub-account ID (already set). |
| `DEV_PRINT_CODES` | `1` prints sign-in codes in the terminal and sends no email. `0` emails codes through GHL. |
| `PORT` | Defaults to 3000. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | The Owner account for `/admin`, created on first start only. |
| `PORTAL_URL` | The address used in emailed links. Use the real https address once hosted. |
| `DATA_DIR` | Where the admin database, ID proofs and photos live (default `data/`). Use a persistent disk on a host. |
| `OPENAI_API_KEY` | Turns on the Ask Blackmon chat. Empty means the chat shows "not set up yet" (Talk to a person still works). |
| `ANTHROPIC_API_KEY` | Ask Blackmon's chat and Talk answers (and reading the camp PDFs) use Claude when this is set; otherwise OpenAI. Talk's speech to text and spoken voice always use OpenAI (`OPENAI_API_KEY`), as do announcement/reminder translations. |
| `ANTHROPIC_MODEL` / `ANTHROPIC_VOICE_MODEL` | Optional. Default `claude-opus-5-5` for both (Talk can use a faster model, e.g. `claude-haiku-5-5`). Requests use low effort and Anthropic's default fallback model if a safety check declines one. |
| `OPENAI_MODEL` | Optional. Defaults to `gpt-5-mini`. |
| `OPENAI_VOICE_MODEL` | Optional. The answer model for Talk calls; defaults to `gpt-4.1-mini` (faster than the chat model). |
| `OPENAI_TTS_VOICE` / `OPENAI_TTS_MODEL` | Optional, for Talk. Default voice `marin`, model `gpt-4o-mini-tts`. Talk costs roughly 2–3¢ a minute (transcription + the chat model + speech). |
| `PARENT_MESSAGES` | `test` (default): reminder and announcement emails/texts go to the `ADMIN_ALERT_*` test contact, and the portal only changes or invites GHL contacts tagged `portal-test` (portal invites for anyone else go to the test contact). `live`: they go to parents. |
| `PAID_STAGES` | Optional. Which opportunities count as paid, as `pipelineId:stageId,…`. Default: Paid (won) in **Winter Camp** (where Payment Received puts live payments) and **Winter Camp 2026** (test contacts). |
| `PAID_SINCE` | Optional `YYYY-MM-DD`. Only opportunities that reached Paid (won) on or after this date count (the pipeline holds earlier seasons too). Automatic invites also skip anyone who reached Paid (won) before it. |
| `AUTO_INVITE` | On by default: every 5 minutes, every contact whose Winter Camp 2026 opportunity is in Paid (won) (any product) gets "Your Blackmon Portal is ready" once (sets Portal - Role = Parent, Access Granted = Yes). With `PARENT_MESSAGES=test` a labelled copy goes to `ADMIN_ALERT_EMAIL` instead (except contacts tagged portal-test), and the parent still gets the real one at launch. `0` turns it off. Every send and skip is logged with the reason. |
| `ADMIN_ALERT_EMAIL` / `ADMIN_ALERT_PHONE` | Who gets the "talk to a person" email and SMS (a GHL contact tagged `portal-admin-alerts` is used or created). Test contact until launch; then Jordan's. |

Token permissions: View/Edit Contacts, View/Edit Opportunities, View Custom Values, View Custom Fields, Edit Conversation Messages, View/Edit Forms (for the video upload).

## Weekly content

Everything parents see about camp lives in `content/camp.json`; the portal reads it on every page load, and Ask Blackmon rebuilds its knowledge when it changes.

- **Camp info** and **This week** (admin sidebar): admins edit the Camp info page (overview, extended care, activities, sports, packages and prices, offers, transportation) and each location's week, with add / reorder / remove for list items. **Save and publish** writes `camp.json` straight away, so every parent sees it on their next page load. Each edit is checked against the current structure, the photo gallery is kept as is, the previous file is saved as `content/camp.previous.json` (one step of undo), and a save is refused if another admin saved in the meantime. Edits show in the activity log. View only users can look but not change.
- **Your own sections** (bottom of Camp info): admins add new sections (title, optional subtitle, text, bullet points). They show at the end of the parent Camp info page, and Ask Blackmon can answer from them.
- Still edited in the file by hand: the camp team, the daily schedule ("A day at camp") and the gallery photos.

## Before going live online

- Sign-in sessions (portal and admin) are kept in the database (`sessions` table, hashed ids), so restarting the server doesn't sign anyone out.
- It needs hosting with HTTPS (e.g. Render or Railway) before parents use it.
- Set `DEV_PRINT_CODES=0` so codes are emailed.
- Change `ADMIN_ALERT_EMAIL` / `ADMIN_ALERT_PHONE` from the test contact to Jordan's.
- Set `PARENT_MESSAGES=live` so reminders and announcements reach parents.
- Set `PORTAL_URL` to the https address (live invites are refused until it is), then `PARENT_MESSAGES=live`: automatic invites start reaching parents within 5 minutes.
- Waivers are GHL e-sign: publish **Portal – Send Enrollment Documents** (real templates) and **Portal – Parent Documents Signed** (sets E-Sign Status = Completed, which unlocks the dashboard).
