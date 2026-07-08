import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;

export function generateInitialPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");

  const hash = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN)
    .toString("base64url");

  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [method, salt, hash] = storedHash.split("$");

  if (method !== "scrypt" || !salt || !hash) {
    return false;
  }

  const calculated = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN)
    .toString("base64url");

  const calculatedBuffer = Buffer.from(calculated);
  const hashBuffer = Buffer.from(hash);

  if (calculatedBuffer.length !== hashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedBuffer, hashBuffer);
}
