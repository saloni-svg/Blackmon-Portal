// Field rules for the admin area. The browser and the server both import this file,
// so the two always check the same things (the server re-checks everything it receives).

export const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
export const STAFF_ROLES = ["Camp Staff", "Tutor"];
export const LOCATIONS = ["Plano", "Little Elm"];
export const ACCESS = { none: "No access", view: "View only", admin: "Admin" };

export const ID_PROOF = { maxBytes: 5 * 1024 * 1024, types: { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }, label: "PDF, JPG or PNG", accept: ".pdf,.jpg,.jpeg,.png" };
export const PHOTO = { maxBytes: 2 * 1024 * 1024, types: { "image/jpeg": "jpg", "image/png": "png" }, label: "JPG or PNG", accept: ".jpg,.jpeg,.png" };

// Letters (any language), with single spaces or hyphens between them. 2–50 characters.
const NAME = /^\p{L}+(?:[ -]\p{L}+)*$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns the phone in E.164 form (+14695550101) or null if it isn't a valid number.
// Numbers without a + get the default country code, +1 (US).
export function normalizePhone(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\+?[\d\s().-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : null;
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1" && /^[2-9]/.test(digits[1])) return `+${digits}`;
  return null;
}

export function nameError(v, label) {
  if (!v) return `Please enter a ${label}.`;
  if (v.length < 2 || v.length > 50) return `${label[0].toUpperCase() + label.slice(1)} must be 2 to 50 characters.`;
  if (!NAME.test(v)) return "Use letters only. Spaces and hyphens are OK between letters.";
  return null;
}

export function emailError(v) {
  if (!v) return "Please enter an email address.";
  if (!EMAIL.test(v) || v.length > 200) return "Please enter a valid email address.";
  return null;
}

export function passwordError(pw, email = "") {
  if (!pw) return "Please enter a password.";
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (email && pw.toLowerCase() === email.toLowerCase()) return "Don't use your email as your password.";
  return null;
}

const clean = (input, k) => String(input?.[k] ?? "").trim();

// Checks the staff form's text fields. Returns { values, errors } with normalized values and
// a message per invalid field (errors is empty when everything is valid).
export function validateStaff(input) {
  const values = {
    firstName: clean(input, "firstName").replace(/\s+/g, " "),
    lastName: clean(input, "lastName").replace(/\s+/g, " "),
    gender: clean(input, "gender"),
    email: clean(input, "email").toLowerCase(),
    phone: normalizePhone(clean(input, "phone")),
    role: clean(input, "role"),
    location: clean(input, "location"),
    access: clean(input, "access") || "none",
  };
  const errors = {};
  const set = (k, msg) => { if (msg) errors[k] = msg; };
  set("firstName", nameError(values.firstName, "first name"));
  set("lastName", nameError(values.lastName, "last name"));
  if (!GENDERS.includes(values.gender)) errors.gender = "Please choose a gender.";
  set("email", emailError(values.email));
  if (!clean(input, "phone")) errors.phone = "Please enter a phone number.";
  else if (!values.phone) errors.phone = "Please enter a valid phone number. US numbers can skip +1; others start with + and the country code.";
  if (!STAFF_ROLES.includes(values.role)) errors.role = "Please choose a role.";
  if (!LOCATIONS.includes(values.location)) errors.location = "Please choose a location.";
  if (!ACCESS[values.access]) errors.access = "Please choose a dashboard access level.";
  return { values, errors };
}

// Quick check on a file's name, declared type and size. The server also checks the file's
// actual contents, since the name and declared type can be faked.
export function fileError(file, rules, { required }) {
  if (!file || !file.size) return required ? "Please choose a file." : null;
  const ext = String(file.name || "").split(".").pop().toLowerCase().replace("jpeg", "jpg");
  if (!Object.values(rules.types).includes(ext) || (file.type && !rules.types[file.type])) return `Upload a ${rules.label} file.`;
  if (file.size > rules.maxBytes) return `That file is over ${rules.maxBytes / 1048576} MB. Please choose a smaller one.`;
  return null;
}

// ---------- waiver signing (parent portal) ----------
export const RELATIONSHIPS = ["Mother", "Father", "Legal guardian", "Grandparent", "Other"];
const PERSON = /^\p{L}[\p{L} .'’-]*$/u;

const personError = (v, label) => {
  if (!v) return `Please enter ${label}.`;
  if (v.length < 2 || v.length > 100) return `${label[0].toUpperCase() + label.slice(1)} must be 2 to 100 characters.`;
  if (!PERSON.test(v)) return "Use letters only (spaces, hyphens, apostrophes and periods are OK).";
  return null;
};

// Checks the waiver sign form. Returns { values, errors } like validateStaff.
export function validateSignature(input) {
  const clean = (k) => String(input?.[k] ?? "").trim().replace(/\s+/g, " ");
  const values = { parentName: clean("parentName"), childName: clean("childName"), relationship: clean("relationship"), signature: clean("signature") };
  const errors = {};
  const set = (k, msg) => { if (msg) errors[k] = msg; };
  set("parentName", personError(values.parentName, "your full name"));
  set("childName", personError(values.childName, "your child's name"));
  if (!RELATIONSHIPS.includes(values.relationship)) errors.relationship = "Please choose your relationship to the child.";
  set("signature", personError(values.signature, "your signature (type your full name)"));
  if (input?.agree !== true && input?.agree !== "on" && input?.agree !== "true") errors.agree = "Please confirm you have read and agree to this document.";
  return { values, errors };
}

// Camp staff training acknowledgment: their typed signature and the agreement box.
export function validateAcknowledgment(input) {
  const values = { signature: String(input?.signature ?? "").trim().replace(/\s+/g, " ") };
  const errors = {};
  const sig = personError(values.signature, "your signature (type your full name)");
  if (sig) errors.signature = sig;
  if (input?.agree !== true && input?.agree !== "on" && input?.agree !== "true") errors.agree = "Please confirm you have read and agree to the acknowledgment.";
  return { values, errors };
}
