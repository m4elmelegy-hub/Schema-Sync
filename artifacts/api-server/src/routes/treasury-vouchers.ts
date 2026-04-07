import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, treasuryVouchersTable, safesTable, transactionsTable } from "@workspace/db";

import { wrap } from "../lib/async-handler";
import { hasPermission } from "../lib/permissions";

const router: IRouter = Router();

function fmt(v: typeof treasuryVouchersTable.$inferSelect) {
  return { ...v, amount: Number(v.amount), created_at: v.created_at.toISOString() };
}

router.get("/treasury-vouchers", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_treasury")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض الخزينة" }); return;
  }
  const vouchers = await db.select().from(treasuryVouchersTable).orderBy(desc(treasuryVouchersTable.created_at));
  res.json(vouchers.map(fmt));
}));

router.get("/treasury-vouchers/safe/:safeId", wrap(async (req, res) => {
  if (!hasPermission(req.user, "can_view_treasury")) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض الخزينة" }); return;
  }
  const safeId = parseInt(req.params.safeId as string);
  if (isNaN(safeId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const vouchers = await db.select().from(treasuryVouchersTable)
    .where(eq(treasuryVouchersTable.safe_id, safeId))
    .orderBy(desc(treasuryVouchersTable.created_at));
  res.json(vouchers.map(fmt));
}));

router.post("/treasury-vouchers", wrap(async (req, res) => {
  const { type, safe_id, amount, party_name, description, category } = req.body;
  if (!type || !safe_id || !amount || !description) {
    res.status(400).json({ error: "البيانات غير مكتملة" }); return;
  }
  const [safe] = await db.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
  if (!safe) { res.status(404).json({ error: "الخزانة غير موجودة" }); return; }

  const amt = Number(amount);
  const currentBal = Number(safe.balance);
  if (type === "payment" && currentBal < amt) {
    res.status(400).json({ error: `رصيد الخزانة غير كافٍ (${currentBal.toFixed(2)} ج.م)` }); return;
  }

  const newBalance = type === "receipt" ? currentBal + amt : currentBal - amt;
  const voucher_no = `${type === "receipt" ? "RV" : "PV"}-${Date.now()}`;

  const voucher = await db.transaction(async (tx) => {
    await tx.update(safesTable).set({ balance: String(newBalance) }).where(eq(safesTable.id, safe.id));
    const [v] = await tx.insert(treasuryVouchersTable).values({
      voucher_no, type,
      safe_id: safe.id, safe_name: safe.name,
      amount: String(amt), party_name: party_name ?? null,
      description, category: category ?? null,
    }).returning();
    await tx.insert(transactionsTable).values({
      type: `voucher_${type}`,
      reference_type: "treasury_voucher",
      reference_id: v.id,
      safe_id: safe.id, safe_name: safe.name,
      amount: String(amt),
      direction: type === "receipt" ? "in" : "out",
      description: `${type === "receipt" ? "سند قبض" : "سند صرف"}: ${description}`,
      date: new Date().toISOString().split("T")[0],
    });
    return v;
  });
  res.status(201).json(fmt(voucher));
}));

router.delete("/treasury-vouchers/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [v] = await db.select().from(treasuryVouchersTable).where(eq(treasuryVouchersTable.id, id));
  if (!v) { res.status(404).json({ error: "غير موجود" }); return; }
  // عكس التأثير على الرصيد
  const [safe] = await db.select().from(safesTable).where(eq(safesTable.id, v.safe_id));
  if (safe) {
    const reversal = v.type === "receipt" ? -Number(v.amount) : Number(v.amount);
    await db.update(safesTable).set({ balance: String(Number(safe.balance) + reversal) }).where(eq(safesTable.id, safe.id));
  }
  await db.delete(treasuryVouchersTable).where(eq(treasuryVouchersTable.id, id));
  res.json({ success: true });
}));

export default router;
