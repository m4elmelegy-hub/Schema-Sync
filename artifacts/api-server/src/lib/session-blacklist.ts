/**
 * In-memory token blacklist for immediate logout / session revocation.
 * Resets on server restart — sufficient for single-instance MVP.
 * For multi-instance: replace with Redis SET with TTL.
 */

const blacklistedTokens = new Set<string>();

/** Add a token to the blacklist. Auto-removes after its remaining TTL (max 4h). */
export function blacklistToken(token: string, ttlMs = 4 * 60 * 60 * 1000): void {
  blacklistedTokens.add(token);
  setTimeout(() => blacklistedTokens.delete(token), ttlMs);
}

/** Returns true if the token has been explicitly revoked. */
export function isTokenBlacklisted(token: string): boolean {
  return blacklistedTokens.has(token);
}
