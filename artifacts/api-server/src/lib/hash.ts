/**
 * hash.ts — PIN hashing helpers using bcryptjs (pure-JS, no native build required)
 *
 * BCRYPT_ROUNDS = 10 is the production-standard balance of security vs speed.
 * A bcrypt hash is always 60 chars, so we can detect unhashed PINs (< 60 chars).
 */

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

/** Hash a plain-text PIN. Always use this before persisting. */
export async function hashPin(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Compare a plain-text PIN against a stored value.
 * Handles both hashed PINs (bcrypt, 60 chars) and legacy plain-text PINs
 * so the migration can happen transparently at first login.
 */
export async function verifyPin(plain: string, stored: string): Promise<boolean> {
  if (!plain || !stored) return false;

  /* bcrypt hashes are always exactly 60 chars and start with $2b$ or $2a$ */
  if (stored.length >= 60 && stored.startsWith("$2")) {
    return bcrypt.compare(plain, stored);
  }

  /* Legacy plain-text comparison (only used during migration window) */
  return plain === stored;
}

/** Returns true if the stored value is already a bcrypt hash. */
export function isHashed(stored: string): boolean {
  return stored.length >= 60 && stored.startsWith("$2");
}
