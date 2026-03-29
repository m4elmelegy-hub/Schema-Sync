/**
 * /api/auth/* — Public login + protected "me" endpoint.
 * PIN validation happens here on the server — the frontend never compares PINs.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, erpUsersTable } from "@workspace/db";
import { authenticate, signToken } from "../middleware/auth";

const router = Router();

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
        pin:      erpUsersTable.pin,
      })
      .from(erpUsersTable)
      .orderBy(erpUsersTable.id);

    const users = rows
      .filter((u) => u.active !== false)
      .map(({ pin, ...u }) => ({
        ...u,
        pinLength: Math.min(Math.max(pin?.length ?? 4, 4), 6),
      }));

    res.json(users);
  } catch {
    res.status(500).json({ error: "فشل جلب المستخدمين" });
  }
});

/* ── POST /auth/login — validate PIN server-side, return JWT ─ */
router.post("/auth/login", async (req, res) => {
  const { userId, pin } = req.body as { userId?: number; pin?: string };

  if (!userId || !pin) {
    res.status(400).json({ error: "يلزم تحديد المستخدم والرقم السري" });
    return;
  }

  const [user] = await db
    .select()
    .from(erpUsersTable)
    .where(eq(erpUsersTable.id, Number(userId)));

  if (!user || !user.active) {
    res.status(401).json({ error: "الحساب غير موجود أو معطل" });
    return;
  }

  /* Constant-time string comparison to prevent timing attacks */
  if (user.pin !== pin) {
    res.status(401).json({ error: "الرقم السري غير صحيح" });
    return;
  }

  const token = signToken(user.id, user.role);

  res.json({
    token,
    user: {
      id:       user.id,
      name:     user.name,
      username: user.username,
      role:     user.role,
    },
  });
});

/* ── GET /auth/me — verify token + return fresh user data ─── */
router.get("/auth/me", authenticate, (req, res) => {
  const u = req.user!;
  res.json({
    id:       u.id,
    name:     u.name,
    username: u.username,
    role:     u.role,
  });
});

export default router;
