/**
 * ═══════════════════════════════════════════════════════════════════
 *  تدقيق محاسبي شامل — Halal Tech ERP
 *  يختبر: WAC · COGS · مرتجعات · سندات القبض · الأرباح · ميزان المراجعة
 * ═══════════════════════════════════════════════════════════════════
 *  تشغيل: node artifacts/api-server/accounting-audit.mjs
 */

const BASE = "http://localhost:8080/api";

let token = "";
let passCount = 0;
let failCount = 0;
const failures = [];

// ── أدوات ─────────────────────────────────────────────────────────────────────
function pass(label) {
  passCount++;
  console.log(`  ✅ ${label}`);
}
function fail(label, got, expected) {
  failCount++;
  const msg = `  ❌ ${label}\n     المتوقع: ${JSON.stringify(expected)}\n     الفعلي:  ${JSON.stringify(got)}`;
  failures.push(msg);
  console.log(msg);
}
function check(label, got, expected, epsilon = 0.01) {
  if (typeof expected === "number") {
    Math.abs(Number(got) - expected) <= epsilon ? pass(label) : fail(label, got, expected);
  } else {
    got === expected ? pass(label) : fail(label, got, expected);
  }
}
function near(a, b, eps = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}
function section(title) {
  console.log(`\n${"═".repeat(60)}\n  ${title}\n${"═".repeat(60)}`);
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// ── 0. تسجيل الدخول ───────────────────────────────────────────────────────────
async function login() {
  section("0. تسجيل الدخول");

  const users = await fetch(`${BASE}/auth/users`).then(r => r.json());
  const adminUser = users.find(u => u.username === "admin" || u.role === "admin");
  if (!adminUser) throw new Error("لم يُوجد مستخدم admin");
  console.log(`  ℹ️  الأدمن: ${adminUser.name} (id=${adminUser.id})`);

  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: adminUser.id, pin: "123456" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`فشل تسجيل الدخول: ${JSON.stringify(data)}`);
  token = data.token;
  if (!token) throw new Error("لا يوجد token في استجابة تسجيل الدخول");
  pass("تسجيل الدخول بنجاح — admin");
  return data;
}

// ── مساعد: جلب منتج من القائمة بـ id ──────────────────────────────────────────
async function getProduct(id) {
  const all = await api("GET", "/products");
  return all.find(p => p.id === id) ?? null;
}
async function getCustomer(id) {
  const all = await api("GET", "/customers");
  return all.find(c => c.id === id) ?? null;
}
async function getSupplier(id) {
  const all = await api("GET", "/suppliers");
  return all.find(s => s.id === id) ?? null;
}

// ── 1. إعداد بيانات الاختبار ──────────────────────────────────────────────────
async function setup() {
  section("1. إعداد بيانات الاختبار");

  // خزينة — نبحث عن خزينة برصيد كافٍ (≥ 2000)، وإلا ننشئ واحدة جديدة
  const safes = await api("GET", "/settings/safes");
  let safe = safes.find(s => Number(s.balance) >= 2000);
  if (!safe) {
    const runId = Date.now();
    safe = await api("POST", "/settings/safes", { name: `خزينة الاختبار ${runId}`, balance: 10000 });
    pass(`إنشاء خزينة جديدة (رصيد 10000)`);
  } else {
    console.log(`  ℹ️  خزينة: ${safe.name} (رصيد: ${safe.balance})`);
  }

  // عميل
  let customers = await api("GET", "/customers");
  let customer = customers.find(c => c.name === "عميل الاختبار المحاسبي");
  if (!customer) {
    customer = await api("POST", "/customers", {
      name: "عميل الاختبار المحاسبي",
      phone: "01000000001",
      balance: 0,
    });
    pass("إنشاء عميل جديد");
  } else {
    console.log(`  ℹ️  عميل: ${customer.name} (رصيد: ${customer.balance})`);
  }

  // مورّد
  let suppliers = await api("GET", "/suppliers");
  let supplier = suppliers.find(s => s.name === "مورد الاختبار المحاسبي");
  if (!supplier) {
    supplier = await api("POST", "/suppliers", {
      name: "مورد الاختبار المحاسبي",
      phone: "01000000002",
      balance: 0,
    });
    pass("إنشاء مورد جديد");
  } else {
    console.log(`  ℹ️  مورد: ${supplier.name}`);
  }

  // منتج — نصفّر الكمية والتكلفة لنبدأ من الصفر
  let products = await api("GET", "/products");
  let product = products.find(p => p.name === "منتج الاختبار المحاسبي");
  if (!product) {
    product = await api("POST", "/products", {
      name: "منتج الاختبار المحاسبي",
      category: "اختبار",
      unit: "قطعة",
      sale_price: 120,
      cost_price: 0,
      quantity: 0,
      min_stock: 2,
    });
    pass("إنشاء منتج جديد");
  } else {
    // إعادة تصفير
    await api("PUT", `/products/${product.id}`, {
      name: product.name,
      category: product.category ?? "اختبار",
      unit: product.unit ?? "قطعة",
      sale_price: 120,
      cost_price: 0,
      quantity: 0,
      min_stock: 2,
    });
    product = await getProduct(product.id);
    console.log(`  ℹ️  منتج موجود — تم تصفيره: ${product.name}`);
  }

  check("الكمية الابتدائية = 0", Number(product.quantity), 0);
  check("التكلفة الابتدائية = 0", Number(product.cost_price), 0);

  return { safe, customer, supplier, product };
}

// ── 2. شراء أول: 10 وحدات @ 70 ────────────────────────────────────────────────
async function testPurchase1({ safe, supplier, product }) {
  section("2. شراء أول — 10 وحدات @ 70 (WAC = 70)");

  const purchase = await api("POST", "/purchases", {
    payment_type: "cash",
    total_amount: 700,
    paid_amount: 700,
    safe_id: safe.id,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    items: [{
      product_id: product.id,
      product_name: product.name,
      quantity: 10,
      unit_price: 70,
      total_price: 700,
    }],
    date: new Date().toISOString().split("T")[0],
  });

  check("حالة الشراء = paid", purchase.status, "paid");
  check("إجمالي الشراء = 700", purchase.total_amount, 700);

  const prod = await getProduct(product.id);
  check("الكمية بعد الشراء الأول = 10", Number(prod.quantity), 10);
  check("WAC بعد الشراء الأول = 70.0000", Number(prod.cost_price), 70, 0.001);

  // ترحيل
  await api("POST", `/purchases/${purchase.id}/post`);
  check("ترحيل الشراء الأول ناجح", (await api("GET", "/purchases")).find(p => p.id === purchase.id)?.posting_status, "posted");

  return { purchase, wac: 70 };
}

// ── 3. شراء ثانٍ: 5 وحدات @ 90 → WAC مركّب ───────────────────────────────────
async function testPurchase2({ safe, supplier, product }) {
  section("3. شراء ثانٍ — 5 وحدات @ 90 (WAC مركّب = 76.6667)");

  // WAC المتوقع: (10×70 + 5×90) / 15 = 1150/15 ≈ 76.6667
  const expectedWAC = (10 * 70 + 5 * 90) / 15;

  const purchase = await api("POST", "/purchases", {
    payment_type: "cash",
    total_amount: 450,
    paid_amount: 450,
    safe_id: safe.id,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    items: [{
      product_id: product.id,
      product_name: product.name,
      quantity: 5,
      unit_price: 90,
      total_price: 450,
    }],
    date: new Date().toISOString().split("T")[0],
  });

  const prod = await getProduct(product.id);
  check("الكمية بعد الشراء الثاني = 15", Number(prod.quantity), 15);
  check(`WAC مركّب = ${expectedWAC.toFixed(4)}`, Number(prod.cost_price), expectedWAC, 0.01);

  await api("POST", `/purchases/${purchase.id}/post`);
  pass("ترحيل الشراء الثاني");

  const wac = Number(prod.cost_price);
  console.log(`  ℹ️  WAC الحالي: ${wac.toFixed(4)}`);
  return { purchase, wac };
}

// ── 4. بيع نقدي: 3 وحدات @ 120 ────────────────────────────────────────────────
async function testCashSale({ safe, customer, product, wac }) {
  section(`4. بيع نقدي — 3 وحدات @ 120 (COGS = 3×${wac.toFixed(4)} = ${(3*wac).toFixed(2)})`);

  const expectedCostTotal = wac * 3;
  const saleTotal = 120 * 3; // 360

  const sale = await api("POST", "/sales", {
    payment_type: "cash",
    total_amount: saleTotal,
    paid_amount: saleTotal,
    safe_id: safe.id,
    customer_id: customer.id,
    customer_name: customer.name,
    items: [{
      product_id: product.id,
      product_name: product.name,
      quantity: 3,
      unit_price: 120,
      total_price: saleTotal,
    }],
    date: new Date().toISOString().split("T")[0],
  });

  check("حالة الفاتورة = paid", sale.status, "paid");
  check("إجمالي البيع = 360", sale.total_amount, saleTotal);

  const prod = await getProduct(product.id);
  check("الكمية بعد البيع = 12", Number(prod.quantity), 12);

  // التحقق من cost_price في بند الفاتورة
  const sales = await api("GET", "/sales");
  const saleDetail = sales.find(s => s.id === sale.id);
  // نجلب تفاصيل الفاتورة بـ GET /sales/:id
  const saleItemsRes = await api("GET", `/sales/${sale.id}`);
  const saleItem = saleItemsRes.items?.[0];

  if (saleItem) {
    check(
      `cost_price في البند = WAC (${wac.toFixed(4)})`,
      Number(saleItem.cost_price),
      wac,
      0.02,
    );
    check(
      `cost_total = ${expectedCostTotal.toFixed(2)} (WAC × 3)`,
      Number(saleItem.cost_total),
      expectedCostTotal,
      0.02,
    );
  } else {
    fail("جلب بنود الفاتورة", "لا بنود", "يجب أن تكون بنود");
  }

  // ترحيل
  await api("POST", `/sales/${sale.id}/post`);
  pass("ترحيل فاتورة المبيعات النقدية");

  // فحص الأرباح بعد الترحيل
  const today = new Date().toISOString().split("T")[0];
  const profits = await api("GET", `/profits?date_from=${today}&date_to=${today}`);
  check("إيراد الأرباح ≥ 360 بعد الترحيل", profits.total_revenue >= saleTotal - 0.01, true);
  check(
    `تكلفة الأرباح ≥ ${expectedCostTotal.toFixed(2)}`,
    profits.total_cost >= expectedCostTotal - 0.01,
    true,
  );
  console.log(`  ℹ️  أرباح الآن: إيراد=${profits.total_revenue} | تكلفة=${profits.total_cost} | ربح=${profits.gross_profit}`);

  return { sale, expectedCostTotal, saleTotal };
}

// ── 5. بيع آجل: 2 وحدات @ 120 ─────────────────────────────────────────────────
async function testCreditSale({ customer, product, wac }) {
  section(`5. بيع آجل — 2 وحدات @ 120 (ذمم عملاء +240)`);

  const custBefore = await getCustomer(customer.id);
  const balanceBefore = Number(custBefore.balance);
  const saleTotal = 2 * 120; // 240

  const sale = await api("POST", "/sales", {
    payment_type: "credit",
    total_amount: saleTotal,
    paid_amount: 0,
    customer_id: customer.id,
    customer_name: customer.name,
    items: [{
      product_id: product.id,
      product_name: product.name,
      quantity: 2,
      unit_price: 120,
      total_price: saleTotal,
    }],
    date: new Date().toISOString().split("T")[0],
  });

  check("حالة البيع الآجل = unpaid", sale.status, "unpaid");
  check("المبلغ المتبقي = 240", sale.remaining_amount, saleTotal);

  const prod = await getProduct(product.id);
  check("الكمية بعد البيع الآجل = 10", Number(prod.quantity), 10);

  // ترحيل أولاً — القيد المحاسبي (AR) يُنشأ عند الترحيل، وdفتر الأستاذ يُحدَّث عنده
  await api("POST", `/sales/${sale.id}/post`);
  pass("ترحيل فاتورة البيع الآجل");

  // فحص رصيد العميل بعد الترحيل (ledger balance)
  const custAfter = await getCustomer(customer.id);
  check(
    `رصيد العميل زاد +${saleTotal} (${balanceBefore} → ${balanceBefore + saleTotal})`,
    Number(custAfter.balance),
    balanceBefore + saleTotal,
  );

  return { sale, balanceBefore, saleTotal };
}

// ── 6. سند قبض: 150 جنيه ──────────────────────────────────────────────────────
async function testReceiptVoucher({ safe, customer }) {
  section("6. سند قبض — 150 جنيه (تخفيض ذمة العميل)");

  const custBefore = await getCustomer(customer.id);
  const balanceBefore = Number(custBefore.balance);
  const paymentAmount = 150;

  const voucher = await api("POST", "/receipt-vouchers", {
    customer_id: customer.id,
    customer_name: customer.name,
    safe_id: safe.id,
    amount: paymentAmount,
    date: new Date().toISOString().split("T")[0],
  });

  check("رقم سند القبض موجود", !!voucher.voucher_no, true);
  check("مبلغ سند القبض = 150", Number(voucher.amount), paymentAmount);

  // ترحيل أولاً — القيد المحاسبي (AR credit) يُنشأ عند الترحيل
  await api("POST", `/receipt-vouchers/${voucher.id}/post`);
  pass("ترحيل سند القبض");

  // فحص رصيد العميل بعد الترحيل (ledger balance)
  const custAfter = await getCustomer(customer.id);
  check(
    `رصيد العميل انخفض -${paymentAmount} (${balanceBefore} → ${balanceBefore - paymentAmount})`,
    Number(custAfter.balance),
    Math.max(0, balanceBefore - paymentAmount),
  );

  return voucher;
}

// ── 7. مرتجع مبيعات: 1 وحدة من البيع النقدي ──────────────────────────────────
async function testSalesReturn({ safe, customer, product, cashSale, wac }) {
  section("7. مرتجع مبيعات — 1 وحدة (استرداد نقدي، WAC يُعاد تحديثه)");

  const prodBefore = await getProduct(product.id);
  const qtyBefore = Number(prodBefore.quantity);
  const wacBefore = Number(prodBefore.cost_price);

  // جلب تفاصيل الفاتورة للحصول على original_sale_item_id
  const saleDetail = await api("GET", `/sales/${cashSale.id}`);
  const origItem = saleDetail.items?.find(i => i.product_id === product.id);
  if (!origItem) {
    fail("جلب بند البيع الأصلي للمرتجع", "غير موجود", "موجود");
    return null;
  }

  const retQty = 1;
  const retPrice = 120;
  const costAtOrigSale = Number(origItem.cost_price); // WAC وقت البيع

  const ret = await api("POST", "/sales-returns", {
    sale_id: cashSale.id,
    customer_id: customer.id,
    customer_name: customer.name,
    refund_type: "cash",
    safe_id: safe.id,
    items: [{
      product_id: product.id,
      product_name: product.name,
      quantity: retQty,
      unit_price: retPrice,
      total_price: retPrice * retQty,
      original_sale_item_id: origItem.id,
    }],
    date: new Date().toISOString().split("T")[0],
  });

  check("رقم مرتجع المبيعات موجود", !!ret.return_no, true);
  check("إجمالي المرتجع = 120", Number(ret.total_amount), 120);

  const prodAfter = await getProduct(product.id);
  check(
    `الكمية ارتفعت: ${qtyBefore} → ${qtyBefore + retQty}`,
    Number(prodAfter.quantity),
    qtyBefore + retQty,
  );

  // WAC المتوقع: ((qtyBefore × wacBefore) + (retQty × costAtOrigSale)) / (qtyBefore + retQty)
  const newQty = qtyBefore + retQty;
  const expectedNewWAC = (qtyBefore * wacBefore + retQty * costAtOrigSale) / newQty;
  check(
    `WAC بعد المرتجع = ${expectedNewWAC.toFixed(4)} (مرجّح بالتكلفة الأصلية)`,
    Number(prodAfter.cost_price),
    expectedNewWAC,
    0.01,
  );

  const today = new Date().toISOString().split("T")[0];
  const profits = await api("GET", `/profits?date_from=${today}&date_to=${today}`);
  console.log(`  ℹ️  أرباح بعد المرتجع: إيراد=${profits.total_revenue} | تكلفة=${profits.total_cost} | ربح=${profits.gross_profit}`);

  return ret;
}

// ── 8. مرتجع مشتريات: 2 وحدة من الشراء الأول ────────────────────────────────
async function testPurchaseReturn({ safe, supplier, product, purchase1 }) {
  section("8. مرتجع مشتريات — 2 وحدة من الشراء الأول @ 70");

  const prodBefore = await getProduct(product.id);
  const qtyBefore = Number(prodBefore.quantity);
  const wacBefore = Number(prodBefore.cost_price);

  // جلب تفاصيل الشراء للحصول على بند المنتج
  const purchDetail = await api("GET", `/purchases/${purchase1.id}`);
  const origItem = purchDetail.items?.find(i => i.product_id === product.id);
  if (!origItem) {
    fail("جلب بند الشراء الأصلي", "غير موجود", "موجود");
    return null;
  }

  const retQty = 2;
  const historicalCost = Number(origItem.unit_price); // = 70

  const ret = await api("POST", "/purchase-returns", {
    purchase_id: purchase1.id,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    refund_type: "cash",
    safe_id: safe.id,
    items: [{
      product_id: product.id,
      product_name: product.name,
      quantity: retQty,
      unit_price: historicalCost,
      total_price: historicalCost * retQty,
      original_purchase_item_id: origItem.id,
    }],
    date: new Date().toISOString().split("T")[0],
  });

  check("رقم مرتجع الشراء موجود", !!ret.return_no, true);
  check(`إجمالي مرتجع الشراء = ${historicalCost * retQty}`, Number(ret.total_amount), historicalCost * retQty);

  const prodAfter = await getProduct(product.id);
  check(
    `الكمية انخفضت: ${qtyBefore} → ${qtyBefore - retQty}`,
    Number(prodAfter.quantity),
    qtyBefore - retQty,
  );

  const newQty = qtyBefore - retQty;
  const expectedNewWAC = newQty > 0
    ? Math.max(0, (qtyBefore * wacBefore - retQty * historicalCost) / newQty)
    : wacBefore;
  check(
    `WAC بعد مرتجع الشراء = ${expectedNewWAC.toFixed(4)}`,
    Number(prodAfter.cost_price),
    expectedNewWAC,
    0.01,
  );

  console.log(`  ℹ️  الكمية النهائية: ${prodAfter.quantity} | WAC النهائي: ${prodAfter.cost_price}`);
  return ret;
}

// ── 9. تدقيق تقرير الأرباح الشامل ────────────────────────────────────────────
async function testProfitsReport() {
  section("9. تقرير الأرباح — التحقق الشامل");

  const today = new Date().toISOString().split("T")[0];
  const profits = await api("GET", `/profits?date_from=${today}&date_to=${today}`);

  check("invoice_count > 0 (مبيعات مرحَّلة موجودة)", profits.invoice_count > 0, true);
  check(
    "الربح الإجمالي = إيراد - تكلفة",
    near(profits.gross_profit, profits.total_revenue - profits.total_cost, 0.05),
    true,
  );
  check(
    "صافي الربح = ربح إجمالي - مصاريف",
    near(profits.net_profit, profits.gross_profit - profits.total_expenses, 0.05),
    true,
  );
  const expectedMargin = profits.total_revenue > 0
    ? (profits.gross_profit / profits.total_revenue) * 100
    : 0;
  check(
    `هامش الربح = ${expectedMargin.toFixed(2)}%`,
    near(profits.profit_margin, expectedMargin, 0.1),
    true,
  );

  console.log(`  ℹ️  ملخص الأرباح:`);
  console.log(`     إيراد: ${profits.total_revenue} | تكلفة: ${profits.total_cost} | ربح إجمالي: ${profits.gross_profit}`);
  console.log(`     مصاريف: ${profits.total_expenses} | صافي ربح: ${profits.net_profit} | هامش: ${profits.profit_margin}%`);

  if (profits.by_product?.length > 0) {
    console.log(`  ℹ️  تفصيل بالمنتج:`);
    profits.by_product.forEach(p => {
      const testProd = p.product_name === "منتج الاختبار المحاسبي";
      const mark = testProd ? " ◄" : "";
      console.log(`     ${p.product_name}: qty=${p.qty_sold} | إيراد=${p.revenue} | تكلفة=${p.cost} | ربح=${p.profit}${mark}`);
    });
  }

  return profits;
}

// ── 10. تدقيق تقرير الصحة المحاسبية ──────────────────────────────────────────
async function testHealthCheck() {
  section("10. تقرير صحة النظام المحاسبي");

  const hc = await api("GET", "/reports/health-check");

  if (hc.journalBalance !== undefined) {
    check(
      "ميزان القيود المحاسبية (مدين = دائن)",
      near(hc.journalBalance?.totalDebit, hc.journalBalance?.totalCredit, 0.05),
      true,
    );
    console.log(`  ℹ️  إجمالي مدين: ${hc.journalBalance?.totalDebit} | إجمالي دائن: ${hc.journalBalance?.totalCredit}`);
  }

  if (hc.issues?.length === 0 || !hc.issues) {
    pass("لا توجد مشكلات في تقرير الصحة");
  } else {
    console.log(`  ⚠️  مشكلات (${hc.issues.length}):`);
    hc.issues.forEach(i => console.log(`     - ${JSON.stringify(i)}`));
  }

  console.log(`  ℹ️  تقرير الصحة:`, JSON.stringify(hc).slice(0, 300));
  return hc;
}

// ── 11. فحص تكامل حركات المخزون ──────────────────────────────────────────────
async function testStockMovements({ product }) {
  section("11. تكامل حركات المخزون — تتابع الكميات");

  const inv = await api("GET", `/inventory/product/${product.id}`);
  const movements = inv.movements ?? inv;

  if (!movements?.length) {
    console.log("  ⚠️  لا توجد حركات مخزون — اختبار مُتخطَّى");
    return;
  }

  // فرز بـ id أو التاريخ
  const sorted = [...movements].sort((a, b) => {
    if (a.id && b.id) return Number(a.id) - Number(b.id);
    const da = new Date(a.created_at ?? a.date ?? 0).getTime();
    const db = new Date(b.created_at ?? b.date ?? 0).getTime();
    return da - db;
  });

  // نجد بداية جلسة الاختبار الحالية: آخر حركة quantity_before = 0 (أول شراء في الجلسة)
  let startIdx = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (near(Number(sorted[i].quantity_before), 0, 0.001) && sorted[i].movement_type === "purchase") {
      startIdx = i;
      break;
    }
  }
  const currentRun = sorted.slice(startIdx);
  console.log(`  ℹ️  حركات الجلسة الحالية: ${currentRun.length} حركة (من إجمالي ${sorted.length})`);

  let allOk = true;
  for (let i = 1; i < currentRun.length; i++) {
    const prev = currentRun[i - 1];
    const curr = currentRun[i];
    if (!near(Number(prev.quantity_after), Number(curr.quantity_before), 0.001)) {
      fail(
        `حركة #${i + 1} (${curr.movement_type}): quantity_before (${curr.quantity_before}) ≠ quantity_after السابقة (${prev.quantity_after})`,
        curr.quantity_before,
        prev.quantity_after,
      );
      allOk = false;
    }
  }
  if (allOk) pass(`تتابع حركات المخزون سليم (${currentRun.length} حركة في الجلسة)`);

  console.log(`  ℹ️  آخر 5 حركات:`);
  sorted.slice(-5).forEach(m => {
    console.log(`     [${m.movement_type}] ${m.quantity_before} → ${m.quantity_after} (cost: ${m.unit_cost}) [${m.date ?? m.created_at?.slice(0,10)}]`);
  });
}

// ── 12. فحص period-lock ───────────────────────────────────────────────────────
async function testPeriodLock({ safe, product }) {
  section("12. فحص قفل الفترة (period-lock)");

  const settings = await api("GET", "/settings/period");
  const closingDate = settings.closing_date;

  if (!closingDate) {
    console.log("  ℹ️  لا يوجد تاريخ إغلاق → اختبار period-lock مُتخطَّى");
    return;
  }

  console.log(`  ℹ️  تاريخ إغلاق الدفاتر: ${closingDate}`);
  try {
    await api("POST", "/sales", {
      payment_type: "cash",
      total_amount: 100,
      paid_amount: 100,
      safe_id: safe.id,
      items: [{
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: 100,
        total_price: 100,
      }],
      date: closingDate,
    });
    fail("رفض البيع بتاريخ مُقفَل", "نجح (مسموح)", "HTTP 400");
  } catch (e) {
    if (e.message.includes("HTTP 4")) {
      pass("قفل الفترة يعمل — رُفض البيع بالتاريخ المُقفَل بشكل صحيح");
    } else {
      fail("period-lock", e.message, "خطأ HTTP 4xx");
    }
  }
}

// ── 13. فحص سلامة COGS (التكلفة في البنود) ───────────────────────────────────
async function testCOGSConsistency({ product }) {
  section("13. سلامة COGS — التحقق أن cost_total = cost_price × quantity");

  const salesAll = await api("GET", "/sales");
  let cogsOk = true;
  let checked = 0;

  for (const sale of salesAll.slice(-10)) {
    try {
      const detail = await api("GET", `/sales/${sale.id}`);
      if (!detail.items) continue;
      for (const item of detail.items) {
        const qty = Number(item.quantity);
        const cost = Number(item.cost_price);
        const costTotal = Number(item.cost_total);
        const expected = qty * cost;
        if (Math.abs(costTotal - expected) > 0.02) {
          fail(
            `COGS بند #${item.id} (${item.product_name}): cost_total (${costTotal}) ≠ qty×cost (${expected})`,
            costTotal,
            expected,
          );
          cogsOk = false;
        }
        checked++;
      }
    } catch { /* تخطي الأخطاء الجزئية */ }
  }

  if (cogsOk && checked > 0) {
    pass(`COGS سليم في جميع البنود المفحوصة (${checked} بند)`);
  } else if (checked === 0) {
    console.log("  ℹ️  لا توجد بنود لفحصها");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  التشغيل الرئيسي
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("\n" + "█".repeat(60));
  console.log("  تدقيق محاسبي شامل — Halal Tech ERP");
  console.log("  " + new Date().toLocaleString("ar-EG"));
  console.log("█".repeat(60));

  try {
    await login();
    const { safe, customer, supplier, product } = await setup();

    const { purchase: purchase1 } = await testPurchase1({ safe, supplier, product });
    const { wac }                 = await testPurchase2({ safe, supplier, product });
    const { sale: cashSale }      = await testCashSale({ safe, customer, product, wac });
    await testCreditSale({ customer, product, wac });
    await testReceiptVoucher({ safe, customer });
    await testSalesReturn({ safe, customer, product, cashSale, wac });
    await testPurchaseReturn({ safe, supplier, product, purchase1 });
    await testProfitsReport();
    await testHealthCheck();
    await testStockMovements({ product });
    await testPeriodLock({ safe, product });
    await testCOGSConsistency({ product });

  } catch (err) {
    failCount++;
    const msg = `  ❌ خطأ غير متوقع: ${err.message}`;
    failures.push(msg);
    console.error(msg);
    if (process.env.VERBOSE) console.error(err.stack);
  }

  // ── ملخص ──────────────────────────────────────────────────────────────────
  const total   = passCount + failCount;
  const percent = total > 0 ? Math.round((passCount / total) * 100) : 0;

  console.log("\n" + "═".repeat(60));
  console.log("  ملخص نتائج التدقيق المحاسبي");
  console.log("═".repeat(60));
  console.log(`  ✅ ناجح:       ${passCount}`);
  console.log(`  ❌ فاشل:       ${failCount}`);
  console.log(`  📊 نسبة النجاح: ${percent}% (${passCount}/${total})`);

  if (failures.length > 0) {
    console.log("\n  ─── الاختبارات الفاشلة ───");
    failures.forEach(f => console.log(f));
  } else {
    console.log("\n  🎉 جميع الاختبارات نجحت!");
  }

  console.log("\n" + "█".repeat(60));
  process.exit(failCount > 0 ? 1 : 0);
}

main();
