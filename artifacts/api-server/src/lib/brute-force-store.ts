/**
 * brute-force-store.ts
 *
 * مخزن مقاومة Brute Force يدعم Redis وينتقل تلقائياً إلى الذاكرة
 * عند عدم توفر REDIS_URL.
 *
 * Redis: آمن في بيئات متعددة الخوادم (multi-instance / load-balanced)
 * In-Memory: كافٍ لخادم واحد (single-instance)
 */

import { logger } from "./logger";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SEC  = 15 * 60;        // 15 دقيقة
const LOCKOUT_MS   = LOCKOUT_SEC * 1000;

/* ── نوع السجل ────────────────────────────────────────────── */
export interface LockoutEntry {
  attempts: number;
  lockedUntil: number | null;
}

/* ═══════════════════════════════════════════════════════════
 * Redis-backed implementation
 * ══════════════════════════════════════════════════════════= */
let redis: import("ioredis").Redis | null = null;

if (process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    redis.on("error", (err: Error) => {
      logger.warn({ err }, "[BruteForce] Redis error — falling back to in-memory for new requests");
      redis = null;
    });

    await redis.ping();
    logger.info("[BruteForce] Connected to Redis — brute force store is distributed");
  } catch (err) {
    logger.warn({ err }, "[BruteForce] Redis unavailable — using in-memory fallback");
    redis = null;
  }
} else {
  logger.info("[BruteForce] REDIS_URL not set — using in-memory store (single-instance only)");
}

/* ── مفاتيح Redis ─────────────────────────────────────────── */
const loginKey   = (userId: number) => `bf:login:${userId}`;
const twoFaKey   = (ip: string)     => `bf:2fa:${ip}`;

/* ═══════════════════════════════════════════════════════════
 * In-Memory fallback
 * ══════════════════════════════════════════════════════════= */
const memLoginMap  = new Map<number, LockoutEntry>();
const memTwoFaMap  = new Map<string, { count: number; resetAt: number }>();

/* ═══════════════════════════════════════════════════════════
 * LOGIN LOCKOUT API
 * ══════════════════════════════════════════════════════════= */

export async function getLoginLockout(userId: number): Promise<LockoutEntry> {
  if (redis) {
    try {
      const raw = await redis.get(loginKey(userId));
      if (!raw) return { attempts: 0, lockedUntil: null };
      return JSON.parse(raw) as LockoutEntry;
    } catch { /* fall through to memory */ }
  }
  return memLoginMap.get(userId) ?? { attempts: 0, lockedUntil: null };
}

export async function recordLoginFailure(userId: number): Promise<LockoutEntry> {
  const now   = Date.now();
  const entry = await getLoginLockout(userId);

  let updated: LockoutEntry;

  if (entry.lockedUntil !== null && now >= entry.lockedUntil) {
    updated = { attempts: 1, lockedUntil: null };
  } else {
    const attempts   = entry.attempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;
    updated = { attempts, lockedUntil };
  }

  if (redis) {
    try {
      await redis.set(loginKey(userId), JSON.stringify(updated), "EX", LOCKOUT_SEC * 2);
      return updated;
    } catch { /* fall through to memory */ }
  }
  memLoginMap.set(userId, updated);
  return updated;
}

export async function clearLoginLockout(userId: number): Promise<void> {
  if (redis) {
    try { await redis.del(loginKey(userId)); return; } catch { /* fall through */ }
  }
  memLoginMap.delete(userId);
}

/* ═══════════════════════════════════════════════════════════
 * 2FA LOCKOUT API
 * ══════════════════════════════════════════════════════════= */

export async function check2FAAllowed(ip: string): Promise<boolean> {
  const now = Date.now();

  if (redis) {
    try {
      const countStr = await redis.get(twoFaKey(ip));
      const count    = parseInt(countStr ?? "0", 10);
      if (count >= MAX_ATTEMPTS) return false;
      await redis.multi()
        .incr(twoFaKey(ip))
        .expire(twoFaKey(ip), LOCKOUT_SEC)
        .exec();
      return true;
    } catch { /* fall through to memory */ }
  }

  const rec = memTwoFaMap.get(ip);
  if (rec && now < rec.resetAt) {
    if (rec.count >= MAX_ATTEMPTS) return false;
    rec.count++;
    return true;
  }
  memTwoFaMap.set(ip, { count: 1, resetAt: now + LOCKOUT_MS });
  return true;
}

export async function reset2FALockout(ip: string): Promise<void> {
  if (redis) {
    try { await redis.del(twoFaKey(ip)); return; } catch { /* fall through */ }
  }
  memTwoFaMap.delete(ip);
}

export { MAX_ATTEMPTS, LOCKOUT_MS };
