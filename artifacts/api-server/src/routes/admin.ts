import { Router, type IRouter } from "express";
import { db,
  salesTable, saleItemsTable,
  purchasesTable, purchaseItemsTable,
  salesReturnsTable, saleReturnItemsTable,
  purchaseReturnsTable, purchaseReturnItemsTable,
  expensesTable, incomeTable,
  receiptVouchersTable, depositVouchersTable, transactionsTable,
  productsTable, stockMovementsTable,
  customersTable,
} from "@workspace/db";
import { sql, isNull, eq, inArray } from "drizzle-orm";
import { wrap } from "../lib/async-handler";
import { authenticate, requireRole } from "../middleware/auth";
import { getOrCreateCustomerAccount, getOrCreateCustomerPayableAccount } from "../lib/auto-account";

const router: IRouter = Router();

const TABLES: Record<string, (companyId: number) => Promise<void>> = {
  sales: async (cid) => {
    const saleIds = (await db.select({ id: salesTable.id }).from(salesTable).where(eq(salesTable.company_id, cid))).map(r => r.id);
    const retIds = (await db.select({ id: salesReturnsTable.id }).from(salesReturnsTable).where(eq(salesReturnsTable.company_id, cid))).map(r => r.id);
    if (retIds.length > 0) await db.delete(saleReturnItemsTable).where(inArray(saleReturnItemsTable.return_id, retIds));
    await db.delete(salesReturnsTable).where(eq(salesReturnsTable.company_id, cid));
    if (saleIds.length > 0) await db.delete(saleItemsTable).where(inArray(saleItemsTable.sale_id, saleIds));
    await db.delete(salesTable).where(eq(salesTable.company_id, cid));
  },
  purchases: async (cid) => {
    const purIds = (await db.select({ id: purchasesTable.id }).from(purchasesTable).where(eq(purchasesTable.company_id, cid))).map(r => r.id);
    const retIds = (await db.select({ id: purchaseReturnsTable.id }).from(purchaseReturnsTable).where(eq(purchaseReturnsTable.company_id, cid))).map(r => r.id);
    if (retIds.length > 0) await db.delete(purchaseReturnItemsTable).where(inArray(purchaseReturnItemsTable.return_id, retIds));
    await db.delete(purchaseReturnsTable).where(eq(purchaseReturnsTable.company_id, cid));
    if (purIds.length > 0) await db.delete(purchaseItemsTable).where(inArray(purchaseItemsTable.purchase_id, purIds));
    await db.delete(purchasesTable).where(eq(purchasesTable.company_id, cid));
  },
  expenses:         async (cid) => { await db.delete(expensesTable).where(eq(expensesTable.company_id, cid)); },
  income:           async (cid) => { await db.delete(incomeTable).where(eq(incomeTable.company_id, cid)); },
  receipt_vouchers: async (cid) => { await db.delete(receiptVouchersTable).where(eq(receiptVouchersTable.company_id, cid)); },
  deposit_vouchers: async (cid) => { await db.delete(depositVouchersTable).where(eq(depositVouchersTable.company_id, cid)); },
  transactions:     async (cid) => { await db.delete(transactionsTable).where(eq(transactionsTable.company_id, cid)); },
  products: async (cid) => {
    await db.delete(stockMovementsTable).where(eq(stockMovementsTable.company_id, cid));
    const retIds = (await db.select({ id: salesReturnsTable.id }).from(salesReturnsTable).where(eq(salesReturnsTable.company_id, cid))).map(r => r.id);
    if (retIds.length > 0) await db.delete(saleReturnItemsTable).where(inArray(saleReturnItemsTable.return_id, retIds));
    const purRetIds = (await db.select({ id: purchaseReturnsTable.id }).from(purchaseReturnsTable).where(eq(purchaseReturnsTable.company_id, cid))).map(r => r.id);
    if (purRetIds.length > 0) await db.delete(purchaseReturnItemsTable).where(inArray(purchaseReturnItemsTable.return_id, purRetIds));
    const saleIds = (await db.select({ id: salesTable.id }).from(salesTable).where(eq(salesTable.company_id, cid))).map(r => r.id);
    if (saleIds.length > 0) await db.delete(saleItemsTable).where(inArray(saleItemsTable.sale_id, saleIds));
    const purIds = (await db.select({ id: purchasesTable.id }).from(purchasesTable).where(eq(purchasesTable.company_id, cid))).map(r => r.id);
    if (purIds.length > 0) await db.delete(purchaseItemsTable).where(inArray(purchaseItemsTable.purchase_id, purIds));
    await db.delete(productsTable).where(eq(productsTable.company_id, cid));
  },
  customers: async (cid) => {
    await db.delete(customersTable).where(eq(customersTable.company_id, cid));
  },
};

router.post("/admin/clear", authenticate, requireRole("admin"), wrap(async (req, res) => {
  const { tables } = req.body as { tables: string[] };
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    res.status(400).json({ error: "حدد الجداول المطلوب مسحها" });
    return;
  }

  const invalid = tables.filter(t => !TABLES[t]);
  if (invalid.length > 0) {
    res.status(400).json({ error: `جداول غير معروفة: ${invalid.join(", ")}` });
    return;
  }

  const companyId: number = (req as any).user?.company_id ?? 1;

  const ORDER = ["sales", "purchases", "expenses", "income", "receipt_vouchers", "deposit_vouchers", "transactions", "products", "customers"];
  const sorted = ORDER.filter(t => tables.includes(t));

  for (const t of sorted) await TABLES[t](companyId);
  res.json({ success: true, cleared: sorted });
}));

/* ── ربط تلقائي: إنشاء حسابات للعملاء الموجودين ──────────────────────────── */
router.post("/admin/backfill-accounts", [authenticate, requireRole("admin", "manager")], wrap(async (req, res) => {
  const companyId: number = (req as any).user?.company_id ?? 1;
  const customers = await db.select().from(customersTable)
    .where(sql`${customersTable.account_id} IS NULL AND ${customersTable.company_id} = ${companyId}`);

  let customersLinked = 0;

  for (const c of customers) {
    if (!c.customer_code) continue;
    const acct = await getOrCreateCustomerAccount(c.customer_code, c.name);
    await db.update(customersTable).set({ account_id: acct.id }).where(sql`id = ${c.id}`);
    customersLinked++;

    if (c.is_supplier) {
      await getOrCreateCustomerPayableAccount(c.customer_code, c.name);
    }
  }

  res.json({ success: true, customersLinked });
}));

export default router;
