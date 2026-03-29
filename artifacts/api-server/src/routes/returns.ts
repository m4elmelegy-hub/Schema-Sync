import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db, salesReturnsTable, saleReturnItemsTable,
  purchaseReturnsTable, purchaseReturnItemsTable,
  productsTable, customersTable, safesTable, transactionsTable,
} from "@workspace/db";

import { wrap } from "../lib/async-handler";

const router: IRouter = Router();

// ── مرتجعات المبيعات ───────────────────────────────────────

router.get("/sales-returns", wrap(async (_req, res) => {
  const items = await db.select().from(salesReturnsTable).orderBy(desc(salesReturnsTable.created_at));
  res.json(items.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })));
}));

router.get("/sales-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [ret] = await db.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  if (!ret) { res.status(404).json({ error: "غير موجود" }); return; }
  const items = await db.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
  res.json({
    ...ret,
    total_amount: Number(ret.total_amount),
    created_at: ret.created_at.toISOString(),
    items: items.map(i => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), total_price: Number(i.total_price) })),
  });
}));

router.post("/sales-returns", async (req, res): Promise<void> => {
  const { sale_id, customer_id, customer_name, items, reason, notes, date, refund_type, safe_id } = req.body;
  if (!items?.length) { res.status(400).json({ error: "أضف أصناف المرتجع" }); return; }

  const total: number = items.reduce((s: number, i: { total_price: number }) => s + Number(i.total_price), 0);
  const return_no = `SR-${Date.now()}`;
  const rtype: string = refund_type === "cash" ? "cash" : "credit";

  try {
    const ret = await db.transaction(async (tx) => {
      // ── 1. تحديد الخزينة (إن كان استرداد نقدي) ─────────────
      let safeName: string | null = null;
      let safeIdInt: number | null = null;
      if (rtype === "cash" && safe_id) {
        const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
        if (!safe) throw new Error("الخزينة غير موجودة");
        safeName = safe.name;
        safeIdInt = safe.id;
      }

      // ── 2. إنشاء رأس المرتجع ────────────────────────────────
      const [ret] = await tx.insert(salesReturnsTable).values({
        return_no,
        sale_id: sale_id ?? null,
        customer_id: customer_id ? parseInt(customer_id) : null,
        customer_name: customer_name ?? null,
        total_amount: String(total),
        refund_type: rtype,
        safe_id: safeIdInt,
        safe_name: safeName,
        date: date ?? new Date().toISOString().split("T")[0],
        reason: reason ?? null,
        notes: notes ?? null,
      }).returning();

      // ── 3. أصناف المرتجع + إعادة الكمية للمخزون ────────────
      for (const item of items) {
        await tx.insert(saleReturnItemsTable).values({
          return_id: ret.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: String(item.quantity),
          unit_price: String(item.unit_price),
          total_price: String(item.total_price),
        });
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) {
          await tx.update(productsTable)
            .set({ quantity: String(Number(prod.quantity) + Number(item.quantity)) })
            .where(eq(productsTable.id, item.product_id));
        }
      }

      // ── 4. الأثر المحاسبي ────────────────────────────────────
      if (rtype === "credit") {
        // خصم من رصيد العميل
        // موجب (+500) → (300): دينه قلّ بقيمة المرتجع ✓
        // سالب (-100) → (-300): أصبحنا مدينين له بالمرتجع ✓
        if (customer_id) {
          const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
          if (cust) {
            await tx.update(customersTable)
              .set({ balance: String(Number(cust.balance) - total) })
              .where(eq(customersTable.id, cust.id));
          }
        }
      } else if (rtype === "cash" && safeIdInt) {
        // استرداد نقدي: الخزينة تنزل (ندفع للعميل نقداً)
        const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, safeIdInt));
        if (safe) {
          await tx.update(safesTable)
            .set({ balance: String(Number(safe.balance) - total) })
            .where(eq(safesTable.id, safeIdInt));
        }
        await tx.insert(transactionsTable).values({
          type: "sale_return",
          reference_type: "sale_return",
          reference_id: ret.id,
          safe_id: safeIdInt,
          safe_name: safeName ?? "",
          customer_id: customer_id ? parseInt(customer_id) : null,
          customer_name: customer_name ?? null,
          amount: String(total),
          direction: "out",
          description: `مرتجع مبيعات نقدي ${return_no}${customer_name ? ` — ${customer_name}` : ""}`,
          date: date ?? new Date().toISOString().split("T")[0],
          related_id: ret.id,
        });
      }

      return ret;
    });

    res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "خطأ في حفظ المرتجع" });
  }
});

router.delete("/sales-returns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  try {
    await db.transaction(async (tx) => {
      const [ret] = await tx.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
      if (!ret) throw new Error("المرتجع غير موجود");

      const items = await tx.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
      const total = Number(ret.total_amount);

      // عكس المخزون (البضاعة تخرج مرة تانية)
      for (const item of items) {
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) {
          await tx.update(productsTable)
            .set({ quantity: String(Math.max(0, Number(prod.quantity) - Number(item.quantity))) })
            .where(eq(productsTable.id, item.product_id));
        }
      }

      // عكس الأثر المحاسبي
      if (ret.refund_type === "credit" && ret.customer_id) {
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, ret.customer_id));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Number(cust.balance) + total) })
            .where(eq(customersTable.id, cust.id));
        }
      } else if (ret.refund_type === "cash" && ret.safe_id) {
        const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, ret.safe_id));
        if (safe) {
          await tx.update(safesTable)
            .set({ balance: String(Number(safe.balance) + total) })
            .where(eq(safesTable.id, ret.safe_id));
        }
      }

      await tx.delete(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
      await tx.delete(salesReturnsTable).where(eq(salesReturnsTable.id, id));
    });

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في الحذف" });
  }
});

// ── مرتجعات المشتريات ──────────────────────────────────────

router.get("/purchase-returns", wrap(async (_req, res) => {
  const items = await db.select().from(purchaseReturnsTable).orderBy(desc(purchaseReturnsTable.created_at));
  res.json(items.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })));
}));

router.get("/purchase-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
  const [ret] = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
  if (!ret) { res.status(404).json({ error: "غير موجود" }); return; }
  const items = await db.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));
  res.json({
    ...ret,
    total_amount: Number(ret.total_amount),
    created_at: ret.created_at.toISOString(),
    items: items.map(i => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), total_price: Number(i.total_price) })),
  });
}));

router.post("/purchase-returns", async (req, res): Promise<void> => {
  const { purchase_id, customer_id, customer_name, supplier_name, items, reason, notes, date } = req.body;
  if (!items?.length) { res.status(400).json({ error: "أضف أصناف المرتجع" }); return; }

  const total: number = items.reduce((s: number, i: { total_price: number }) => s + Number(i.total_price), 0);
  const return_no = `PR-${Date.now()}`;

  try {
    const ret = await db.transaction(async (tx) => {
      const [ret] = await tx.insert(purchaseReturnsTable).values({
        return_no,
        purchase_id: purchase_id ?? null,
        customer_id: customer_id ? parseInt(customer_id) : null,
        customer_name: customer_name ?? supplier_name ?? null,
        supplier_name: supplier_name ?? customer_name ?? null,
        total_amount: String(total),
        date: date ?? new Date().toISOString().split("T")[0],
        reason: reason ?? null,
        notes: notes ?? null,
      }).returning();

      for (const item of items) {
        await tx.insert(purchaseReturnItemsTable).values({
          return_id: ret.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: String(item.quantity),
          unit_price: String(item.unit_price),
          total_price: String(item.total_price),
        });
        // نُرجع البضاعة للعميل/المورد → الكمية تنزل من مخزوننا
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) {
          await tx.update(productsTable)
            .set({ quantity: String(Math.max(0, Number(prod.quantity) - Number(item.quantity))) })
            .where(eq(productsTable.id, item.product_id));
        }
      }

      // رصيد العميل يرتفع (قلّت قيمة ما نديّنه له)
      // -500 + 200 = -300 ✓ (أرجعنا بضاعة بـ200، تبقى نديّنه 300 فقط)
      if (customer_id) {
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Number(cust.balance) + total) })
            .where(eq(customersTable.id, cust.id));
        }
      }

      return ret;
    });

    res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "خطأ في حفظ المرتجع" });
  }
});

router.delete("/purchase-returns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  try {
    await db.transaction(async (tx) => {
      const [ret] = await tx.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
      if (!ret) throw new Error("غير موجود");
      const items = await tx.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));

      for (const item of items) {
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) {
          await tx.update(productsTable)
            .set({ quantity: String(Number(prod.quantity) + Number(item.quantity)) })
            .where(eq(productsTable.id, item.product_id));
        }
      }

      if (ret.customer_id) {
        const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, ret.customer_id));
        if (cust) {
          await tx.update(customersTable)
            .set({ balance: String(Number(cust.balance) - Number(ret.total_amount)) })
            .where(eq(customersTable.id, cust.id));
        }
      }

      await tx.delete(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));
      await tx.delete(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
    });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في الحذف" });
  }
});

export default router;
