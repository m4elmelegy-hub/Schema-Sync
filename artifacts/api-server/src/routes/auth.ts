/**
 * /api/auth/* — Public login + protected "me" endpoint.
 * PIN validation happens here on the server — the frontend never compares PINs.
 * Login lockout: max 5 failed attempts → 15-minute lockout per userId.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, erpUsersTable, companiesTable } from "@workspace/db";
import { authenticate, signToken } from "../middleware/auth";

function daysRemaining(endDate: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(endDate); end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const router = Router();

/* ── In-memory lockout store ────────────────────────────────────────
   Structure: { userId → { attempts: number; lockedUntil: number | null } }
   This resets on server restart — sufficient for a single-instance server.
   For multi-instance deployments, move to Redis or DB.
──────────────────────────────────────────────────────────────────── */
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutes

interface LockoutEntry {
  attempts: number;
  lockedUntil: number | null;
}
const lockoutMap = new Map<number, LockoutEntry>();

function getLockout(userId: number): LockoutEntry {
  return lockoutMap.get(userId) ?? { attempts: 0, lockedUntil: null };
}

function recordFailure(userId: number): LockoutEntry {
  const entry = getLockout(userId);
  const now   = Date.now();

  /* reset if previous lockout has expired */
  if (entry.lockedUntil !== null && now >= entry.lockedUntil) {
    lockoutMap.set(userId, { attempts: 1, lockedUntil: null });
    return lockoutMap.get(userId)!;
  }

  const attempts = entry.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;
  lockoutMap.set(userId, { attempts, lockedUntil });
  return lockoutMap.get(userId)!;
}

function clearLockout(userId: number): void {
  lockoutMap.delete(userId);
}

/* ── GET /auth/users — public list for login UI (no PINs) ─ */
router.get("/auth/users", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id:       erpUsersTable.id,
        name:     erpUsersTable.name,
        username: erpUsersTable.username,
        role:     erpUsersTable.role,
        active:   erpUsersTable.active,
      })
      .from(erpUsersTable)
      .orderBy(erpUsersTable.id);

    const users = rows
      .filter((u) => u.active !== false)
      .map((u) => ({ ...u, pinLength: 4 })); // pinLength is a UI hint only (actual validation is server-side)

    res.json(users);
  } catch {
    res.status(500).json({ error: "فشل جلب المستخدمين" });
  }
});

/* ── POST /auth/login — validate PIN server-side, return JWT ─ */
router.post("/auth/login", async (req, res) => {
  try {
    const { userId, pin } = req.body as { userId?: number; pin?: string };

    if (!userId || !pin) {
      res.status(400).json({ error: "يلزم تحديد المستخدم والرقم السري" });
      return;
    }

    const uid = Number(userId);

    /* ── Lockout check ────────────────────────────────────── */
    const lockout = getLockout(uid);
    if (lockout.lockedUntil !== null && Date.now() < lockout.lockedUntil) {
      const remainingMs  = lockout.lockedUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      res.status(429).json({
        error: `تم تجميد الحساب مؤقتاً بسبب محاولات متكررة. انتظر ${remainingMin} دقيقة`,
      });
      return;
    }

    const [user] = await db
      .select()
      .from(erpUsersTable)
      .where(eq(erpUsersTable.id, uid));

    if (!user || !user.active) {
      res.status(401).json({ error: "الحساب غير موجود أو معطل" });
      return;
    }

    if (user.pin !== pin) {
      const updated = recordFailure(uid);
      const remaining = MAX_ATTEMPTS - updated.attempts;
      if (remaining <= 0) {
        res.status(429).json({
          error: `تم تجميد الحساب لمدة 15 دقيقة بسبب تجاوز عدد المحاولات المسموح بها`,
        });
      } else {
        res.status(401).json({
          error: `الرقم السري غير صحيح — تبقّى ${remaining} محاولة`,
        });
      }
      return;
    }

    /* ── Subscription check ───────────────────────────────── */
    if (user.company_id) {
      const [company] = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.id, user.company_id));

      if (company) {
        if (!company.is_active) {
          res.status(403).json({ error: "الاشتراك معطل — تواصل مع المدير" });
          return;
        }
        const days = daysRemaining(company.end_date);
        if (days < 0) {
          res.status(403).json({
            error: "انتهت صلاحية الاشتراك",
            expired: true,
            endDate: company.end_date,
          });
          return;
        }
      }
    }

    /* ── Block cashier/salesperson without warehouse or safe ─ */
    if ((user.role === "cashier" || user.role === "salesperson")) {
      if (!user.warehouse_id) {
        res.status(403).json({ error: "هذا الحساب غير مرتبط بفرع/مخزن — تواصل مع المدير" });
        return;
      }
      if (!user.safe_id) {
        res.status(403).json({ error: "هذا الحساب غير مرتبط بخزينة — تواصل مع المدير" });
        return;
      }
    }

    /* ── Success — clear lockout ──────────────────────────── */
    clearLockout(uid);

    const token = signToken(user.id, user.role);

    let parsedPerms: Record<string, boolean> = {};
    try { parsedPerms = JSON.parse(user.permissions ?? "{}") as Record<string, boolean>; } catch { /* ignore */ }

    res.json({
      token,
      user: {
        id:           user.id,
        name:         user.name,
        username:     user.username,
        role:         user.role,
        permissions:  parsedPerms,
        active:       user.active ?? true,
        warehouse_id: user.warehouse_id ?? null,
        safe_id:      user.safe_id ?? null,
      },
    });

  } catch {
    res.status(500).json({ error: "فشل تسجيل الدخول" });
  }
});

/* ── GET /auth/me — verify token + return fresh user data ─── */
router.get("/auth/me", authenticate, (req, res) => {
  const u = req.user!;
  let parsedPerms: Record<string, boolean> = {};
  try { parsedPerms = JSON.parse(u.permissions ?? "{}") as Record<string, boolean>; } catch { /* ignore */ }
  res.json({
    id:           u.id,
    name:         u.name,
    username:     u.username,
    role:         u.role,
    permissions:  parsedPerms,
    active:       u.active ?? true,
    warehouse_id: u.warehouse_id ?? null,
    safe_id:      u.safe_id ?? null,
  });
});

export default router;
