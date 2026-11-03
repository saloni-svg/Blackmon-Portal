// Camp staff Training Acknowledgment: signed in the portal after the staff member passes the
// knowledge assessment. The signed copy is the original form (documents/Blackmon_Staff_Training_
// Acknowledgment.pdf) with their name, role, location, training completion date, assessment score,
// signature and date written onto it, plus the portal's signature record page. The Supervisor
// review and Additional training sections are left blank for the camp director to complete.
// Signing notifies the admin dashboard, where the signed PDF can be opened.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { addSignaturePage, readDrawing, latin1, central } from "./documents.js";
import { validateAcknowledgment } from "../public/validate.js";

export const ACK_TITLE = "Staff Training Acknowledgment";
const ACK_FILE = "Blackmon_Staff_Training_Acknowledgment.pdf";
// The acknowledgment statement, word for word from the form.
export const ACK_STATEMENT = [
  "I acknowledge that I have completed the Blackmon Tutoring Camp Counselor Training Program and understand that I am responsible for actively supervising the children assigned to me, following child-safety and emergency procedures, maintaining professional boundaries, and reporting safety concerns promptly.",
  "I understand that internal notification does not automatically satisfy an individual legal reporting obligation.",
  "I will not perform duties for which I lack the required authorization, training, or certification. I will ask my supervisor for clarification whenever I am uncertain about a safety procedure.",
  "I understand that this acknowledgment and the training video do not replace applicable legal requirements, background checks, licenses, certifications, or site-specific instruction.",
];

const httpError = (status, message, fields) => Object.assign(new Error(message), { httpStatus: status, fields });
const longDate = (d) => d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" });

// Writes the staff member's details and signature onto the blank lines of the form (page 1, US Letter).
async function fillForm(pdf, d) {
  const page = pdf.getPage(0);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const navy = rgb(0.043, 0.122, 0.247);
  const put = (s, x, y, size = 11, font = reg, maxWidth = 220) => {
    let t = latin1(s);
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -1);
    page.drawText(t, { x, y, size, font, color: navy });
  };
  put(d.name, 56, 598, 12, reg, 240);
  put(d.role, 318, 598, 12);
  put(d.location, 56, 546, 12, reg, 220);
  put(d.trainingDate, 288, 546, 11, reg, 150);
  put(d.score, 446, 546, 11, reg, 110);
  // Staff signature line: the drawn signature if they drew one, otherwise the typed one.
  if (d.drawing) {
    const img = await pdf.embedPng(d.drawing);
    const scale = Math.min(200 / img.width, 21 / img.height); // stays below the STAFF SIGNATURE label
    page.drawImage(img, { x: 56, y: 286, width: img.width * scale, height: img.height * scale });
  } else {
    put(d.signature, 56, 290, 18, script, 330);
  }
  put(d.signedDate, 409, 290, 11, reg, 140);
}

export function createAcknowledgments({ db, root, base, notify, store }) {
  const original = path.join(root, "documents", ACK_FILE);
  const signedDir = path.join(base, "signed");
  fs.mkdirSync(signedDir, { recursive: true });
  if (!fs.existsSync(original)) console.error(`\n  DOCUMENT FILE MISSING: the ${ACK_TITLE} expects app/documents/${ACK_FILE}.\n`);

  const view = (r) => r && { id: r.id, name: r.name, email: r.email, role: r.role, location: r.location, trainingDate: r.training_date,
    score: r.score, signature: r.typed_signature, signedAt: r.signed_at };
  const row = (contactId) => db.prepare("SELECT * FROM staff_acknowledgments WHERE contact_id = ?").get(contactId);

  return {
    signed(contactId) { return view(row(contactId)); },
    // details: { name, role, location, trainingDate, score } as they go on the form.
    async sign(contact, details, input, { ip, userAgent }) {
      if (row(contact.id)) throw httpError(409, "You've already signed the acknowledgment.");
      const { values, errors } = validateAcknowledgment(input);
      let drawing = null;
      try { drawing = readDrawing(input?.drawing); } catch (err) { Object.assign(errors, err.fields); }
      if (Object.keys(errors).length) throw httpError(400, "Please fix the highlighted fields.", errors);

      const id = crypto.randomUUID(), signedAt = new Date();
      const pdf = await PDFDocument.load(await fs.promises.readFile(original), { ignoreEncryption: true });
      await fillForm(pdf, { ...details, signature: values.signature, drawing, signedDate: longDate(signedAt) });
      await addSignaturePage(pdf, {
        title: ACK_TITLE, signature: values.signature, drawing, signedAt,
        agree: "I have read and agree to the acknowledgment statement.",
        footer: "The page before it is the original form, filled in with the details above. Supervisor review is left blank for the camp director.",
        rows: [
          ["Document", ACK_TITLE],
          ["Signed by (staff member)", details.name],
          ["Role", details.role],
          ["Camp location", details.location || "Not set"],
          ["Email", contact.email],
          ["Training completed", details.trainingDate || "Not recorded"],
          ["Assessment score", details.score || "Not recorded"],
          ["Signed on", central(signedAt)],
          ["Signed at (UTC)", signedAt.toISOString()],
          ["IP address", ip || "unknown"],
          ["Browser / device", (userAgent || "unknown").slice(0, 80)],
          ["Record ID", id],
        ],
      });
      const fileName = `ack-${id}.pdf`;
      await fs.promises.writeFile(path.join(signedDir, fileName), Buffer.from(await pdf.save()), { flag: "wx", mode: 0o600 });
      try {
        db.prepare(`INSERT INTO staff_acknowledgments (id, contact_id, email, name, role, location, training_date, score, typed_signature,
          has_drawing, ip, user_agent, signed_at, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, contact.id, contact.email, details.name, details.role, details.location || "", details.trainingDate || "", details.score || "",
            values.signature, drawing ? 1 : 0, ip || null, String(userAgent || "").slice(0, 300), signedAt.toISOString(), fileName);
      } catch (err) {
        await fs.promises.unlink(path.join(signedDir, fileName)).catch(() => {});
        if (/UNIQUE constraint failed/.test(err.message)) throw httpError(409, "You've already signed the acknowledgment.");
        throw err;
      }
      notify("acknowledgment_signed", `${details.name} signed the ${ACK_TITLE}`, { signatureId: id });
      db.prepare("INSERT INTO activity_log (at, user_id, user_name, action, target, details) VALUES (?, NULL, ?, ?, ?, ?)")
        .run(signedAt.toISOString(), details.name, "Signed training acknowledgment", ACK_TITLE, `${contact.email} · assessment ${details.score}`);
      // A note on their GHL contact, best effort (the signed PDF itself stays in the portal).
      store.addNote(contact.id, `Signed the ${ACK_TITLE} on ${central(signedAt)} in the Blackmon Portal (assessment score ${details.score}). The signed copy is stored in the portal admin dashboard.`)
        .catch((err) => console.error(`  Couldn't add the GHL note for ${contact.email}: ${err.message}`));
      return view(row(contact.id));
    },
    // The signed PDF, by contact (staff) or by acknowledgment id (admins).
    file(contactId) { const r = row(contactId); return r && { file: path.join(signedDir, r.file_path), name: `training-acknowledgment-signed-${r.signed_at.slice(0, 10)}.pdf` }; },
    fileById(id) { const r = db.prepare("SELECT * FROM staff_acknowledgments WHERE id = ?").get(id); return r && { file: path.join(signedDir, r.file_path), name: `training-acknowledgment-${r.name.replace(/[^\w]+/g, "-")}-${r.signed_at.slice(0, 10)}.pdf` }; },
    // Every acknowledgment by email (lowercased), for the admin pages.
    byEmail() { return new Map(db.prepare("SELECT * FROM staff_acknowledgments").all().map((r) => [r.email.toLowerCase(), view(r)])); },
  };
}
