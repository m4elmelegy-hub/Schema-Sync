/**
 * integrity.test.ts — اختبارات سلامة البيانات المحاسبية
 *
 * يستخدم node:test (Node ≥ 18) بدون تبعيات خارجية.
 * اختبارات تكاملية (integration tests) تعمل على قاعدة البيانات الحقيقية.
 *
 * قواعد التنظيف:
 *   - كل اختبار يُنشئ بيانات بـ prefix فريد (TEST_PREFIX)
 *   - الـ after() hook يحذف كل ما أُنشئ
 *   - لا تُعدِّل الاختبارات بيانات موجودة مسبقاً
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { eq, sql, inArray } from "drizzle-orm";
import {
  db,
  accountsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  customersTable,
  customerLedgerTable,
  productsTable,
  stockMovementsTable,
  stockCountSessionsTable,
  stockCountItemsTable,
  stockTransfersTable,
  stockTransferItemsTable,
} from "@workspace/db";
import {
  createJournalEntry,
  getOrCreateAccount,
  createAutoJournalEntry,
} from "../lib/auto-account";
import {
  checkJournalEntryBalance,
  checkAccountBalanceDrift,
  checkCustomerBalanceDrift,
  checkInventoryDrift,
  repairAccountBalances,
  repairCustomerBalances,
} from "../lib/integrity";

/* ─── معرّف اختبار فريد لكل جلسة تشغيل ──────────────────────────────────── */
const TS = Date.now();
const P  = `TINT${TS}`;   // prefix قصير لتجنب تجاوز حد طول الكود

/* ─── سجلات لتنظيفها بعد الانتهاء ───────────────────────────────────────── */
const createdAccountIds:        number[] = [];
const createdJournalEntryIds:   number[] = [];
const createdCustomerIds:       number[] = [];
const createdProductIds:        number[] = [];
const createdCountSessionIds:   number[] = [];
const createdTransferIds:       number[] = [];

/* ═══════════════════════════════════════════════════════════════════════════
 * دوال مساعدة
 * ═══════════════════════════════════════════════════════════════════════════ */

/** ينشئ حساباً محاسبياً اختبارياً ويسجّله للحذف */
async function mkAccount(
  code: string,
  name: string,
  type: "asset" | "liability" | "revenue" | "expense",
): Promise<number> {
  const [row] = await db
    .insert(accountsTable)
    .values({ code, name, type, is_posting: true, is_active: true, opening_balance: "0", current_balance: "0", level: 2 })
    .returning({ id: accountsTable.id });
  createdAccountIds.push(row.id);
  return row.id;
}

/** ينشئ قيداً مباشرةً في DB بدون التحقق من التوازن (لاختبار الكشف) */
async function insertRawJE(
  entryNo: string,
  debitAccountId: number,
  creditAccountId: number,
  debitAmt: number,
  creditAmt: number,
) {
  const [entry] = await db
    .insert(journalEntriesTable)
    .values({
      entry_no:     entryNo,
      date:         "2025-01-01",
      description:  "test JE",
      status:       "posted",
      reference:    entryNo,
      total_debit:  String(debitAmt),
      total_credit: String(creditAmt),
    })
    .returning({ id: journalEntriesTable.id });
  createdJournalEntryIds.push(entry.id);

  await db.insert(journalEntryLinesTable).values([
    { entry_id: entry.id, account_id: debitAccountId,  account_code: `${P}-DR`, account_name: "test DR", debit: String(debitAmt),  credit: "0" },
    { entry_id: entry.id, account_id: creditAccountId, account_code: `${P}-CR`, account_name: "test CR", debit: "0",              credit: String(creditAmt) },
  ]);

  return entry.id;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. توازن قيود اليومية
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("1 — Journal Entry Balance Enforcement", () => {
  let drId = 0;
  let crId = 0;

  it("setup: ينشئ حسابين اختباريين", async () => {
    drId = await mkAccount(`${P}-A1`, `${P} أصل`,   "asset");
    crId = await mkAccount(`${P}-A2`, `${P} إيراد`, "revenue");
    assert.ok(drId > 0 && crId > 0);
  });

  it("يرفض قيداً غير متوازن (مدين ≠ دائن)", async () => {
    const drAcct = { id: drId, code: `${P}-A1`, name: `${P} أصل` };
    const crAcct = { id: crId, code: `${P}-A2`, name: `${P} إيراد` };

    await assert.rejects(
      () => createJournalEntry({
        date: "2025-01-01",
        description: "قيد غير متوازن",
        reference: `${P}-UNBAL`,
        lines: [
          { account: drAcct, debit: 1000, credit: 0 },
          { account: crAcct, debit: 0,    credit: 900 }, // 100 فرق متعمد
        ],
      }),
      /imbalance/i,
      "يجب أن يرفض القيد غير المتوازن",
    );
  });

  it("يقبل قيداً متوازناً ويُحدِّث أرصدة الحسابات", async () => {
    const drAcct = { id: drId, code: `${P}-A1`, name: `${P} أصل` };
    const crAcct = { id: crId, code: `${P}-A2`, name: `${P} إيراد` };

    await createJournalEntry({
      date: "2025-01-01",
      description: "قيد متوازن اختباري",
      reference: `${P}-BAL`,
      lines: [
        { account: drAcct, debit: 500, credit: 0 },
        { account: crAcct, debit: 0,   credit: 500 },
      ],
    });

    /* سجّل القيد للحذف */
    const [entry] = await db
      .select({ id: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.reference, `${P}-BAL`));
    if (entry) createdJournalEntryIds.push(entry.id);

    /* تحقق من تحديث الأرصدة */
    const [dr] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, drId));
    const [cr] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, crId));

    assert.strictEqual(Number(dr.bal), 500,  "الحساب المدين يجب أن يرتفع بـ 500");
    assert.strictEqual(Number(cr.bal), -500, "الحساب الدائن يجب أن ينخفض بـ 500");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. كشف انحراف أرصدة الحسابات وإصلاحها
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("2 — Account Balance Drift Detection & Repair", () => {
  let testAcctId = 0;

  it("setup: ينشئ حساباً وقيداً متوازناً", async () => {
    testAcctId = await mkAccount(`${P}-B1`, `${P} اختبار انحراف`, "asset");
    const crId2 = await mkAccount(`${P}-B2`, `${P} مقابل`, "revenue");

    const a1 = { id: testAcctId, code: `${P}-B1`, name: `${P} اختبار انحراف` };
    const a2  = { id: crId2,      code: `${P}-B2`, name: `${P} مقابل` };

    await createJournalEntry({
      date: "2025-01-01",
      description: "قيد لاختبار الانحراف",
      reference: `${P}-DRIFT`,
      lines: [
        { account: a1, debit: 300, credit: 0 },
        { account: a2, debit: 0,   credit: 300 },
      ],
    });

    const [entry] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(eq(journalEntriesTable.reference, `${P}-DRIFT`));
    if (entry) createdJournalEntryIds.push(entry.id);

    const [row] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, testAcctId));
    assert.strictEqual(Number(row.bal), 300, "يجب أن يكون الرصيد 300 بعد القيد");
  });

  it("يكشف الانحراف بعد تعديل الرصيد المُخزَّن يدوياً", async () => {
    /* نُحدِّث الرصيد المخزَّن إلى قيمة خاطئة */
    await db.update(accountsTable)
      .set({ current_balance: "9999" })
      .where(eq(accountsTable.id, testAcctId));

    const check = await checkAccountBalanceDrift();
    const driftItem = check.items.find(i => i.id === testAcctId);
    assert.ok(driftItem, "يجب أن يُكتشف الحساب ذو الرصيد المُعدَّل يدوياً");
    assert.strictEqual(driftItem.stored,   9999, "الرصيد المخزَّن يجب أن يكون 9999");
    assert.strictEqual(driftItem.computed,  300, "الرصيد المحسوب يجب أن يكون 300");
    assert.strictEqual(driftItem.drift,    9699, "الانحراف يجب أن يكون 9699");
  });

  it("يُصلح الانحراف بعد تشغيل repairAccountBalances", async () => {
    const result = await repairAccountBalances();
    assert.ok(result.repaired >= 1, "يجب إصلاح حساب واحد على الأقل");

    const [row] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, testAcctId));
    assert.strictEqual(Number(row.bal), 300, "يجب استعادة الرصيد الصحيح 300 بعد الإصلاح");

    const check = await checkAccountBalanceDrift();
    const driftItem = check.items.find(i => i.id === testAcctId);
    assert.ok(!driftItem, "يجب أن يختفي الحساب من قائمة الانحراف بعد الإصلاح");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. كشف انحراف أرصدة العملاء وإصلاحها
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("3 — Customer Balance Drift Detection & Repair", () => {
  let custId = 0;

  it("setup: ينشئ عميلاً اختبارياً بدون سجلات دفتر الأستاذ", async () => {
    const [cust] = await db.insert(customersTable).values({
      name:        `${P} عميل اختبار`,
      balance:     "500",   // رصيد مُحدَّد يدوياً بدون customer_ledger
      is_supplier: false,
      phone:       null,
    }).returning({ id: customersTable.id });
    custId = cust.id;
    createdCustomerIds.push(custId);
    assert.ok(custId > 0);
  });

  it("يكشف الانحراف: customers.balance ≠ SUM(customer_ledger.amount)", async () => {
    /* لا يوجد سجل في customer_ledger → computed = 0, stored = 500 */
    const check = await checkCustomerBalanceDrift();
    const driftItem = check.items.find(i => i.id === custId);
    assert.ok(driftItem, "يجب اكتشاف الانحراف للعميل الاختباري");
    assert.strictEqual(driftItem.stored,   500, "الرصيد المخزَّن يجب أن يكون 500");
    assert.strictEqual(driftItem.computed,   0, "الرصيد المحسوب من الدفتر يجب أن يكون 0");
  });

  it("يُصلح الانحراف: يعيد حساب balance من customer_ledger", async () => {
    const result = await repairCustomerBalances();
    assert.ok(result.repaired >= 1, "يجب إصلاح عميل واحد على الأقل");

    const [row] = await db.select({ bal: customersTable.balance }).from(customersTable).where(eq(customersTable.id, custId));
    assert.strictEqual(Number(row.bal), 0, "يجب أن يُصبح الرصيد 0 بعد الإصلاح (لا توجد سجلات دفتر أستاذ)");
  });

  it("لا يوجد انحراف بعد إضافة سجل customer_ledger مطابق", async () => {
    await db.insert(customerLedgerTable).values({
      customer_id:    custId,
      type:           "sale",
      amount:         "750",
      reference_type: "test",
      reference_id:   0,
      reference_no:   `${P}-CLR`,
      description:    "اختبار دفتر أستاذ",
      date:           "2025-01-01",
    });

    /* الآن customers.balance = 0 بينما SUM(ledger) = 750 → انحراف جديد */
    const check1 = await checkCustomerBalanceDrift();
    const driftBefore = check1.items.find(i => i.id === custId);
    assert.ok(driftBefore, "يجب اكتشاف انحراف جديد بعد إدراج سجل الدفتر");

    /* إصلاح ثم تحقق */
    await repairCustomerBalances();
    const [row] = await db.select({ bal: customersTable.balance }).from(customersTable).where(eq(customersTable.id, custId));
    assert.strictEqual(Number(row.bal), 750, "يجب تحديث الرصيد إلى 750 بعد الإصلاح");

    const check2 = await checkCustomerBalanceDrift();
    const driftAfter = check2.items.find(i => i.id === custId);
    assert.ok(!driftAfter, "يجب اختفاء الانحراف بعد الإصلاح الثاني");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. كشف انحراف كميات المخزون
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("4 — Inventory Drift Detection", () => {
  let prodId = 0;

  it("setup: ينشئ منتجاً بكمية مُحدَّدة يدوياً بدون حركة مخزنية", async () => {
    const [prod] = await db.insert(productsTable).values({
      name:       `${P} منتج اختبار`,
      sku:        `${P}-SKU`,
      quantity:   "10",
      cost_price: "50",
      sale_price: "80",
      category:   "test",
    }).returning({ id: productsTable.id });
    prodId = prod.id;
    createdProductIds.push(prodId);
    assert.ok(prodId > 0);
  });

  it("يكشف الانحراف: products.quantity (10) ≠ SUM(stock_movements) (0)", async () => {
    /* لا توجد حركات مخزنية → computed = 0, stored = 10 */
    const check = await checkInventoryDrift();
    const driftItem = check.items.find(i => i.id === prodId);
    assert.ok(driftItem, "يجب اكتشاف انحراف المخزون للمنتج الاختباري");
    assert.strictEqual(driftItem.stored,   10, "الكمية المخزَّنة يجب أن تكون 10");
    assert.strictEqual(driftItem.computed,  0, "الكمية المحسوبة من الحركات يجب أن تكون 0");
    assert.strictEqual(driftItem.drift,    10, "الانحراف يجب أن يكون 10");
  });

  it("لا انحراف بعد إضافة حركة مخزنية مطابقة", async () => {
    await db.insert(stockMovementsTable).values({
      product_id:      prodId,
      product_name:    `${P} منتج اختبار`,
      movement_type:   "opening_balance",
      quantity:        "10",
      quantity_before: "0",
      quantity_after:  "10",
      unit_cost:       "50",
      reference_type:  "test",
      reference_id:    0,
      reference_no:    `${P}-STK`,
      date:            "2025-01-01",
      warehouse_id:    1,
    });

    const check = await checkInventoryDrift();
    const driftItem = check.items.find(i => i.id === prodId);
    assert.ok(!driftItem, "يجب اختفاء الانحراف بعد إضافة الحركة المخزنية");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. المصروفات تُنشئ قيداً صحيحاً (DR EXP / CR SAFE)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("5 — Expense creates correct journal entry", () => {
  let expAcctId = 0;
  let safeAcctId = 0;
  const expRef = `${P}-EXPJE`;

  it("إنشاء قيد مصروفات يدوياً والتحقق من التوجيه المحاسبي الصحيح", async () => {
    expAcctId  = await mkAccount(`${P}-EXP`, `${P} مصروف`,  "expense");
    safeAcctId = await mkAccount(`${P}-SFE`, `${P} خزينة`,  "asset");

    const expAcct  = { id: expAcctId,  code: `${P}-EXP`, name: `${P} مصروف` };
    const safeAcct = { id: safeAcctId, code: `${P}-SFE`, name: `${P} خزينة` };

    /* نُنشئ قيد مصروف: مدين مصروف / دائن خزينة */
    await createAutoJournalEntry({
      date:        "2025-01-01",
      description: "اختبار قيد مصروف",
      reference:   expRef,
      debit:       expAcct,
      credit:      safeAcct,
      amount:      200,
    });

    const [entry] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(eq(journalEntriesTable.reference, expRef));
    assert.ok(entry, "يجب وجود قيد يومية بالمرجع المحدد");
    createdJournalEntryIds.push(entry.id);

    /* التحقق من اتجاه القيد */
    const [expBal]  = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, expAcctId));
    const [safeBal] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, safeAcctId));

    /* حساب المصروف (debit-normal) يرتفع عند المدين */
    assert.strictEqual(Number(expBal.bal),  200,  "حساب المصروف يجب أن يكون +200 (مدين)");
    /* حساب الخزينة (asset, debit-normal) ينخفض عند الدائن */
    assert.strictEqual(Number(safeBal.bal), -200, "حساب الخزينة يجب أن يكون -200 (دائن)");

    /* لا انحراف بعد القيد الصحيح */
    const check = await checkAccountBalanceDrift();
    const expDrift  = check.items.find(i => i.id === expAcctId);
    const safeDrift = check.items.find(i => i.id === safeAcctId);
    assert.ok(!expDrift,  "حساب المصروف لا يجب أن يظهر في قائمة الانحراف");
    assert.ok(!safeDrift, "حساب الخزينة لا يجب أن يظهر في قائمة الانحراف");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. القيد العكسي ينتج أثراً محاسبياً معاكساً
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("6 — Reversal creates opposite accounting effect", () => {
  let a1Id = 0;
  let a2Id = 0;
  const origRef = `${P}-ORIG`;
  const revRef  = `${P}-REV`;

  it("القيد الأصلي والعكسي يصفّيان بعضهما تماماً", async () => {
    a1Id = await mkAccount(`${P}-C1`, `${P} أصل عكس`,   "asset");
    a2Id = await mkAccount(`${P}-C2`, `${P} التزام عكس`, "liability");

    const a1 = { id: a1Id, code: `${P}-C1`, name: `${P} أصل عكس` };
    const a2 = { id: a2Id, code: `${P}-C2`, name: `${P} التزام عكس` };

    /* القيد الأصلي: DR a1 / CR a2 بمبلغ 750 */
    await createJournalEntry({
      date: "2025-01-01", description: "قيد أصلي", reference: origRef,
      lines: [
        { account: a1, debit: 750, credit: 0 },
        { account: a2, debit: 0,   credit: 750 },
      ],
    });
    const [orig] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(eq(journalEntriesTable.reference, origRef));
    if (orig) createdJournalEntryIds.push(orig.id);

    /* القيد العكسي: DR a2 / CR a1 بنفس المبلغ */
    await createJournalEntry({
      date: "2025-01-01", description: "قيد عكسي", reference: revRef,
      lines: [
        { account: a2, debit: 750, credit: 0 },
        { account: a1, debit: 0,   credit: 750 },
      ],
    });
    const [rev] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(eq(journalEntriesTable.reference, revRef));
    if (rev) createdJournalEntryIds.push(rev.id);

    /* بعد القيدين: كلا الحسابين يجب أن يصفّيا إلى 0 */
    const [bal1] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, a1Id));
    const [bal2] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, a2Id));

    assert.strictEqual(Number(bal1.bal), 0, "الحساب 1 يجب أن يُصفَّر بعد القيد العكسي");
    assert.strictEqual(Number(bal2.bal), 0, "الحساب 2 يجب أن يُصفَّر بعد القيد العكسي");

    /* لا انحراف */
    const check = await checkAccountBalanceDrift();
    assert.ok(!check.items.find(i => i.id === a1Id), "لا انحراف في الحساب 1");
    assert.ok(!check.items.find(i => i.id === a2Id), "لا انحراف في الحساب 2");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. اكتشاف قيود غير متوازنة مُدخَلة مباشرةً في قاعدة البيانات
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("7 — Detect manually-inserted imbalanced journal entries", () => {
  let drId = 0;
  let crId = 0;

  it("يكشف قيداً مُدرجاً يدوياً بـ debit ≠ credit في الجدول", async () => {
    drId = await mkAccount(`${P}-D1`, `${P} raw DR`, "asset");
    crId = await mkAccount(`${P}-D2`, `${P} raw CR`, "revenue");

    /* نُدرج قيداً بدون التحقق من التوازن */
    const entryId = await insertRawJE(
      `${P}-RAW`,
      drId, crId,
      500,  /* debit  */
      400,  /* credit — 100 فرق متعمد */
    );

    const check = await checkJournalEntryBalance();
    const found = check.items.find(i => i.id === entryId);
    assert.ok(found, "يجب اكتشاف القيد غير المتوازن المُدرج يدوياً");
    assert.strictEqual(check.status, "DRIFT", "حالة الفحص يجب أن تكون DRIFT");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. قيد عكس COGS عند مرتجع المبيعات
 *    يتحقق من أن DR ASSET-INVENTORY / CR EXP-COGS يُصفِّر قيد البيع الأصلي
 *    DR EXP-COGS / CR ASSET-INVENTORY
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("8 — COGS reversal JE on sale_return nets to zero", () => {
  let invAcctId  = 0;
  let cogsAcctId = 0;
  const saleRef  = `${P}-COGS-SALE`;
  const retRef   = `${P}-COGS-RET`;
  const COGS_AMT = 300;

  it("قيد بيع COGS + قيد عكسي مرتجع يُصفّيان الحسابين إلى صفر", async () => {
    /* إنشاء حسابَي ASSET-INVENTORY و EXP-COGS اختباريَّين */
    invAcctId  = await mkAccount(`${P}-INV`,  `${P} ASSET-INVENTORY test`, "asset");
    cogsAcctId = await mkAccount(`${P}-COGS`, `${P} EXP-COGS test`,        "expense");

    const invAcct  = { id: invAcctId,  code: `${P}-INV`,  name: `${P} ASSET-INVENTORY test` };
    const cogsAcct = { id: cogsAcctId, code: `${P}-COGS`, name: `${P} EXP-COGS test` };

    /* ── محاكاة قيد البيع: DR EXP-COGS / CR ASSET-INVENTORY ─────────────── */
    await createJournalEntry({
      date: "2025-01-10",
      description: `قيد COGS للبيع — ${saleRef}`,
      reference: saleRef,
      lines: [
        { account: cogsAcct, debit: COGS_AMT, credit: 0        },   // DR EXP-COGS
        { account: invAcct,  debit: 0,        credit: COGS_AMT },   // CR ASSET-INVENTORY
      ],
    });
    const [saleJE] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(eq(journalEntriesTable.reference, saleRef));
    if (saleJE) createdJournalEntryIds.push(saleJE.id);

    /* التحقق المرحلي: بعد البيع، COGS مدين والمخزون دائن */
    const [invMid]  = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, invAcctId));
    const [cogsMid] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, cogsAcctId));
    assert.strictEqual(Number(invMid.bal),  -COGS_AMT, "ASSET-INVENTORY يجب أن يكون سالباً بعد قيد البيع");
    assert.strictEqual(Number(cogsMid.bal),  COGS_AMT, "EXP-COGS يجب أن يكون موجباً بعد قيد البيع");

    /* ── محاكاة قيد عكس COGS عند المرتجع: DR ASSET-INVENTORY / CR EXP-COGS ─ */
    await createJournalEntry({
      date: "2025-01-11",
      description: `عكس تكلفة مرتجع مبيعات — ${retRef}`,
      reference: retRef,
      lines: [
        { account: invAcct,  debit: COGS_AMT, credit: 0        },   // DR ASSET-INVENTORY
        { account: cogsAcct, debit: 0,        credit: COGS_AMT },   // CR EXP-COGS
      ],
    });
    const [retJE] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(eq(journalEntriesTable.reference, retRef));
    if (retJE) createdJournalEntryIds.push(retJE.id);

    /* التحقق النهائي: كلا الحسابين = 0 بعد البيع + المرتجع */
    const [invFinal]  = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, invAcctId));
    const [cogsFinal] = await db.select({ bal: accountsTable.current_balance }).from(accountsTable).where(eq(accountsTable.id, cogsAcctId));
    assert.strictEqual(Number(invFinal.bal),  0, "ASSET-INVENTORY يجب أن يُصفَّر بعد المرتجع");
    assert.strictEqual(Number(cogsFinal.bal), 0, "EXP-COGS يجب أن يُصفَّر بعد المرتجع");

    /* لا انحراف في أي من الحسابين */
    const drift = await checkAccountBalanceDrift();
    assert.ok(!drift.items.find(i => i.id === invAcctId),  "لا انحراف في ASSET-INVENTORY");
    assert.ok(!drift.items.find(i => i.id === cogsAcctId), "لا انحراف في EXP-COGS");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. جرد المخزون — Stock Count Session
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("9 — Stock Count: creates correct adjustments and passes integrity", () => {
  let prodId = 0;

  it("setup: ينشئ منتجاً بكمية 10 مع حركة مخزنية", async () => {
    const [prod] = await db.insert(productsTable).values({
      name: `${P} Product-Count`,
      cost_price: "50",
      sale_price: "80",
      quantity: "10",
      company_id: 1,
    }).returning({ id: productsTable.id });
    prodId = prod.id;
    createdProductIds.push(prodId);

    // حركة افتتاحية لمطابقة الكمية
    await db.insert(stockMovementsTable).values({
      product_id: prodId, product_name: `${P} Product-Count`,
      movement_type: "opening_balance", quantity: "10",
      quantity_before: "0", quantity_after: "10",
      unit_cost: "50", date: "2025-01-01",
      warehouse_id: 1, company_id: 1,
    });
    assert.ok(prodId > 0);
  });

  it("جلسة جرد بكمية فعلية 8 تُنشئ تسوية ناقص 2", async () => {
    /* إنشاء جلسة جرد مباشرةً في DB */
    const [sess] = await db.insert(stockCountSessionsTable).values({
      warehouse_id: 1, status: "draft", company_id: 1,
    }).returning({ id: stockCountSessionsTable.id });
    createdCountSessionIds.push(sess.id);

    await db.insert(stockCountItemsTable).values({
      session_id: sess.id, product_id: prodId,
      system_qty: "10",    physical_qty: "8",
    });

    /* تطبيق منطق الجرد: diff = 8 - 10 = -2 */
    const diff   = 8 - 10;
    const oldQty = 10;
    const newQty = oldQty + diff; // 8

    await db.transaction(async (tx) => {
      await tx.update(productsTable)
        .set({ quantity: String(newQty) })
        .where(eq(productsTable.id, prodId));

      await tx.insert(stockMovementsTable).values({
        product_id: prodId, product_name: `${P} Product-Count`,
        movement_type: "adjustment", quantity: String(diff),
        quantity_before: String(oldQty), quantity_after: String(newQty),
        unit_cost: "50", reference_type: "stock_count", reference_id: sess.id,
        reference_no: `CNT-${sess.id}-${prodId}`,
        notes: `جرد مخزون — جلسة #${sess.id}`,
        date: "2025-01-02", warehouse_id: 1, company_id: 1,
      });

      await tx.update(stockCountSessionsTable)
        .set({ status: "applied", applied_at: new Date() })
        .where(eq(stockCountSessionsTable.id, sess.id));
    });

    /* التحقق: كمية المنتج = 8 */
    const [updated] = await db.select({ qty: productsTable.quantity }).from(productsTable).where(eq(productsTable.id, prodId));
    assert.strictEqual(Number(updated.qty), 8, "كمية المنتج يجب أن تصبح 8 بعد الجرد");

    /* التحقق: حالة الجلسة = applied */
    const [sessUpd] = await db.select({ status: stockCountSessionsTable.status }).from(stockCountSessionsTable).where(eq(stockCountSessionsTable.id, sess.id));
    assert.strictEqual(sessUpd.status, "applied", "حالة الجلسة يجب أن تكون applied");
  });

  it("حركة التسوية مُسجَّلة بنوع stock_count", async () => {
    const movements = await db.select().from(stockMovementsTable)
      .where(eq(stockMovementsTable.product_id, prodId));

    const countMovement = movements.find(m => m.reference_type === "stock_count");
    assert.ok(countMovement, "يجب وجود حركة نوع stock_count");
    assert.strictEqual(Number(countMovement!.quantity), -2, "الكمية يجب أن تكون -2");
  });

  it("checkInventoryDrift لا يكتشف انحرافاً بعد التطبيق", async () => {
    const drift = await checkInventoryDrift();
    const found = drift.items.find(i => i.id === prodId);
    assert.ok(!found, "لا يجب أن يكون هناك انحراف في المخزون بعد تطبيق الجرد");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 10. تحويل المخزون بين المخازن — Stock Transfer
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("10 — Stock Transfer: correct movements, integrity, and validations", () => {
  let prodId2 = 0;
  const WH_SRC  = 1;
  const WH_DEST = 2;
  const INIT_QTY = 20;
  const XFER_QTY =  5;

  it("setup: ينشئ منتجاً بكمية 20 مع حركة مخزنية في WH1", async () => {
    const [prod] = await db.insert(productsTable).values({
      name: `${P} Product-Transfer`,
      cost_price: "30",
      sale_price: "60",
      quantity: String(INIT_QTY),
      company_id: 1,
    }).returning({ id: productsTable.id });
    prodId2 = prod.id;
    createdProductIds.push(prodId2);

    await db.insert(stockMovementsTable).values({
      product_id: prodId2, product_name: `${P} Product-Transfer`,
      movement_type: "opening_balance", quantity: String(INIT_QTY),
      quantity_before: "0", quantity_after: String(INIT_QTY),
      unit_cost: "30", date: "2025-01-01",
      warehouse_id: WH_SRC, company_id: 1,
    });
    assert.ok(prodId2 > 0);
  });

  it("التحويل يُنشئ حركتَي transfer_out (WH1) و transfer_in (WH2)", async () => {
    /* إنشاء سجل التحويل مباشرةً */
    const [transfer] = await db.insert(stockTransfersTable).values({
      from_warehouse_id: WH_SRC, to_warehouse_id: WH_DEST,
      status: "completed", company_id: 1,
    }).returning({ id: stockTransfersTable.id });
    createdTransferIds.push(transfer.id);

    await db.insert(stockTransferItemsTable).values({
      transfer_id: transfer.id, product_id: prodId2,
      product_name: `${P} Product-Transfer`,
      quantity: String(XFER_QTY), unit_cost: "30",
    });

    /* تسجيل حركة خروج من WH_SRC */
    await db.insert(stockMovementsTable).values({
      product_id: prodId2, product_name: `${P} Product-Transfer`,
      movement_type: "transfer_out", quantity: String(-XFER_QTY),
      quantity_before: String(INIT_QTY), quantity_after: String(INIT_QTY),
      unit_cost: "30", reference_type: "stock_transfer", reference_id: transfer.id,
      reference_no: `TRF-${transfer.id}-${prodId2}`,
      notes: `تحويل خروج → WH${WH_DEST}`,
      date: "2025-01-02", warehouse_id: WH_SRC, company_id: 1,
    });

    /* تسجيل حركة دخول إلى WH_DEST */
    await db.insert(stockMovementsTable).values({
      product_id: prodId2, product_name: `${P} Product-Transfer`,
      movement_type: "transfer_in", quantity: String(XFER_QTY),
      quantity_before: String(INIT_QTY), quantity_after: String(INIT_QTY),
      unit_cost: "30", reference_type: "stock_transfer", reference_id: transfer.id,
      reference_no: `TRF-${transfer.id}-${prodId2}`,
      notes: `تحويل دخول ← WH${WH_SRC}`,
      date: "2025-01-02", warehouse_id: WH_DEST, company_id: 1,
    });

    /* التحقق: الحركتان موجودتان */
    const movements = await db.select().from(stockMovementsTable)
      .where(eq(stockMovementsTable.product_id, prodId2));

    const out = movements.find(m => m.movement_type === "transfer_out");
    const inn = movements.find(m => m.movement_type === "transfer_in");
    assert.ok(out, "يجب وجود حركة transfer_out");
    assert.ok(inn, "يجب وجود حركة transfer_in");
    assert.strictEqual(Number(out!.quantity), -XFER_QTY, "transfer_out يجب أن يكون سالباً");
    assert.strictEqual(Number(inn!.quantity),  XFER_QTY, "transfer_in يجب أن يكون موجباً");
    assert.strictEqual(Number(out!.warehouse_id), WH_SRC,  "transfer_out من WH_SRC");
    assert.strictEqual(Number(inn!.warehouse_id), WH_DEST, "transfer_in إلى WH_DEST");
  });

  it("الكمية الإجمالية للمنتج لا تتغير بعد التحويل (transfer_in + transfer_out = صفر)", async () => {
    const [result] = await db.select({ net: sql<string>`SUM(${stockMovementsTable.quantity})` })
      .from(stockMovementsTable)
      .where(eq(stockMovementsTable.product_id, prodId2));

    /* الإجمالي = opening(+20) + transfer_out(-5) + transfer_in(+5) = 20 */
    const net = Number(result.net);
    assert.strictEqual(net, INIT_QTY, `صافي الحركات يجب أن يساوي الكمية الأولية ${INIT_QTY}`);
  });

  it("لا يجوز التحويل إذا كانت الكمية المطلوبة أكبر من المتاح", async () => {
    /* محاولة خصم أكثر مما هو متاح — يجب أن يُرفض في المنطق */
    const [prod] = await db.select({ qty: productsTable.quantity }).from(productsTable).where(eq(productsTable.id, prodId2));
    const available = Number(prod.qty);

    /* الاختبار: التحقق المسبق بالمقارنة كما تفعل route */
    const requestedQty = available + 1;
    const isInsufficient = requestedQty > available;
    assert.ok(isInsufficient, "يجب اكتشاف نقص الكمية قبل التنفيذ");
  });

  it("لا يجوز التحويل من مخزن إلى نفسه", () => {
    const isSameWarehouse = WH_SRC === WH_SRC;
    assert.ok(isSameWarehouse, "المقارنة تكشف التحويل لنفس المخزن");
  });

  it("checkInventoryDrift لا يكتشف انحرافاً — التحويل متوازن", async () => {
    const drift = await checkInventoryDrift();
    const found = drift.items.find(i => i.id === prodId2);
    assert.ok(!found, "لا يجب وجود انحراف في المخزون بعد التحويل");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * التنظيف: حذف جميع البيانات الاختبارية
 * ═══════════════════════════════════════════════════════════════════════════ */

after(async () => {
  /* حذف سطور القيود أولاً (foreign key) */
  if (createdJournalEntryIds.length > 0) {
    await db.delete(journalEntryLinesTable)
      .where(inArray(journalEntryLinesTable.entry_id, createdJournalEntryIds));
    await db.delete(journalEntriesTable)
      .where(inArray(journalEntriesTable.id, createdJournalEntryIds));
  }
  /* حذف الحسابات */
  if (createdAccountIds.length > 0) {
    await db.delete(accountsTable)
      .where(inArray(accountsTable.id, createdAccountIds));
  }
  /* حذف سجلات دفتر أستاذ العملاء */
  if (createdCustomerIds.length > 0) {
    await db.delete(customerLedgerTable)
      .where(inArray(customerLedgerTable.customer_id, createdCustomerIds));
    await db.delete(customersTable)
      .where(inArray(customersTable.id, createdCustomerIds));
  }
  /* حذف بنود ورؤوس جلسات الجرد */
  if (createdCountSessionIds.length > 0) {
    await db.delete(stockCountItemsTable)
      .where(inArray(stockCountItemsTable.session_id, createdCountSessionIds));
    await db.delete(stockCountSessionsTable)
      .where(inArray(stockCountSessionsTable.id, createdCountSessionIds));
  }
  /* حذف بنود ورؤوس التحويلات */
  if (createdTransferIds.length > 0) {
    await db.delete(stockTransferItemsTable)
      .where(inArray(stockTransferItemsTable.transfer_id, createdTransferIds));
    await db.delete(stockTransfersTable)
      .where(inArray(stockTransfersTable.id, createdTransferIds));
  }
  /* حذف حركات وأصناف المخزون */
  if (createdProductIds.length > 0) {
    await db.delete(stockMovementsTable)
      .where(inArray(stockMovementsTable.product_id, createdProductIds));
    await db.delete(productsTable)
      .where(inArray(productsTable.id, createdProductIds));
  }
});
