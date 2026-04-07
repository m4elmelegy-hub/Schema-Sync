/**
 * integrity.ts — مسارات فحص سلامة البيانات المحاسبية
 *
 * GET  /api/integrity/check           — تشغيل جميع الفحوصات (admin فقط)
 * POST /api/integrity/repair-accounts — إصلاح أرصدة الحسابات (admin فقط)
 * POST /api/integrity/repair-customers — إصلاح أرصدة العملاء (admin فقط)
 */

import { Router, type IRouter } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { wrap } from "../lib/async-handler";
import {
  runAllIntegrityChecks,
  checkAccountBalanceDrift,
  checkCustomerBalanceDrift,
  checkInventoryDrift,
  checkJournalEntryBalance,
  repairAccountBalances,
  repairCustomerBalances,
} from "../lib/integrity";
import { writeAuditLog } from "../lib/audit-log";

const router: IRouter = Router();

/* ── GET /api/integrity/check ─────────────────────────────────────────────── */
router.get(
  "/integrity/check",
  authenticate,
  requireRole("admin"),
  wrap(async (_req, res) => {
    const report = await runAllIntegrityChecks();
    const httpStatus = report.overall_status === "OK" ? 200 : 207;
    res.status(httpStatus).json(report);
  }),
);

/* ── GET /api/integrity/check/:domain ────────────────────────────────────────
 * يتيح تشغيل فحص واحد فقط:
 *   journal  — توازن قيود اليومية
 *   accounts — انحراف أرصدة الحسابات
 *   customers — انحراف أرصدة العملاء
 *   inventory — انحراف كميات المخزون
 * ─────────────────────────────────────────────────────────────────────────── */
router.get(
  "/integrity/check/:domain",
  authenticate,
  requireRole("admin"),
  wrap(async (req, res) => {
    const domain = req.params.domain as string;
    let result;
    switch (domain) {
      case "journal":   result = await checkJournalEntryBalance(); break;
      case "accounts":  result = await checkAccountBalanceDrift(); break;
      case "customers": result = await checkCustomerBalanceDrift(); break;
      case "inventory": result = await checkInventoryDrift(); break;
      default:
        res.status(400).json({ error: `domain غير معروف: ${domain}` });
        return;
    }
    const httpStatus = result.status === "OK" ? 200 : 207;
    res.status(httpStatus).json(result);
  }),
);

/* ── POST /api/integrity/repair-accounts ──────────────────────────────────── */
router.post(
  "/integrity/repair-accounts",
  authenticate,
  requireRole("admin"),
  wrap(async (req, res) => {
    const result = await repairAccountBalances();
    void writeAuditLog({
      action:      "INTEGRITY_REPAIR",
      record_type: "account_balances",
      record_id:   0,
      old_value:   { status: "DRIFT_DETECTED" },
      new_value:   { repaired: result.repaired, source: "journal_entry_lines", method: "recalculate" },
      user:        { id: req.user?.id, username: req.user?.username },
    });
    res.json({
      success:  true,
      repaired: result.repaired,
      message:  `تم إصلاح ${result.repaired} حساب من أرصدة الدفتر`,
    });
  }),
);

/* ── POST /api/integrity/repair-customers ──────────────────────────────────── */
router.post(
  "/integrity/repair-customers",
  authenticate,
  requireRole("admin"),
  wrap(async (req, res) => {
    const result = await repairCustomerBalances();
    void writeAuditLog({
      action:      "INTEGRITY_REPAIR",
      record_type: "customer_balances",
      record_id:   0,
      old_value:   { status: "DRIFT_DETECTED" },
      new_value:   { repaired: result.repaired, source: "customer_ledger", method: "recalculate" },
      user:        { id: req.user?.id, username: req.user?.username },
    });
    res.json({
      success:  true,
      repaired: result.repaired,
      message:  `تم إصلاح ${result.repaired} عميل من أرصدة دفتر الأستاذ`,
    });
  }),
);

export default router;
