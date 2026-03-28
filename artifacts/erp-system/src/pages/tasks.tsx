import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  Wallet, TrendingUp, HandCoins, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, ArrowRight, CheckCircle2, AlertCircle,
  Loader2, Lock, Printer, ChevronLeft, ChevronRight,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;
const post = (url: string, body: object) =>
  fetch(api(url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "خطأ غير معروف"); return d; });

type Operation = "hub" | "receipt-voucher" | "deposit-voucher" | "payment-voucher" | "expense" | "income" | "safe-transfer" | "safe-closing";

interface Safe { id: number; name: string; balance: number | string; }
interface Customer { id: number; name: string; balance: number | string; }
interface Transaction { id: number; type: string; amount: number; direction: string; safe_id: number; description: string; date: string; }

const EXPENSE_CATS = ["إيجار", "رواتب", "كهرباء", "مياه", "إنترنت", "صيانة", "مواصلات", "تسويق", "مشتريات مكتب", "أخرى"];
const INCOME_SRCS = ["مبيعات نقدية", "خدمة صيانة", "عمولة", "استثمار", "إيراد متنوع", "أخرى"];

export default function Tasks() {
  const [op, setOp] = useState<Operation>("hub");
  const [successMsg, setSuccessMsg] = useState("");
  const qc = useQueryClient();

  const { data: safes = [] } = useQuery<Safe[]>({
    queryKey: ["/api/settings/safes"],
    queryFn: () => fetch(api("/api/settings/safes")).then(r => r.json()),
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => fetch(api("/api/customers")).then(r => r.json()),
  });
  const { data: stats } = useQuery<Record<string, number>>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => fetch(api("/api/dashboard/stats")).then(r => r.json()),
  });

  const goHub = (msg: string) => {
    setSuccessMsg(msg);
    qc.invalidateQueries();
    setTimeout(() => { setOp("hub"); setSuccessMsg(""); }, 2000);
  };

  if (op !== "hub") {
    return (
      <div className="space-y-4 max-w-xl mx-auto">
        <button
          onClick={() => setOp("hub")}
          className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-sm group"
        >
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          العودة للمهام
        </button>
        {op === "receipt-voucher" && <ReceiptVoucherForm safes={safes} customers={customers} onSuccess={goHub} />}
        {op === "deposit-voucher" && <DepositVoucherForm safes={safes} customers={customers} onSuccess={goHub} />}
        {op === "payment-voucher" && <PaymentVoucherForm safes={safes} customers={customers} onSuccess={goHub} />}
        {op === "expense" && <ExpenseForm safes={safes} onSuccess={goHub} />}
        {op === "income" && <IncomeForm safes={safes} onSuccess={goHub} />}
        {op === "safe-transfer" && <SafeTransferForm safes={safes} onSuccess={goHub} />}
        {op === "safe-closing" && <SafeClosingForm safes={safes} onSuccess={goHub} />}
      </div>
    );
  }

  const cards = [
    {
      op: "receipt-voucher" as Operation,
      title: "سند قبض",
      sub: "استلام من عميل",
      icon: HandCoins,
      color: "text-violet-400",
      ring: "ring-violet-500/30",
      bg: "bg-violet-500/8",
      stat: stats ? formatCurrency(Number(stats.total_customer_debts)) : "—",
      statLabel: "ديون العملاء",
    },
    {
      op: "deposit-voucher" as Operation,
      title: "سند توريد",
      sub: "توريد من عميل",
      icon: ArrowDownToLine,
      color: "text-indigo-400",
      ring: "ring-indigo-500/30",
      bg: "bg-indigo-500/8",
      stat: stats ? formatCurrency(Number(stats.total_customer_debts)) : "—",
      statLabel: "ديون العملاء",
    },
    {
      op: "payment-voucher" as Operation,
      title: "سند صرف",
      sub: "صرف لعميل",
      icon: ArrowUpFromLine,
      color: "text-red-400",
      ring: "ring-red-500/30",
      bg: "bg-red-500/8",
      stat: formatCurrency(safes.reduce((s, x) => s + Number(x.balance), 0)),
      statLabel: "رصيد الخزائن",
    },
    {
      op: "expense" as Operation,
      title: "مصروف",
      sub: "صرف من الخزينة",
      icon: Wallet,
      color: "text-red-400",
      ring: "ring-red-500/30",
      bg: "bg-red-500/8",
      stat: stats ? formatCurrency(Number(stats.total_expenses_today)) : "—",
      statLabel: "مصروفات اليوم",
    },
    {
      op: "income" as Operation,
      title: "إيراد",
      sub: "إضافة للخزينة",
      icon: TrendingUp,
      color: "text-emerald-400",
      ring: "ring-emerald-500/30",
      bg: "bg-emerald-500/8",
      stat: stats ? formatCurrency(Number(stats.total_income_today)) : "—",
      statLabel: "إيرادات اليوم",
    },
    {
      op: "safe-transfer" as Operation,
      title: "تحويل خزائن",
      sub: "نقل بين الخزائن",
      icon: ArrowLeftRight,
      color: "text-cyan-400",
      ring: "ring-cyan-500/30",
      bg: "bg-cyan-500/8",
      stat: formatCurrency(safes.reduce((s, x) => s + Number(x.balance), 0)),
      statLabel: "إجمالي الخزائن",
    },
    {
      op: "safe-closing" as Operation,
      title: "إقفال الخزينة",
      sub: "جرد ومطابقة اليومية",
      icon: Lock,
      color: "text-amber-400",
      ring: "ring-amber-500/30",
      bg: "bg-amber-500/8",
      stat: new Date().toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" }),
      statLabel: "إقفال يوم",
    },
  ];

  return (
    <div className="space-y-5">
      {successMsg && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 text-emerald-400 font-bold text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Daily summary strip */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "مبيعات", val: stats.total_sales_today, c: "emerald" },
            { label: "مصروفات", val: stats.total_expenses_today, c: "red" },
            { label: "إيرادات", val: stats.total_income_today, c: "teal" },
            { label: "الصافي", val: stats.net_profit, c: Number(stats.net_profit) >= 0 ? "emerald" : "red" },
          ].map(({ label, val, c }) => (
            <div key={label} className={`glass-panel rounded-xl p-3 border border-${c}-500/15`}>
              <p className="text-white/30 text-xs">{label}</p>
              <p className={`text-${c}-400 font-black text-sm mt-0.5`}>{formatCurrency(Number(val))}</p>
            </div>
          ))}
        </div>
      )}

      {/* Operations grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <button
              key={c.op}
              onClick={() => setOp(c.op)}
              className={`glass-panel rounded-2xl p-4 text-right ring-1 ${c.ring} ${c.bg} hover:brightness-110 transition-all duration-200 hover:-translate-y-0.5 group`}
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-5 h-5 ${c.color}`} />
                <ChevronLeft className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
              </div>
              <p className={`font-bold text-sm ${c.color}`}>{c.title}</p>
              <p className="text-white/35 text-xs mt-0.5">{c.sub}</p>
              <div className="mt-3 pt-2.5 border-t border-white/5">
                <p className="text-white/20 text-xs">{c.statLabel}</p>
                <p className={`font-bold text-xs mt-0.5 ${c.color}`}>{c.stat}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Shared helpers ─── */

function useFirstSafeId(safes: Safe[]) {
  const [safeId, setSafeId] = useState("");
  useEffect(() => {
    if (safes.length > 0 && !safeId) setSafeId(String(safes[0].id));
  }, [safes]);
  return [safeId, setSafeId] as const;
}

function FormShell({ title, icon: Icon, color, children }: {
  title: string; icon: React.FC<{ className?: string }>; color: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10">
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <h2 className={`text-lg font-black ${color}`}>{title}</h2>
          <p className="text-white/30 text-xs">أدخل البيانات ثم اضغط حفظ</p>
        </div>
      </div>
      <div className="glass-panel rounded-3xl p-5 border border-white/10 space-y-4">
        {children}
      </div>
    </div>
  );
}

function FL({ children }: { children: React.ReactNode }) {
  return <label className="block text-white/40 text-xs mb-1.5 font-medium">{children}</label>;
}

function SafeSelect({ safes, value, onChange, label }: { safes: Safe[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      <FL>{label || "الخزينة (تختار تلقائياً)"}</FL>
      <select className="glass-input w-full text-white text-sm" value={value} onChange={e => onChange(e.target.value)}>
        <option value="" className="bg-gray-900">-- اختر الخزينة --</option>
        {safes.map(s => (
          <option key={s.id} value={s.id} className="bg-gray-900">
            {s.name} — {formatCurrency(Number(s.balance))}
          </option>
        ))}
      </select>
    </div>
  );
}

function ErrRow({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2.5">
      <AlertCircle className="w-4 h-4 shrink-0" /> {error}
    </div>
  );
}

function SaveBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full btn-primary py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-40 text-sm">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      {loading ? "جاري الحفظ..." : label}
    </button>
  );
}

/* ─── Receipt Voucher ─── */
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
    setCustomerName(c ? c.name : "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName) { setError("اختر العميل أو أدخل الاسم"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/receipt-vouchers", { customer_id: customerId || undefined, customer_name: customerName, safe_id: safeId, amount: Number(amount), notes });
      onSuccess(`تم حفظ سند القبض — ${formatCurrency(Number(amount))} ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="سند قبض" icon={HandCoins} color="text-violet-400">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FL>العميل</FL>
          <select className="glass-input w-full text-white text-sm" value={customerId} onChange={e => handleCustomer(e.target.value)}>
            <option value="" className="bg-gray-900">-- اختر العميل --</option>
            {customers.map(c => (
              <option key={c.id} value={c.id} className="bg-gray-900">{c.name} — متأخر: {formatCurrency(Number(c.balance))}</option>
            ))}
          </select>
          {!customerId && (
            <input className="glass-input w-full text-white text-sm mt-2" placeholder="أو أدخل الاسم يدوياً..."
              value={customerName} onChange={e => setCustomerName(e.target.value)} />
          )}
        </div>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
        <div>
          <FL>المبلغ (ج.م)</FL>
          <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <FL>ملاحظات</FL>
          <input className="glass-input w-full text-white text-sm" placeholder="..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ErrRow error={error} />
        <SaveBtn loading={loading} label="حفظ سند القبض" />
      </form>
    </FormShell>
  );
}

/* ─── Deposit Voucher ─── */
function DepositVoucherForm({ safes, customers, onSuccess }: { safes: Safe[]; customers: Customer[]; onSuccess: (m: string) => void }) {
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
    setCustomerName(c ? c.name : "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName) { setError("اختر العميل أو أدخل الاسم"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/deposit-vouchers", { customer_id: customerId || undefined, customer_name: customerName, safe_id: safeId, amount: Number(amount), notes });
      onSuccess(`تم حفظ سند التوريد — ${formatCurrency(Number(amount))} ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="سند توريد" icon={ArrowDownToLine} color="text-indigo-400">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FL>العميل</FL>
          <select className="glass-input w-full text-white text-sm" value={customerId} onChange={e => handleCustomer(e.target.value)}>
            <option value="" className="bg-gray-900">-- اختر العميل --</option>
            {customers.map(c => (
              <option key={c.id} value={c.id} className="bg-gray-900">{c.name} — متأخر: {formatCurrency(Number(c.balance))}</option>
            ))}
          </select>
          {!customerId && (
            <input className="glass-input w-full text-white text-sm mt-2" placeholder="أو أدخل الاسم يدوياً..."
              value={customerName} onChange={e => setCustomerName(e.target.value)} />
          )}
        </div>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
        <div>
          <FL>المبلغ (ج.م)</FL>
          <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <FL>ملاحظات</FL>
          <input className="glass-input w-full text-white text-sm" placeholder="..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ErrRow error={error} />
        <SaveBtn loading={loading} label="حفظ سند التوريد" />
      </form>
    </FormShell>
  );
}

/* ─── Payment Voucher ─── */
function PaymentVoucherForm({ safes, customers, onSuccess }: { safes: Safe[]; customers: Customer[]; onSuccess: (m: string) => void }) {
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
    setCustomerName(c ? c.name : "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName) { setError("اختر العميل أو أدخل الاسم"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/payment-vouchers", { customer_id: customerId || undefined, customer_name: customerName, safe_id: safeId, amount: Number(amount), notes });
      onSuccess(`تم حفظ سند الصرف — ${formatCurrency(Number(amount))} ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="سند صرف" icon={ArrowUpFromLine} color="text-red-400">
      <p className="text-xs text-white/50 -mt-2 mb-2">الشركة تصرف نقداً → الخزينة تنزل</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FL>العميل</FL>
          <select className="glass-input w-full text-white text-sm" value={customerId} onChange={e => handleCustomer(e.target.value)}>
            <option value="" className="bg-gray-900">-- اختر العميل --</option>
            {customers.map(c => (
              <option key={c.id} value={c.id} className="bg-gray-900">{c.name}</option>
            ))}
          </select>
          {!customerId && (
            <input className="glass-input w-full text-white text-sm mt-2" placeholder="أو أدخل الاسم يدوياً..."
              value={customerName} onChange={e => setCustomerName(e.target.value)} />
          )}
        </div>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
        <div>
          <FL>المبلغ (ج.م)</FL>
          <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <FL>ملاحظات</FL>
          <input className="glass-input w-full text-white text-sm" placeholder="..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ErrRow error={error} />
        <SaveBtn loading={loading} label="حفظ سند الصرف" />
      </form>
    </FormShell>
  );
}

/* ─── Expense ─── */
function ExpenseForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [category, setCategory] = useState(EXPENSE_CATS[0]);
  const [customCat, setCustomCat] = useState("");
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = category === "أخرى" ? customCat : category;
    if (!cat) { setError("أدخل التصنيف"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/expenses", { category: cat, amount: Number(amount), description, safe_id: safeId });
      onSuccess(`تم حفظ المصروف — ${formatCurrency(Number(amount))} ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="مصروف" icon={Wallet} color="text-red-400">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FL>التصنيف</FL>
          <select className="glass-input w-full text-white text-sm" value={category} onChange={e => setCategory(e.target.value)}>
            {EXPENSE_CATS.map(c => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
          </select>
          {category === "أخرى" && (
            <input className="glass-input w-full text-white text-sm mt-2" placeholder="التصنيف..."
              value={customCat} onChange={e => setCustomCat(e.target.value)} />
          )}
        </div>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
        <div>
          <FL>المبلغ (ج.م)</FL>
          <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <FL>البيان</FL>
          <input className="glass-input w-full text-white text-sm" placeholder="وصف المصروف..."
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <ErrRow error={error} />
        <SaveBtn loading={loading} label="حفظ المصروف" />
      </form>
    </FormShell>
  );
}

/* ─── Income ─── */
function IncomeForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [source, setSource] = useState(INCOME_SRCS[0]);
  const [customSrc, setCustomSrc] = useState("");
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const src = source === "أخرى" ? customSrc : source;
    if (!src) { setError("أدخل المصدر"); return; }
    if (!safeId) { setError("اختر الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/income", { source: src, amount: Number(amount), description, safe_id: safeId });
      onSuccess(`تم حفظ الإيراد — ${formatCurrency(Number(amount))} ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="إيراد" icon={TrendingUp} color="text-emerald-400">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FL>المصدر</FL>
          <select className="glass-input w-full text-white text-sm" value={source} onChange={e => setSource(e.target.value)}>
            {INCOME_SRCS.map(s => <option key={s} value={s} className="bg-gray-900">{s}</option>)}
          </select>
          {source === "أخرى" && (
            <input className="glass-input w-full text-white text-sm mt-2" placeholder="المصدر..."
              value={customSrc} onChange={e => setCustomSrc(e.target.value)} />
          )}
        </div>
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} />
        <div>
          <FL>المبلغ (ج.م)</FL>
          <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <FL>البيان</FL>
          <input className="glass-input w-full text-white text-sm" placeholder="وصف الإيراد..."
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <ErrRow error={error} />
        <SaveBtn loading={loading} label="حفظ الإيراد" />
      </form>
    </FormShell>
  );
}

/* ─── Safe Transfer ─── */
function SafeTransferForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [fromSafeId, setFromSafeId] = useFirstSafeId(safes);
  const [toSafeId, setToSafeId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (safes.length >= 2 && !toSafeId) setToSafeId(String(safes[1].id));
  }, [safes]);

  const fromSafe = safes.find(s => String(s.id) === fromSafeId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromSafeId || !toSafeId) { setError("اختر الخزينتين"); return; }
    if (fromSafeId === toSafeId) { setError("لا يمكن التحويل لنفس الخزينة"); return; }
    if (!amount || Number(amount) <= 0) { setError("أدخل مبلغاً صحيحاً"); return; }
    setError(""); setLoading(true);
    try {
      await post("/api/safe-transfers", { from_safe_id: fromSafeId, to_safe_id: toSafeId, amount: Number(amount), notes });
      onSuccess(`تم تحويل ${formatCurrency(Number(amount))} بين الخزائن ✓`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "خطأ"); }
    finally { setLoading(false); }
  };

  return (
    <FormShell title="تحويل خزائن" icon={ArrowLeftRight} color="text-cyan-400">
      <form onSubmit={submit} className="space-y-4">
        <SafeSelect safes={safes} value={fromSafeId} onChange={setFromSafeId} label="من الخزينة" />
        {fromSafe && <p className="text-white/25 text-xs -mt-2">الرصيد: {formatCurrency(Number(fromSafe.balance))}</p>}
        <SafeSelect safes={safes} value={toSafeId} onChange={setToSafeId} label="إلى الخزينة" />
        <div>
          <FL>المبلغ (ج.م)</FL>
          <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <FL>سبب التحويل</FL>
          <input className="glass-input w-full text-white text-sm" placeholder="..."
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ErrRow error={error} />
        <SaveBtn loading={loading} label="تنفيذ التحويل" />
      </form>
    </FormShell>
  );
}

/* ─── Safe Closing ─── */
function SafeClosingForm({ safes, onSuccess }: { safes: Safe[]; onSuccess: (m: string) => void }) {
  const [safeId, setSafeId] = useFirstSafeId(safes);
  const [closingDate, setClosingDate] = useState(new Date().toISOString().split("T")[0]);
  const [actualBalance, setActualBalance] = useState("");

  const selectedSafe = safes.find(s => String(s.id) === safeId);
  const systemBalance = selectedSafe ? Number(selectedSafe.balance) : 0;

  const { data: txToday = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/financial-transactions", safeId, closingDate],
    queryFn: () =>
      safeId
        ? fetch(api(`/api/financial-transactions?safe_id=${safeId}&from=${closingDate}&to=${closingDate}`)).then(r => r.json())
        : Promise.resolve([]),
    enabled: !!safeId,
  });

  const inTypes: Record<string, string> = {
    sale_cash: "مبيعات نقدي",
    sale_credit: "مبيعات آجل",
    income: "إيرادات",
    receipt_voucher: "سندات قبض",
    transfer_in: "تحويل وارد",
    deposit_voucher: "سندات توريد",
  };
  const outTypes: Record<string, string> = {
    purchase_cash: "مشتريات نقدي",
    purchase_credit: "مشتريات آجل",
    expense: "مصروفات",
    payment_voucher: "سندات صرف",
    transfer_out: "تحويل صادر",
  };

  const inRows = txToday.filter(t => t.direction === "in");
  const outRows = txToday.filter(t => t.direction === "out");

  const totalIn = inRows.reduce((s, t) => s + t.amount, 0);
  const totalOut = outRows.reduce((s, t) => s + t.amount, 0);
  const prevBalance = systemBalance - totalIn + totalOut;
  const actual = actualBalance !== "" ? Number(actualBalance) : null;
  const variance = actual !== null ? actual - systemBalance : null;

  const grouped = (rows: Transaction[], labels: Record<string, string>) => {
    const map: Record<string, number> = {};
    rows.forEach(t => {
      const key = labels[t.type] || t.type;
      map[key] = (map[key] || 0) + t.amount;
    });
    return Object.entries(map);
  };

  const printClosing = () => {
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
    <title>إقفال الخزينة</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; direction: rtl; padding: 20px; font-size: 13px; }
      h2 { text-align: center; margin-bottom: 4px; }
      p.sub { text-align: center; color: #666; margin-bottom: 16px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
      th { background: #1a1a2e; color: white; padding: 6px 10px; text-align: right; font-size: 11px; }
      td { padding: 5px 10px; border-bottom: 1px solid #eee; }
      .total-row td { font-weight: bold; background: #f5f5f5; }
      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .summary { background: #f9f9f9; padding: 10px; border-radius: 6px; margin-top: 12px; }
      .summary .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #ddd; }
      .variance-pos { color: green; font-weight: bold; }
      .variance-neg { color: red; font-weight: bold; }
    </style></head><body>
    <h2>Halal Tech — إقفال الخزينة</h2>
    <p class="sub">الخزينة: ${selectedSafe?.name || ""} | التاريخ: ${closingDate}</p>
    <div class="two-col">
      <table>
        <tr><th colspan="2">الوارد (داخل)</th></tr>
        ${grouped(inRows, inTypes).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="total-row"><td>إجمالي الداخل</td><td>${formatCurrency(totalIn)}</td></tr>
      </table>
      <table>
        <tr><th colspan="2">الصادر (خارج)</th></tr>
        ${grouped(outRows, outTypes).map(([k, v]) => `<tr><td>${k}</td><td>${formatCurrency(v)}</td></tr>`).join("")}
        <tr class="total-row"><td>إجمالي الخارج</td><td>${formatCurrency(totalOut)}</td></tr>
      </table>
    </div>
    <div class="summary">
      <div class="row"><span>رصيد سابق</span><span>${formatCurrency(prevBalance)}</span></div>
      <div class="row"><span>الرصيد الحالي (نظام)</span><span>${formatCurrency(systemBalance)}</span></div>
      ${actual !== null ? `<div class="row"><span>الرصيد الفعلي (جرد)</span><span>${formatCurrency(actual)}</span></div>` : ""}
      ${variance !== null ? `<div class="row"><span>العجز / الزيادة</span><span class="${variance >= 0 ? 'variance-pos' : 'variance-neg'}">${variance >= 0 ? "+" : ""}${formatCurrency(variance)}</span></div>` : ""}
    </div>
    <br/><p style="text-align:center;font-size:10px;color:#999">طُبع بواسطة Halal Tech ERP — ${new Date().toLocaleString("ar-EG")}</p>
    <script>window.print();</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/30">
          <Lock className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-amber-400">إقفال الخزينة</h2>
          <p className="text-white/30 text-xs">جرد ومطابقة يومية للخزينة</p>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-panel rounded-2xl p-4 border border-white/10 mb-4 grid grid-cols-2 gap-3">
        <SafeSelect safes={safes} value={safeId} onChange={setSafeId} label="الخزينة" />
        <div>
          <FL>تاريخ الإقفال</FL>
          <input type="date" className="glass-input w-full text-white text-sm"
            value={closingDate} onChange={e => setClosingDate(e.target.value)} />
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          { label: "رصيد سابق", val: prevBalance, c: "white/60" },
          { label: "الرصيد الحالي (نظام)", val: systemBalance, c: "amber-400" },
          { label: "إجمالي الداخل", val: totalIn, c: "emerald-400" },
          { label: "إجمالي الخارج", val: totalOut, c: "red-400" },
        ].map(({ label, val, c }) => (
          <div key={label} className="glass-panel rounded-xl p-3 border border-white/8">
            <p className="text-white/30 text-xs">{label}</p>
            <p className={`text-${c} font-bold text-sm mt-1`}>{formatCurrency(val)}</p>
          </div>
        ))}
      </div>

      {/* Breakdown tables */}
      {txToday.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="glass-panel rounded-xl p-3 border border-emerald-500/15">
            <p className="text-emerald-400 font-bold text-xs mb-2">الوارد (داخل)</p>
            <div className="space-y-1.5">
              {grouped(inRows, inTypes).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-white/50">{k}</span>
                  <span className="text-emerald-400 font-medium">{formatCurrency(v)}</span>
                </div>
              ))}
              {inRows.length === 0 && <p className="text-white/20 text-xs">لا يوجد</p>}
            </div>
          </div>
          <div className="glass-panel rounded-xl p-3 border border-red-500/15">
            <p className="text-red-400 font-bold text-xs mb-2">الصادر (خارج)</p>
            <div className="space-y-1.5">
              {grouped(outRows, outTypes).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-white/50">{k}</span>
                  <span className="text-red-400 font-medium">{formatCurrency(v)}</span>
                </div>
              ))}
              {outRows.length === 0 && <p className="text-white/20 text-xs">لا يوجد</p>}
            </div>
          </div>
        </div>
      )}

      {txToday.length === 0 && safeId && (
        <div className="text-center py-4 text-white/25 text-sm mb-4">لا توجد حركات لهذه الخزينة في هذا اليوم</div>
      )}

      {/* Actual balance input */}
      <div className="glass-panel rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5 space-y-3">
        <div>
          <FL>الرصيد الفعلي — جرد يدوي (ج.م)</FL>
          <input type="number" min="0" step="0.01" className="glass-input w-full text-white text-sm"
            placeholder="أدخل الرصيد الفعلي بعد الجرد..."
            value={actualBalance} onChange={e => setActualBalance(e.target.value)} />
        </div>

        {variance !== null && (
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${variance === 0 ? "bg-emerald-500/10 border-emerald-500/20" : variance > 0 ? "bg-teal-500/10 border-teal-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            <span className="text-white/60 text-sm">العجز / الزيادة</span>
            <span className={`font-black text-lg ${variance === 0 ? "text-emerald-400" : variance > 0 ? "text-teal-400" : "text-red-400"}`}>
              {variance > 0 ? "+" : ""}{formatCurrency(variance)}
              {variance === 0 && " ✓ مطابق"}
              {variance > 0 && " زيادة"}
              {variance < 0 && " عجز"}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={printClosing}
          className="flex-1 flex items-center justify-center gap-2 py-3 glass-panel rounded-2xl border border-white/10 text-white/70 hover:text-white hover:border-white/20 transition-all text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
          طباعة الجرد
        </button>
        <button
          onClick={() => onSuccess(`تم حفظ إقفال خزينة "${selectedSafe?.name}" بتاريخ ${closingDate} ✓`)}
          className="flex-1 btn-primary py-3 font-bold text-sm flex items-center justify-center gap-2"
        >
          <Lock className="w-4 h-4" />
          حفظ الإقفال
        </button>
      </div>
    </div>
  );
}
