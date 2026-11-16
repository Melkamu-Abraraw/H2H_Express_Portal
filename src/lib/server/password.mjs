import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Passwords are stored as "scrypt$N$r$p$salt$hash" so the cost can be raised later without
// breaking existing hashes. Plain .mjs so scripts/create-user.mjs can import it under Node too.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

function derive(password, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Returns a message for a password that can't be used, or "" when it's fine.
export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return "";
}
