import { Router, type IRouter } from "express";
import { db, salesTable, purchasesTable, expensesTable, incomeTable,
  receiptVouchersTable, depositVouchersTable, transactionsTable,
  productsTable, customersTable, suppliersTable } from "@workspace/db";
import { wrap } from "../lib/async-handler";
import { authenticate, requireRole } from "../middleware/auth";

const router: IRouter = Router();

const TABLES: Record<string, () => Promise<void>> = {
  sales: async () => { await db.delete(salesTable); },
  purchases: async () => { await db.delete(purchasesTable); },
  expenses: async () => { await db.delete(expensesTable); },
  income: async () => { await db.delete(incomeTable); },
  receipt_vouchers: async () => { await db.delete(receiptVouchersTable); },
  deposit_vouchers: async () => { await db.delete(depositVouchersTable); },
  transactions: async () => { await db.delete(transactionsTable); },
  products: async () => { await db.delete(productsTable); },
  customers: async () => { await db.delete(customersTable); },
  suppliers: async () => { await db.delete(suppliersTable); },
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

  for (const t of tables) await TABLES[t]();
  res.json({ success: true, cleared: tables });
}));

export default router;
