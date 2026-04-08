/**
 * /api/branches — Branches CRUD (company-scoped)
 * GET    /branches          → list branches for current company
 * POST   /branches          → create branch (admin only)
 * PATCH  /branches/:id      → update branch (admin only)
 * DELETE /branches/:id      → delete branch (admin only)
 */
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, branchesTable } from "@workspace/db";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

/* ── GET /branches ──────────────────────────────────────────── */
router.get("/branches", authenticate, async (req, res) => {
  try {
    const companyId = req.user?.company_id ?? null;
    if (companyId === null) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.company_id, companyId))
      .orderBy(branchesTable.id);
    res.json(rows);
  } catch (err) {
    console.error("branches GET error:", err);
    res.status(500).json({ error: "فشل جلب الفروع" });
  }
});

/* ── POST /branches ─────────────────────────────────────────── */
router.post("/branches", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const companyId = req.user?.company_id ?? null;
    if (companyId === null) {
      res.status(403).json({ error: "غير مسموح" });
      return;
    }
    const { name, address, phone } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: "اسم الفرع مطلوب" });
      return;
    }
    const [branch] = await db
      .insert(branchesTable)
      .values({
        company_id: companyId,
        name:       String(name).trim(),
        address:    address ? String(address).trim() : null,
        phone:      phone   ? String(phone).trim()   : null,
        is_active:  true,
      })
      .returning();
    res.status(201).json(branch);
  } catch (err) {
    console.error("branches POST error:", err);
    res.status(500).json({ error: "فشل إنشاء الفرع" });
  }
});

/* ── PATCH /branches/:id ────────────────────────────────────── */
router.patch("/branches/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id        = parseInt(req.params.id, 10);
    const companyId = req.user?.company_id ?? null;
    if (companyId === null) { res.status(403).json({ error: "غير مسموح" }); return; }

    const { name, address, phone, is_active } = req.body;
    const updates: Record<string, unknown> = {};
    if (name      !== undefined) updates.name      = String(name).trim();
    if (address   !== undefined) updates.address   = address ? String(address).trim() : null;
    if (phone     !== undefined) updates.phone     = phone   ? String(phone).trim()   : null;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    const [branch] = await db
      .update(branchesTable)
      .set(updates)
      .where(and(eq(branchesTable.id, id), eq(branchesTable.company_id, companyId)))
      .returning();

    if (!branch) { res.status(404).json({ error: "الفرع غير موجود" }); return; }
    res.json(branch);
  } catch (err) {
    console.error("branches PATCH error:", err);
    res.status(500).json({ error: "فشل تحديث الفرع" });
  }
});

/* ── DELETE /branches/:id ───────────────────────────────────── */
router.delete("/branches/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const id        = parseInt(req.params.id, 10);
    const companyId = req.user?.company_id ?? null;
    if (companyId === null) { res.status(403).json({ error: "غير مسموح" }); return; }

    const [deleted] = await db
      .delete(branchesTable)
      .where(and(eq(branchesTable.id, id), eq(branchesTable.company_id, companyId)))
      .returning();

    if (!deleted) { res.status(404).json({ error: "الفرع غير موجود" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("branches DELETE error:", err);
    res.status(500).json({ error: "فشل حذف الفرع" });
  }
});

export default router;
