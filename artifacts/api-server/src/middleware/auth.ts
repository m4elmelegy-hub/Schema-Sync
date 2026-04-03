import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, erpUsersTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

if (!process.env.JWT_SECRET) {
  throw new Error("[FATAL] JWT_SECRET environment variable is not set. Server cannot start securely.");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: string;
  permissions: string;
  active: boolean | null;
}

/* Extend Express Request */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/* ── Sign a new JWT for a user ─────────────────────────── */
export function signToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "12h" });
}

/* ── Verify JWT and attach user from DB ─────────────────── */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح: يلزم تسجيل الدخول أولاً" });
    return;
  }

  const token = auth.slice(7);
  let payload: { userId: number; role: string };

  try {
    payload = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
  } catch {
    res.status(401).json({ error: "الجلسة منتهية، يرجى تسجيل الدخول مجدداً" });
    return;
  }

  /* Always re-read from DB — never trust the token's role alone */
  const [user] = await db
    .select()
    .from(erpUsersTable)
    .where(eq(erpUsersTable.id, payload.userId));

  if (!user || !user.active) {
    res.status(401).json({ error: "الحساب غير موجود أو معطل" });
    return;
  }

  if (user.company_id) {
    const [co] = await db
      .select({ is_active: companiesTable.is_active, end_date: companiesTable.end_date })
      .from(companiesTable)
      .where(eq(companiesTable.id, user.company_id));
    if (co) {
      if (!co.is_active) {
        res.status(403).json({ error: "الاشتراك موقوف — يرجى التواصل مع المدير" });
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (co.end_date < today) {
        res.status(403).json({ error: "انتهت صلاحية الاشتراك — يرجى تجديد الاشتراك" });
        return;
      }
    }
  }

  req.user = user as AuthUser;
  next();
}

/* ── Role guard factory ─────────────────────────────────── */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح: يلزم تسجيل الدخول أولاً" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `ليس لديك صلاحية — يتطلب: ${roles.join(" أو ")}`,
        required: roles,
        yourRole: req.user.role,
      });
      return;
    }
    next();
  };
}

/* ── Convenience combos ─────────────────────────────────── */
export const adminOnly    = [authenticate, requireRole("admin")] as const;
export const managerUp    = [authenticate, requireRole("admin", "manager")] as const;
export const anyAuth      = [authenticate] as const;
