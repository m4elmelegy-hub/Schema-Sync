import { Router, type IRouter } from "express";
import { db,
  salesTable, saleItemsTable,
  purchasesTable, purchaseItemsTable,
  salesReturnsTable, saleReturnItemsTable,
  purchaseReturnsTable, purchaseReturnItemsTable,
  expensesTable, incomeTable,
  receiptVouchersTable, depositVouchersTable, transactionsTable,
  productsTable, stockMovementsTable,
  customersTable, suppliersTable,
} from "@workspace/db";
import { sql, isNull } from "drizzle-orm";
import { wrap } from "../lib/async-handler";
import { authenticate, requireRole } from "../middleware/auth";
import { getOrCreateCustomerAccount, getOrCreateSupplierAccount } from "../lib/auto-account";

const router: IRouter = Router();

const TABLES: Record<string, () => Promise<void>> = {
  sales: async () => {
    await db.delete(saleReturnItemsTable);
    await db.delete(salesReturnsTable);
    await db.delete(saleItemsTable);
    await db.delete(salesTable);
  },
  purchases: async () => {
    await db.delete(purchaseReturnItemsTable);
    await db.delete(purchaseReturnsTable);
    await db.delete(purchaseItemsTable);
    await db.delete(purchasesTable);
  },
  expenses:         async () => { await db.delete(expensesTable); },
  income:           async () => { await db.delete(incomeTable); },
  receipt_vouchers: async () => { await db.delete(receiptVouchersTable); },
  deposit_vouchers: async () => { await db.delete(depositVouchersTable); },
  transactions:     async () => { await db.delete(transactionsTable); },
  products: async () => {
    await db.delete(stockMovementsTable);
    await db.delete(saleReturnItemsTable);
    await db.delete(purchaseReturnItemsTable);
    await db.delete(saleItemsTable);
    await db.delete(purchaseItemsTable);
    await db.delete(productsTable);
  },
  customers: async () => {
    await db.delete(customersTable);
  },
  suppliers: async () => {
    await db.delete(suppliersTable);
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

  // ترتيب الحذف الآمن: المبيعات والمشتريات أولاً (تحذف items)، ثم المنتجات، ثم العملاء والموردون
  const ORDER = ["sales", "purchases", "expenses", "income", "receipt_vouchers", "deposit_vouchers", "transactions", "products", "customers", "suppliers"];
  const sorted = ORDER.filter(t => tables.includes(t));

  for (const t of sorted) await TABLES[t]();
  res.json({ success: true, cleared: sorted });
}));

/* ── ربط تلقائي: إنشاء حسابات للعملاء والموردين الموجودين ────────────────
 *  POST /api/admin/backfill-accounts
 *  يُنشئ حساباً محاسبياً لكل عميل/مورد لا يملك account_id بعد.
 */
router.post("/admin/backfill-accounts", [authenticate, requireRole("admin", "manager")], wrap(async (_req, res) => {
  const customers = await db.select().from(customersTable).where(isNull(customersTable.account_id));
  const suppliers = await db.select().from(suppliersTable).where(isNull(suppliersTable.account_id));

  let customersLinked = 0;
  let suppliersLinked = 0;

  for (const c of customers) {
    if (!c.customer_code) continue;
    const acct = await getOrCreateCustomerAccount(c.customer_code, c.name);
    await db.update(customersTable).set({ account_id: acct.id }).where(sql`id = ${c.id}`);
    customersLinked++;
  }

  for (const s of suppliers) {
    if (!s.supplier_code) continue;
    const acct = await getOrCreateSupplierAccount(s.supplier_code, s.name);
    await db.update(suppliersTable).set({ account_id: acct.id }).where(sql`id = ${s.id}`);
    suppliersLinked++;
  }

  res.json({ success: true, customersLinked, suppliersLinked });
}));

export default router;
