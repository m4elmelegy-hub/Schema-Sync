import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  ShoppingCart, TruckIcon, Wallet, TrendingUp,
  HandCoins, ArrowDownToLine, ArrowLeftRight,
  ArrowRight, CheckCircle2, AlertCircle, Loader2,
  Users, Package, Layers, BarChart3,
} from "lucide-react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;
const post = (url: string, body: object) =>
  fetch(api(url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "خطأ غير معروف"); return d; });

type Operation = "hub" | "receipt-voucher" | "deposit-voucher" | "expense" | "income" | "safe-transfer";

interface Safe { id: number; name: string; balance: number | string; }
interface Customer { id: number; name: string; balance: number | string; }
interface Supplier { id: number; name: string; balance: number | string; }

const EXPENSE_CATS = ["إيجار", "رواتب", "كهرباء", "مياه", "إنترنت", "صيانة", "مواصلات", "تسويق", "مشتريات مكتب", "أخرى"];
const INCOME_SRCS = ["مبيعات نقدية", "خدمة صيانة", "عمولة", "استثمار", "إيراد متنوع", "أخرى"];

export default function Tasks() {
  const [op, setOp] = useState<Operation>("hub");
  const [success, setSuccess] = useState("");
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: safes = [] } = useQuery<Safe[]>({
    queryKey: ["/api/settings/safes"],
    queryFn: () => fetch(api("/api/settings/safes")).then(r => r.json()),
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => fetch(api("/api/customers")).then(r => r.json()),
  });
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => fetch(api("/api/suppliers")).then(r => r.json()),
  });
  const { data: stats } = useQuery<Record<string, number>>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => fetch(api("/api/dashboard/stats")).then(r => r.json()),
  });

  const goHub = (msg: string) => {
    setSuccess(msg);
    qc.invalidateQueries();
    setTimeout(() => { setOp("hub"); setSuccess(""); }, 2000);
  };

  if (op !== "hub") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setOp("hub")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm"
        >
          <ArrowRight className="w-4 h-4" />
          العودة للمهام
        </button>
        {op === "receipt-voucher" && <ReceiptVoucherForm safes={safes} customers={customers} onSuccess={goHub} />}
        {op === "deposit-voucher" && <DepositVoucherForm safes={safes} suppliers={suppliers} onSuccess={goHub} />}
        {op === "expense" && <ExpenseForm safes={safes} onSuccess={goHub} />}
        {op === "income" && <IncomeForm safes={safes} onSuccess={goHub} />}
        {op === "safe-transfer" && <SafeTransferForm safes={safes} onSuccess={goHub} />}
      </div>
    );
  }

  const totalSafe = safes.reduce((s, x) => s + Number(x.balance), 0);

  const cards = [
    {
      op: "receipt-voucher" as Operation,
      title: "سند قبض",
      sub: "استلام دفعة من عميل",
      icon: HandCoins,
      color: "text-violet-400",
      bg: "bg-violet-500/10 hover:bg-violet-500/20",
      border: "border-violet-500/20 hover:border-violet-500/40",
      stat: stats ? formatCurrency(Number(stats.total_customer_debts)) : "—",
      statLabel: "ديون العملاء",
    },
    {
      op: "deposit-voucher" as Operation,
      title: "سند توريد",
      sub: "دفع دفعة لمورد",
      icon: ArrowDownToLine,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10 hover:bg-indigo-500/20",
      border: "border-indigo-500/20 hover:border-indigo-500/40",
      stat: stats ? formatCurrency(Number(stats.total_supplier_debts)) : "—",
      statLabel: "ديون الموردين",
    },
    {
      op: "expense" as Operation,
      title: "مصروف",
      sub: "صرف مبلغ من الخزينة",
      icon: Wallet,
      color: "text-red-400",
      bg: "bg-red-500/10 hover:bg-red-500/20",
      border: "border-red-500/20 hover:border-red-500/40",
      stat: stats ? formatCurrency(Number(stats.total_expenses_today)) : "—",
      statLabel: "مصروفات اليوم",
    },
    {
      op: "income" as Operation,
      title: "إيراد",
      sub: "إضافة مبلغ للخزينة",
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
      border: "border-emerald-500/20 hover:border-emerald-500/40",
      stat: stats ? formatCurrency(Number(stats.total_income_today)) : "—",
      statLabel: "إيرادات اليوم",
    },
    {
      op: "safe-transfer" as Operation,
      title: "تحويل خزائن",
      sub: "نقل رصيد بين الخزائن",
      icon: ArrowLeftRight,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10 hover:bg-cyan-500/20",
      border: "border-cyan-500/20 hover:border-cyan-500/40",
      stat: formatCurrency(totalSafe),
      statLabel: "إجمالي الخزائن",
    },
  ];

  return (
    <div className="space-y-6">
      {success && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 text-emerald-400 font-bold">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          {success}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-white">المهام السريعة</h1>
        <p className="text-white/40 text-sm mt-1">نفّذ العمليات المالية دون مغادرة هذه الصفحة</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "مبيعات اليوم", val: stats.total_sales_today, c: "emerald" },
            { label: "مصروفات اليوم", val: stats.total_expenses_today, c: "red" },
            { label: "إيرادات اليوم", val: stats.total_income_today, c: "teal" },
            { label: "صافي الربح", val: stats.net_profit, c: stats.net_profit >= 0 ? "emerald" : "red" },
          ].map(({ label, val, c }) => (
            <div key={label} className={`glass-panel rounded-2xl p-4 border border-${c}-500/20 bg-${c}-500/5`}>
              <p className="text-white/40 text-xs mb-1">{label}</p>
              <p className={`text-${c}-400 font-black text-lg`}>{formatCurrency(Number(val))}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-xs font-bold text-white/30 mb-3 uppercase tracking-widest">العمليات المالية</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map(c => {
            const Icon = c.icon;
            return (
              <button
                key={c.op}
                onClick={() => setOp(c.op)}
                className={`glass-panel rounded-2xl p-5 text-right border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl group ${c.bg} ${c.border}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${c.bg} border ${c.border}`}>
                    <Icon className={`w-6 h-6 ${c.color}`} />
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.bg} border ${c.border} ${c.color}`}>
                    تنفيذ ←
                  </span>
                </div>
                <p className={`font-black text-xl ${c.color}`}>{c.title}</p>
                <p className="text-white/40 text-sm mt-1">{c.sub}</p>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-white/25 text-xs">{c.statLabel}</p>
                  <p className={`font-bold text-base mt-0.5 ${c.color}`}>{c.stat}</p>
                </div>
              </button>
            );
          })}

          <button
            onClick={() => setLocation("/sales")}
            className="glass-panel rounded-2xl p-5 text-right border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-amber-500/10 border border-amber-500/20">
                <ShoppingCart className="w-6 h-6 text-amber-400" />
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">فتح ←</span>
            </div>
            <p className="font-black text-xl text-amber-400">فاتورة مبيعات</p>
            <p className="text-white/40 text-sm mt-1">إنشاء فاتورة بيع جديدة</p>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-white/25 text-xs">مبيعات اليوم</p>
              <p className="font-bold text-base mt-0.5 text-amber-400">{stats ? formatCurrency(Number(stats.total_sales_today)) : "—"}</p>
            </div>
          </button>

          <button
            onClick={() => setLocation("/purchases")}
            className="glass-panel rounded-2xl p-5 text-right border border-orange-500/20 bg-orange-500/10 hover:bg-orange-500/20 hover:border-orange-500/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-orange-500/10 border border-orange-500/20">
                <TruckIcon className="w-6 h-6 text-orange-400" />
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">فتح ←</span>
            </div>
            <p className="font-black text-xl text-orange-400">فاتورة مشتريات</p>
            <p className="text-white/40 text-sm mt-1">تسجيل مشتريات من مورد</p>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-white/25 text-xs">رصيد الموردين</p>
              <p className="font-bold text-base mt-0.5 text-orange-400">{stats ? formatCurrency(Number(stats.total_supplier_debts)) : "—"}</p>
            </div>
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-white/30 mb-3 uppercase tracking-widest">روابط سريعة</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { title: "العملاء", icon: Users, href: "/customers", color: "text-blue-400" },
            { title: "الموردون", icon: TruckIcon, href: "/suppliers", color: "text-amber-400" },
            { title: "الحركات المالية", icon: Layers, href: "/financial-transactions", color: "text-violet-400" },
            { title: "التقارير", icon: BarChart3, href: "/reports", color: "text-teal-400" },
            { title: "الإعدادات", icon: Package, href: "/settings", color: "text-gray-400" },
          ].map(link => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => setLocation(link.href)}
                className="flex items-center gap-2 px-4 py-2.5 glass-panel rounded-2xl border border-white/10 hover:border-white/20 transition-all text-sm font-medium text-white/60 hover:text-white"
              >
                <Icon className={`w-4 h-4 ${link.color}`} />
                {link.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FormShell({ title, icon: Icon, color, children }: {
  title: string; icon: React.FC<{ className?: string }>; color: string; children: React.ReactNode;
}) {
  return (
    <div className="max-w-lg mx-auto">
      <div className={`flex items-center gap-3 mb-6`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <div>
          <h2 className={`text-xl font-black ${color}`}>{title}</h2>
          <p className="text-white/30 text-sm">أدخل البيانات ثم اضغط حفظ</p>
        </div>
      </div>
      <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-white/50 text-xs mb-1.5 font-medium">{children}</label>;
}

function useFirstSafeId(safes: Safe[]) {
  const [safeId, setSafeId] = useState("");
  useEffect(() => {
    if (safes.length > 0 && !safeId) setSafeId(String(safes[0].id));
  }, [safes]);
  return [safeId, setSafeId] as const;
}

function SafeSelect({ safes, value, onChange }: { safes: Safe[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="glass-input w-full text-white text-sm" value={value} onChange={e => onChange(e.target.value)}>
      <option value="" className="bg-gray-900">-- اختر الخزينة --</option>
      {safes.map(s => (
        <option key={s.id} value={s.id} className="bg-gray-900">
          {s.name} — {formatCurrency(Number(s.balance))}
        </option>
      ))}
    </select>
  );
}

function SubmitRow({ loading, error, onSubmit, label = "حفظ" }: {
  loading: boolean; error: string; onSubmit: () => void; label?: string;
}) {
  return (
    <>
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      <button
        onClick={onSubmit}
        disabled={loading}
        className="w-full btn-primary py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? "جاري الحفظ..." : label}
      </button>
    </>
  );
}

function ReceiptVoucherForm({ safes, customers, onSuccess }: { safes: Safe[]; customers: Customer[]; onSuccess: (m: string) => void }) {
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find(x => String(x.id) === id);
    if (c) setCustomerName(c.name);
    else setCustomerName("");
  };

  const submit = async () => {
    if (!customerName) { setError("اختر العميل"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/receipt-vouchers", { customer_id: customerId || undefined, customer_name: customerName, safe_id: safeId, amount: Number(amount), notes });
      onSuccess(`تم حفظ سند القبض بمبلغ ${formatCurrency(Number(amount))} بنجاح ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="سند قبض" icon={HandCoins} color="text-violet-400">
      <div>
        <FieldLabel>العميل</FieldLabel>
        <select className="glass-input w-full text-white text-sm" value={customerId} onChange={e => handleCustomer(e.target.value)}>
          <option value="" className="bg-gray-900">-- اختر العميل --</option>
          {customers.map(c => (
            <option key={c.id} value={c.id} className="bg-gray-900">
              {c.name} — متأخر: {formatCurrency(Number(c.balance))}
            </option>
          ))}
        </select>
        {!customerId && (
          <div className="mt-2">
            <input
              className="glass-input w-full text-white text-sm"
              placeholder="أو أدخل اسم العميل يدوياً..."
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
            />
          </div>
        )}
      </div>
      <div>
        <FieldLabel>الخزينة (يختارها النظام تلقائياً)</FieldLabel>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
      </div>
      <div>
        <FieldLabel>المبلغ (ج.م)</FieldLabel>
        <input
          type="number" min="1" step="0.01"
          className="glass-input w-full text-white text-sm"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>ملاحظات (اختياري)</FieldLabel>
        <input className="glass-input w-full text-white text-sm" placeholder="..." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <SubmitRow loading={loading} error={error} onSubmit={submit} label="حفظ سند القبض" />
    </FormShell>
  );
}

function DepositVoucherForm({ safes, suppliers, onSuccess }: { safes: Safe[]; suppliers: Supplier[]; onSuccess: (m: string) => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [source, setSource] = useState("");
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find(x => String(x.id) === id);
    if (s) setSource(s.name);
    else setSource("");
  };

  const submit = async () => {
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/deposit-vouchers", { safe_id: safeId, amount: Number(amount), source: source || undefined, notes });
      onSuccess(`تم حفظ سند التوريد بمبلغ ${formatCurrency(Number(amount))} بنجاح ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="سند توريد" icon={ArrowDownToLine} color="text-indigo-400">
      <div>
        <FieldLabel>المورد (اختياري)</FieldLabel>
        <select className="glass-input w-full text-white text-sm" value={supplierId} onChange={e => handleSupplier(e.target.value)}>
          <option value="" className="bg-gray-900">-- اختر المورد --</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id} className="bg-gray-900">
              {s.name} — مديونية: {formatCurrency(Number(s.balance))}
            </option>
          ))}
        </select>
        <input
          className="glass-input w-full text-white text-sm mt-2"
          placeholder="أو أدخل المصدر يدوياً..."
          value={source}
          onChange={e => setSource(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>الخزينة (يختارها النظام تلقائياً)</FieldLabel>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
      </div>
      <div>
        <FieldLabel>المبلغ (ج.م)</FieldLabel>
        <input
          type="number" min="1" step="0.01"
          className="glass-input w-full text-white text-sm"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>ملاحظات (اختياري)</FieldLabel>
        <input className="glass-input w-full text-white text-sm" placeholder="..." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <SubmitRow loading={loading} error={error} onSubmit={submit} label="حفظ سند التوريد" />
    </FormShell>
  );
}

function ExpenseForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [category, setCategory] = useState(EXPENSE_CATS[0]);
  const [customCat, setCustomCat] = useState("");
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finalCat = category === "أخرى" ? customCat : category;

  const submit = async () => {
    if (!finalCat) { setError("أدخل التصنيف"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/expenses", { category: finalCat, amount: Number(amount), description, safe_id: safeId });
      onSuccess(`تم حفظ المصروف بمبلغ ${formatCurrency(Number(amount))} بنجاح ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="مصروف" icon={Wallet} color="text-red-400">
      <div>
        <FieldLabel>التصنيف</FieldLabel>
        <select className="glass-input w-full text-white text-sm" value={category} onChange={e => setCategory(e.target.value)}>
          {EXPENSE_CATS.map(c => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
        </select>
        {category === "أخرى" && (
          <input className="glass-input w-full text-white text-sm mt-2" placeholder="اكتب التصنيف..." value={customCat} onChange={e => setCustomCat(e.target.value)} />
        )}
      </div>
      <div>
        <FieldLabel>الخزينة (يختارها النظام تلقائياً)</FieldLabel>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
      </div>
      <div>
        <FieldLabel>المبلغ (ج.م)</FieldLabel>
        <input
          type="number" min="1" step="0.01"
          className="glass-input w-full text-white text-sm"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>البيان / الوصف (اختياري)</FieldLabel>
        <input className="glass-input w-full text-white text-sm" placeholder="تفاصيل المصروف..." value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <SubmitRow loading={loading} error={error} onSubmit={submit} label="حفظ المصروف" />
    </FormShell>
  );
}

function IncomeForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [source, setSource] = useState(INCOME_SRCS[0]);
  const [customSrc, setCustomSrc] = useState("");
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finalSrc = source === "أخرى" ? customSrc : source;

  const submit = async () => {
    if (!finalSrc) { setError("أدخل المصدر"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/income", { source: finalSrc, amount: Number(amount), description, safe_id: safeId });
      onSuccess(`تم حفظ الإيراد بمبلغ ${formatCurrency(Number(amount))} بنجاح ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="إيراد" icon={TrendingUp} color="text-emerald-400">
      <div>
        <FieldLabel>المصدر</FieldLabel>
        <select className="glass-input w-full text-white text-sm" value={source} onChange={e => setSource(e.target.value)}>
          {INCOME_SRCS.map(s => <option key={s} value={s} className="bg-gray-900">{s}</option>)}
        </select>
        {source === "أخرى" && (
          <input className="glass-input w-full text-white text-sm mt-2" placeholder="اكتب المصدر..." value={customSrc} onChange={e => setCustomSrc(e.target.value)} />
        )}
      </div>
      <div>
        <FieldLabel>الخزينة (يختارها النظام تلقائياً)</FieldLabel>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
      </div>
      <div>
        <FieldLabel>المبلغ (ج.م)</FieldLabel>
        <input
          type="number" min="1" step="0.01"
          className="glass-input w-full text-white text-sm"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>البيان / الوصف (اختياري)</FieldLabel>
        <input className="glass-input w-full text-white text-sm" placeholder="تفاصيل الإيراد..." value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <SubmitRow loading={loading} error={error} onSubmit={submit} label="حفظ الإيراد" />
    </FormShell>
  );
}

function SafeTransferForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [fromSafeId, setFromSafeId] = useFirstSafeId(safes);
  const [toSafeId, setToSafeId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (safes.length >= 2 && !toSafeId) {
      setToSafeId(String(safes[1].id));
    }
  }, [safes]);

  const fromSafe = safes.find(s => String(s.id) === fromSafeId);

  const submit = async () => {
    if (!fromSafeId || !toSafeId) { setError("اختر الخزينتين"); return; }
    if (fromSafeId === toSafeId) { setError("لا يمكن التحويل لنفس الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/safe-transfers", { from_safe_id: fromSafeId, to_safe_id: toSafeId, amount: Number(amount), notes });
      onSuccess(`تم تحويل ${formatCurrency(Number(amount))} بين الخزائن بنجاح ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="تحويل خزائن" icon={ArrowLeftRight} color="text-cyan-400">
      <div>
        <FieldLabel>من الخزينة</FieldLabel>
        <SafeSelect safes={safes} value={fromSafeId} onChange={setFromSafeId} />
        {fromSafe && (
          <p className="text-white/30 text-xs mt-1">الرصيد المتاح: {formatCurrency(Number(fromSafe.balance))}</p>
        )}
      </div>
      <div>
        <FieldLabel>إلى الخزينة</FieldLabel>
        <SafeSelect safes={safes} value={toSafeId} onChange={setToSafeId} />
      </div>
      <div>
        <FieldLabel>المبلغ (ج.م)</FieldLabel>
        <input
          type="number" min="1" step="0.01"
          className="glass-input w-full text-white text-sm"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>ملاحظات (اختياري)</FieldLabel>
        <input className="glass-input w-full text-white text-sm" placeholder="سبب التحويل..." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <SubmitRow loading={loading} error={error} onSubmit={submit} label="تنفيذ التحويل" />
    </FormShell>
  );
}
