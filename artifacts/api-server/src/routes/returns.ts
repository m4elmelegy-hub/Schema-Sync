import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db, salesReturnsTable, saleReturnItemsTable,
  purchaseReturnsTable, purchaseReturnItemsTable,
  productsTable, customersTable, suppliersTable, safesTable, transactionsTable, stockMovementsTable,
} from "@workspace/db";

import { wrap, httpError } from "../lib/async-handler";

const router: IRouter = Router();

// ── مرتجعات المبيعات ───────────────────────────────────────

router.get("/sales-returns", wrap(async (_req, res) => {
  const items = await db.select().from(salesReturnsTable).orderBy(desc(salesReturnsTable.created_at));
  res.json(items.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })));
}));

router.get("/sales-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
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

router.post("/sales-returns", wrap(async (req, res) => {
  const { sale_id, customer_id, customer_name, items, reason, notes, date, refund_type, safe_id } = req.body;
  if (!items?.length) { res.status(400).json({ error: "أضف أصناف المرتجع" }); return; }

  const total: number = items.reduce((s: number, i: { total_price: number }) => s + Number(i.total_price), 0);
  const return_no = `SR-${Date.now()}`;
  const rtype: string = refund_type === "cash" ? "cash" : "credit";

  const ret = await db.transaction(async (tx) => {
    let safeName: string | null = null;
    let safeIdInt: number | null = null;
    if (rtype === "cash" && safe_id) {
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
      if (!safe) throw httpError(400, "الخزينة غير موجودة");
      safeName = safe.name;
      safeIdInt = safe.id;
    }

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

      // أصناف المرتجع + إعادة الكمية للمخزون + حركة وارد (مرتجع مبيعات)
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
          const oldQty = Number(prod.quantity);
          const newQty = oldQty + Number(item.quantity);
          await tx.update(productsTable)
            .set({ quantity: String(newQty) })
            .where(eq(productsTable.id, item.product_id));

          // ── تسجيل حركة وارد (مرتجع مبيعات = يزيد المخزون) ──
          await tx.insert(stockMovementsTable).values({
            product_id: item.product_id,
            product_name: item.product_name,
            movement_type: "sale_return",
            quantity: String(Number(item.quantity)),  // موجب = وارد
            quantity_before: String(oldQty),
            quantity_after: String(newQty),
            unit_cost: String(Number(item.unit_price)),
            reference_type: "sale_return",
            reference_id: ret.id,
            reference_no: return_no,
            notes: customer_name ? `مرتجع مبيعات من ${customer_name}` : "مرتجع مبيعات",
            date: date ?? new Date().toISOString().split("T")[0],
          });
        }
      }

      // الأثر المحاسبي
      if (rtype === "credit") {
        if (customer_id) {
          const [cust] = await tx.select().from(customersTable).where(eq(customersTable.id, parseInt(customer_id)));
          if (cust) {
            await tx.update(customersTable)
              .set({ balance: String(Number(cust.balance) - total) })
              .where(eq(customersTable.id, cust.id));
          }
        }
      } else if (rtype === "cash" && safeIdInt) {
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
        });
      }

    return ret;
  });

  res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
}));

router.delete("/sales-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.transaction(async (tx) => {
    const [ret] = await tx.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
    if (!ret) throw httpError(400, "المرتجع غير موجود");

      const items = await tx.select().from(saleReturnItemsTable).where(eq(saleReturnItemsTable.return_id, id));
      const total = Number(ret.total_amount);

      // عكس المخزون (البضاعة تخرج مرة تانية) + حركة صادر تعويضية
      for (const item of items) {
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) {
          const oldQty = Number(prod.quantity);
          const newQty = Math.max(0, oldQty - Number(item.quantity));
          await tx.update(productsTable)
            .set({ quantity: String(newQty) })
            .where(eq(productsTable.id, item.product_id));

          await tx.insert(stockMovementsTable).values({
            product_id: item.product_id,
            product_name: item.product_name,
            movement_type: "adjustment",
            quantity: String(-(Number(item.quantity))),
            quantity_before: String(oldQty),
            quantity_after: String(newQty),
            unit_cost: String(Number(item.unit_price)),
            reference_type: "sale_return_cancel",
            reference_id: ret.id,
            reference_no: ret.return_no,
            notes: `إلغاء مرتجع مبيعات ${ret.return_no}`,
            date: new Date().toISOString().split("T")[0],
          });
        }
      }

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
}));

// ── مرتجعات المشتريات ──────────────────────────────────────

router.get("/purchase-returns", wrap(async (_req, res) => {
  const items = await db.select().from(purchaseReturnsTable).orderBy(desc(purchaseReturnsTable.created_at));
  res.json(items.map(r => ({ ...r, total_amount: Number(r.total_amount), created_at: r.created_at.toISOString() })));
}));

router.get("/purchase-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
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

router.post("/purchase-returns", wrap(async (req, res) => {
  // FIX 3: أضيف refund_type (cash|balance_credit) و safe_id و supplier_id
  // FIX 9: supplier_name يُحفظ بشكل صحيح ولا يُخلط مع customer_name
  const {
    purchase_id, supplier_id, customer_id, customer_name, supplier_name,
    items, reason, notes, date,
    refund_type, safe_id,
  } = req.body;

  if (!items?.length) { res.status(400).json({ error: "أضف أصناف المرتجع" }); return; }

  const total: number = items.reduce((s: number, i: { total_price: number }) => s + Number(i.total_price), 0);
  const return_no = `PR-${Date.now()}`;
  const txDate = date ?? new Date().toISOString().split("T")[0];
  const rtype: string = refund_type === "cash" ? "cash" : "balance_credit";

  const ret = await db.transaction(async (tx) => {
    // ── نوع الاسترداد: نقدي → زيادة رصيد الخزينة ─────────────────────────
    if (rtype === "cash") {
      if (!safe_id) throw httpError(400, "يجب اختيار الخزينة للاسترداد النقدي");
      const [safe] = await tx.select().from(safesTable).where(eq(safesTable.id, parseInt(safe_id)));
      if (!safe) throw httpError(400, "الخزينة غير موجودة");

      await tx.update(safesTable)
        .set({ balance: String(Number(safe.balance) + total) })
        .where(eq(safesTable.id, safe.id));

      await tx.insert(transactionsTable).values({
        type: "purchase_return",
        reference_type: "purchase_return",
        safe_id: safe.id,
        safe_name: safe.name,
        amount: String(total),
        direction: "in",
        description: `مرتجع مشتريات نقدي ${return_no}${supplier_name ? ` — ${supplier_name}` : ""}`,
        date: txDate,
      });
    } else {
      // ── خصم من رصيد المورد (دين يُقلَّل) ─────────────────────────────
      if (supplier_id) {
        const [supp] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, parseInt(supplier_id)));
        if (supp) {
          const newBal = Math.max(0, Number(supp.balance) - total);
          await tx.update(suppliersTable)
            .set({ balance: String(newBal) })
            .where(eq(suppliersTable.id, supp.id));
        }
      }
    }

    // ── إنشاء سجل المرتجع ──────────────────────────────────────────────────
    const [ret] = await tx.insert(purchaseReturnsTable).values({
      return_no,
      purchase_id: purchase_id ?? null,
      customer_id: customer_id ? parseInt(customer_id) : null,
      customer_name: customer_name ?? null,        // FIX 9: لا خلط مع supplier_name
      supplier_name: supplier_name ?? null,        // FIX 9: مستقل
      total_amount: String(total),
      date: txDate,
      reason: reason ?? null,
      notes: notes ?? null,
    }).returning();

    // ── خصم من المخزون + حركة صادر ────────────────────────────────────────
    for (const item of items) {
      await tx.insert(purchaseReturnItemsTable).values({
        return_id: ret.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: String(item.quantity),
        unit_price: String(item.unit_price),
        total_price: String(item.total_price),
      });

      const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
      if (prod) {
        const oldQty = Number(prod.quantity);
        const newQty = Math.max(0, oldQty - Number(item.quantity));
        await tx.update(productsTable)
          .set({ quantity: String(newQty) })
          .where(eq(productsTable.id, item.product_id));

        await tx.insert(stockMovementsTable).values({
          product_id: item.product_id,
          product_name: item.product_name,
          movement_type: "purchase_return",
          quantity: String(-Number(item.quantity)),
          quantity_before: String(oldQty),
          quantity_after: String(newQty),
          unit_cost: String(Number(item.unit_price)),
          reference_type: "purchase_return",
          reference_id: ret.id,
          reference_no: return_no,
          notes: supplier_name ? `مرتجع مشتريات لـ ${supplier_name}` : "مرتجع مشتريات",
          date: txDate,
        });
      }
    }

    return ret;
  });

  res.status(201).json({ ...ret, total_amount: Number(ret.total_amount), created_at: ret.created_at.toISOString() });
}));

router.delete("/purchase-returns/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  await db.transaction(async (tx) => {
    const [ret] = await tx.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
    if (!ret) throw httpError(400, "غير موجود");
      const items = await tx.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.return_id, id));

      for (const item of items) {
        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.product_id));
        if (prod) {
          const oldQty = Number(prod.quantity);
          const newQty = oldQty + Number(item.quantity);
          await tx.update(productsTable)
            .set({ quantity: String(newQty) })
            .where(eq(productsTable.id, item.product_id));

          await tx.insert(stockMovementsTable).values({
            product_id: item.product_id,
            product_name: item.product_name,
            movement_type: "adjustment",
            quantity: String(Number(item.quantity)),
            quantity_before: String(oldQty),
            quantity_after: String(newQty),
            unit_cost: String(Number(item.unit_price)),
            reference_type: "purchase_return_cancel",
            reference_id: ret.id,
            reference_no: ret.return_no,
            notes: `إلغاء مرتجع مشتريات ${ret.return_no}`,
            date: new Date().toISOString().split("T")[0],
          });
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
}));

export default router;
