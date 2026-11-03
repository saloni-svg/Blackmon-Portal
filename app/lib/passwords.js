// Password hashing with Node's built-in scrypt. Stored as "scrypt$N$r$p$salt$hash" (base64),
// so the cost can be raised later without breaking existing hashes.

import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const [kind, n, r, p, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(String(password), Buffer.from(salt, "base64"), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

// Run when the email isn't found, so a wrong email takes as long as a wrong password.
const DUMMY = hashPassword(crypto.randomBytes(16).toString("hex"));
export async function burnTime(password) { await verifyPassword(password, await DUMMY); }
