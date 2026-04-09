/**
 * /api/auth/* — Public login + protected "me" endpoint.
 * PIN validation happens here on the server — the frontend never compares PINs.
 * Login lockout: max 5 failed attempts → 15-minute lockout per userId.
 */
import { Router } from "express";
import { eq, and, ne } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { db, erpUsersTable, companiesTable } from "@workspace/db";
import { authenticate, signToken, signRefreshToken, verifyRefreshToken } from "../middleware/auth";
import { blacklistToken } from "../lib/session-blacklist";
import { generateTOTPSecret, generateQRCode, verifyTOTP, encryptSecret, decryptSecret, isEncrypted } from "../lib/totp";
import { verifyPin, hashPin } from "../lib/hash";
import { loginSchema, validate } from "../lib/schemas";

const JWT_SECRET: string = process.env.JWT_SECRET!;

/* ── 2FA brute-force protection ─────────────────────────────────
   Max 5 attempts per IP per 15-minute window.
──────────────────────────────────────────────────────────────── */
interface TwoFaAttemptRecord { count: number; resetAt: number }
const twoFaAttempts = new Map<string, TwoFaAttemptRecord>();

function check2FAAttempts(ip: string): boolean {
  const now    = Date.now();
  const record = twoFaAttempts.get(ip);
  if (record && now < record.resetAt) {
    if (record.count >= 5) return false; // blocked
    record.count++;
  } else {
    twoFaAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  }
  return true;
}

function reset2FAAttempts(ip: string): void {
  twoFaAttempts.delete(ip);
}

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
router.get("/auth/users", async (req, res) => {
  try {
    const companyId = req.query.company_id ? parseInt(String(req.query.company_id)) : null;
    if (!companyId || isNaN(companyId)) {
      res.status(400).json({ error: "company_id مطلوب للوصول إلى قائمة المستخدمين" });
      return;
    }

    const rows = await db
      .select({
        id:       erpUsersTable.id,
        name:     erpUsersTable.name,
        username: erpUsersTable.username,
        role:     erpUsersTable.role,
        active:   erpUsersTable.active,
      })
      .from(erpUsersTable)
      .where(
        and(
          eq(erpUsersTable.company_id, companyId),
          ne(erpUsersTable.role, "super_admin"),
        )
      )
      .orderBy(erpUsersTable.id);

    const users = rows
      .filter((u) => u.active !== false)
      .map((u) => ({ ...u, pinLength: 4 }));

    res.json(users);
  } catch {
    res.status(500).json({ error: "فشل جلب المستخدمين" });
  }
});

/* ── POST /auth/login — validate PIN server-side, return JWT ─ */
router.post("/auth/login", async (req, res) => {
  try {
    /* Zod validation */
    const v = validate(loginSchema, req.body);
    if (!v.success) {
      res.status(400).json({ error: "بيانات غير صحيحة", details: v.errors });
      return;
    }
    const { userId, pin } = v.data;
    const uid = userId;

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

    const pinValid = await verifyPin(pin, user.pin ?? "");
    if (!pinValid) {
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

    /* ── Lazy re-hash: if PIN was plain-text, upgrade it now ── */
    if (user.pin && !user.pin.startsWith("$2")) {
      try {
        const hashed = await hashPin(pin);
        await db.update(erpUsersTable).set({ pin: hashed }).where(eq(erpUsersTable.id, uid));
      } catch { /* non-fatal */ }
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

    /* ── 2FA check for super_admin ────────────────────────── */
    if (user.totp_enabled && user.role === "super_admin") {
      const tempToken = jwt.sign(
        { userId: user.id, requires_2fa: true },
        JWT_SECRET,
        { expiresIn: "5m" },
      );
      res.json({
        requires_2fa: true,
        temp_token:   tempToken,
        message:      "أدخل رمز التحقق من تطبيق المصادقة",
      });
      return;
    }

    const token        = signToken(user.id, user.role, user.company_id ?? null);
    const refreshToken = signRefreshToken(user.id);

    let parsedPerms: Record<string, boolean> = {};
    try { parsedPerms = JSON.parse(user.permissions ?? "{}") as Record<string, boolean>; } catch { /* ignore */ }

    res.json({
      token,
      refreshToken,
      user: {
        id:           user.id,
        name:         user.name,
        username:     user.username,
        role:         user.role,
        permissions:  parsedPerms,
        active:       user.active ?? true,
        warehouse_id: user.warehouse_id ?? null,
        safe_id:      user.safe_id ?? null,
        company_id:   user.company_id ?? null,
      },
    });

  } catch {
    res.status(500).json({ error: "فشل تسجيل الدخول" });
  }
});

/* ── POST /auth/refresh — exchange refresh token for new access token ─ */
router.post("/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ error: "refresh token مطلوب" });
      return;
    }
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      res.status(401).json({ error: "refresh token غير صالح أو منتهي الصلاحية" });
      return;
    }
    const [user] = await db
      .select()
      .from(erpUsersTable)
      .where(and(eq(erpUsersTable.id, payload.userId), eq(erpUsersTable.active, true)));
    if (!user) {
      res.status(401).json({ error: "المستخدم غير موجود أو موقوف" });
      return;
    }
    const newToken = signToken(user.id, user.role, user.company_id ?? null);
    res.json({ token: newToken });
  } catch {
    res.status(500).json({ error: "فشل تجديد الجلسة" });
  }
});

/* ── GET /auth/subscription — subscription status for current company ─ */
router.get("/auth/subscription", authenticate, async (req, res) => {
  try {
    if (req.role === "super_admin") {
      res.json({ unlimited: true });
      return;
    }
    const companyId = req.companyId;
    if (!companyId) {
      res.json({ unlimited: true });
      return;
    }
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId));
    if (!company) {
      res.status(404).json({ error: "الشركة غير موجودة" });
      return;
    }
    const days = daysRemaining(company.end_date);
    res.json({
      plan_type:         company.plan_type,
      end_date:          company.end_date,
      days_left:         days,
      company_name:      company.name,
      is_active:         company.is_active,
      is_expiring_soon:  days <= 14 && days > 0,
      is_expired:        days <= 0,
    });
  } catch {
    res.status(500).json({ error: "فشل جلب بيانات الاشتراك" });
  }
});

/* ── POST /auth/logout — blacklist the current access token ─── */
router.post("/auth/logout", authenticate, (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) blacklistToken(token);
  res.json({ success: true, message: "تم تسجيل الخروج بنجاح" });
});

/* ── GET /auth/2fa/setup — generate TOTP secret + QR for super_admin ─── */
router.get("/auth/2fa/setup", authenticate, async (req, res) => {
  try {
    if (req.user?.role !== "super_admin") {
      res.status(403).json({ error: "للمسؤول العام فقط" }); return;
    }
    const [user] = await db.select().from(erpUsersTable).where(eq(erpUsersTable.id, req.user.id)).limit(1);
    if (user?.totp_enabled) {
      res.status(400).json({ error: "المصادقة الثنائية مفعلة بالفعل" }); return;
    }
    const { secret, otpauth_url } = generateTOTPSecret(user!.username);
    const qrCode = await generateQRCode(otpauth_url);
    await db.update(erpUsersTable).set({ totp_secret: encryptSecret(secret), totp_verified: false }).where(eq(erpUsersTable.id, req.user.id));
    res.json({ qr_code: qrCode, secret, message: "امسح الـ QR Code بتطبيق Google Authenticator أو Authy" });
  } catch {
    res.status(500).json({ error: "فشل إعداد المصادقة الثنائية" });
  }
});

/* ── POST /auth/2fa/verify — confirm TOTP setup, enable 2FA ─── */
router.post("/auth/2fa/verify", authenticate, async (req, res) => {
  try {
    if (req.user?.role !== "super_admin") {
      res.status(403).json({ error: "للمسؤول العام فقط" }); return;
    }
    const { token } = req.body as { token?: string };
    if (!token) { res.status(400).json({ error: "رمز التحقق مطلوب" }); return; }
    const [user] = await db.select().from(erpUsersTable).where(eq(erpUsersTable.id, req.user.id)).limit(1);
    if (!user?.totp_secret) { res.status(400).json({ error: "يجب إعداد 2FA أولاً" }); return; }
    const rawSecret = isEncrypted(user.totp_secret) ? decryptSecret(user.totp_secret) : user.totp_secret;
    if (!verifyTOTP(rawSecret, token)) {
      res.status(400).json({ error: "رمز التحقق غير صحيح" }); return;
    }
    await db.update(erpUsersTable).set({ totp_enabled: true, totp_verified: true }).where(eq(erpUsersTable.id, req.user.id));
    res.json({ success: true, message: "تم تفعيل المصادقة الثنائية بنجاح ✅" });
  } catch {
    res.status(500).json({ error: "فشل التحقق" });
  }
});

/* ── POST /auth/2fa/disable — disable 2FA (requires valid TOTP) ─── */
router.post("/auth/2fa/disable", authenticate, async (req, res) => {
  try {
    if (req.user?.role !== "super_admin") {
      res.status(403).json({ error: "للمسؤول العام فقط" }); return;
    }
    const { token } = req.body as { token?: string };
    if (!token) { res.status(400).json({ error: "رمز التحقق مطلوب" }); return; }
    const [user] = await db.select().from(erpUsersTable).where(eq(erpUsersTable.id, req.user.id)).limit(1);
    if (!user?.totp_enabled) { res.status(400).json({ error: "المصادقة الثنائية غير مفعلة" }); return; }
    const rawSecret2 = isEncrypted(user.totp_secret!) ? decryptSecret(user.totp_secret!) : user.totp_secret!;
    if (!verifyTOTP(rawSecret2, token)) {
      res.status(400).json({ error: "رمز التحقق غير صحيح" }); return;
    }
    await db.update(erpUsersTable).set({ totp_enabled: false, totp_secret: null, totp_verified: false }).where(eq(erpUsersTable.id, req.user.id));
    res.json({ success: true, message: "تم إيقاف المصادقة الثنائية" });
  } catch {
    res.status(500).json({ error: "فشل إيقاف المصادقة الثنائية" });
  }
});

/* ── GET /auth/2fa/status — check if 2FA is enabled for current user ─── */
router.get("/auth/2fa/status", authenticate, async (req, res) => {
  try {
    const [user] = await db.select({ totp_enabled: erpUsersTable.totp_enabled }).from(erpUsersTable).where(eq(erpUsersTable.id, req.user!.id)).limit(1);
    res.json({ totp_enabled: user?.totp_enabled ?? false });
  } catch {
    res.status(500).json({ error: "فشل جلب حالة 2FA" });
  }
});

/* ── POST /auth/2fa/login — complete login after TOTP check ─── */
router.post("/auth/2fa/login", async (req, res) => {
  try {
    /* ── Brute-force guard: max 5 attempts / IP / 15 min ── */
    const clientIP = req.ip || req.socket.remoteAddress || "unknown";
    if (!check2FAAttempts(clientIP)) {
      res.status(429).json({ error: "محاولات كثيرة — انتظر 15 دقيقة", retry_after: 900 }); return;
    }

    const { temp_token, totp_code } = req.body as { temp_token?: string; totp_code?: string };
    if (!temp_token || !totp_code) {
      res.status(400).json({ error: "البيانات ناقصة" }); return;
    }
    let payload: { userId: number; requires_2fa: boolean };
    try {
      payload = jwt.verify(temp_token, JWT_SECRET) as typeof payload;
    } catch {
      res.status(401).json({ error: "انتهت صلاحية الجلسة، أعد تسجيل الدخول" }); return;
    }
    if (!payload.requires_2fa) { res.status(400).json({ error: "طلب غير صالح" }); return; }
    const [user] = await db.select().from(erpUsersTable).where(eq(erpUsersTable.id, payload.userId)).limit(1);
    if (!user?.totp_secret) { res.status(401).json({ error: "خطأ في البيانات" }); return; }

    /* Decrypt before verifying */
    const rawSecret = isEncrypted(user.totp_secret) ? decryptSecret(user.totp_secret) : user.totp_secret;
    if (!verifyTOTP(rawSecret, totp_code)) {
      res.status(401).json({ error: "رمز التحقق غير صحيح أو منتهي" }); return;
    }

    /* Success — clear attempts counter */
    reset2FAAttempts(clientIP);

    const token        = signToken(user.id, user.role, user.company_id ?? null);
    const refreshToken = signRefreshToken(user.id);
    res.json({
      token, refreshToken,
      user: { id: user.id, name: user.name, username: user.username, role: user.role, company_id: user.company_id },
    });
  } catch {
    res.status(500).json({ error: "فشل إتمام تسجيل الدخول" });
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

/* ── POST /auth/register — SaaS: register new company + first admin ─ */
router.post("/auth/register", async (req, res) => {
  try {
    const { company_name, admin_name, email, password } = req.body as {
      company_name?: string; admin_name?: string; email?: string; password?: string;
    };

    if (!company_name?.trim())
      { res.status(400).json({ error: "اسم الشركة مطلوب" }); return; }
    if (!admin_name?.trim())
      { res.status(400).json({ error: "اسم المسؤول مطلوب" }); return; }
    if (!email?.trim() || !email.includes("@"))
      { res.status(400).json({ error: "بريد إلكتروني صحيح مطلوب" }); return; }
    if (!password || password.length < 6)
      { res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return; }

    const normalEmail = email.toLowerCase().trim();

    /* Check duplicate email */
    const [existing] = await db
      .select({ id: erpUsersTable.id })
      .from(erpUsersTable)
      .where(eq(erpUsersTable.email, normalEmail));
    if (existing)
      { res.status(409).json({ error: "البريد الإلكتروني مستخدم بالفعل" }); return; }

    /* Create company — trial 7 days */
    const today    = new Date();
    const trialEnd = new Date(today);
    trialEnd.setDate(trialEnd.getDate() + 7);

    const [company] = await db
      .insert(companiesTable)
      .values({
        name:        company_name.trim(),
        plan_type:   "trial",
        start_date:  today.toISOString().slice(0, 10),
        end_date:    trialEnd.toISOString().slice(0, 10),
        is_active:   true,
        admin_email: normalEmail,
      })
      .returning();

    /* Create first admin user */
    const baseUsername = normalEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") || "admin";
    const username     = `${baseUsername}_${company.id}`;
    const hashedPw     = await hashPin(password);

    const [user] = await db
      .insert(erpUsersTable)
      .values({
        name:       admin_name.trim(),
        username,
        email:      normalEmail,
        pin:        hashedPw,
        role:       "admin",
        active:     true,
        company_id: company.id,
        permissions: "{}",
      })
      .returning();

    const token = signToken(user.id, user.role, user.company_id ?? null);

    res.status(201).json({
      token,
      user: {
        id:           user.id,
        name:         user.name,
        username:     user.username,
        role:         user.role,
        permissions:  {},
        active:       true,
        warehouse_id: null,
        safe_id:      null,
      },
      company: {
        id:        company.id,
        name:      company.name,
        plan_type: company.plan_type,
        end_date:  company.end_date,
        daysRemaining: 7,
      },
    });
  } catch {
    res.status(500).json({ error: "فشل إنشاء الحساب — حاول مجدداً" });
  }
});

/* ── POST /auth/login/email — email + password SaaS login ─── */
router.post("/auth/login/email", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !email.includes("@"))
      { res.status(400).json({ error: "بريد إلكتروني صحيح مطلوب" }); return; }
    if (!password)
      { res.status(400).json({ error: "كلمة المرور مطلوبة" }); return; }

    const normalEmail = email.toLowerCase().trim();

    const [user] = await db
      .select()
      .from(erpUsersTable)
      .where(eq(erpUsersTable.email, normalEmail));

    if (!user || user.active === false)
      { res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }); return; }

    /* Lockout check using email-based key */
    const lockout = getLockout(user.id);
    if (lockout.lockedUntil !== null && Date.now() < lockout.lockedUntil) {
      const remaining = Math.ceil((lockout.lockedUntil - Date.now()) / 60000);
      res.status(429).json({ error: `تم تجميد الحساب. انتظر ${remaining} دقيقة` });
      return;
    }

    const valid = await verifyPin(password, user.pin ?? "");
    if (!valid) {
      const updated = recordFailure(user.id);
      const rem = MAX_ATTEMPTS - updated.attempts;
      res.status(401).json({
        error: rem > 0
          ? `كلمة المرور غير صحيحة — تبقّى ${rem} محاولة`
          : "تم تجميد الحساب لمدة 15 دقيقة",
      });
      return;
    }

    /* Subscription check */
    if (user.company_id) {
      const [company] = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.id, user.company_id));
      if (company) {
        if (!company.is_active)
          { res.status(403).json({ error: "الاشتراك معطل — تواصل مع المدير", suspended: true }); return; }
        const days = daysRemaining(company.end_date);
        if (days < 0)
          { res.status(403).json({ error: "انتهت صلاحية الاشتراك", expired: true, endDate: company.end_date }); return; }
      }
    }

    clearLockout(user.id);
    const token = signToken(user.id, user.role, user.company_id ?? null);
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
        company_id:   user.company_id ?? null,
      },
    });
  } catch {
    res.status(500).json({ error: "فشل تسجيل الدخول" });
  }
});

export default router;
