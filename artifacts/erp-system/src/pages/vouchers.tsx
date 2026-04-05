import { useState, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  Plus, Trash2, CheckCircle, XCircle, ArrowLeftRight,
  HandCoins, ArrowUpFromLine, Landmark,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmModal } from "@/components/confirm-modal";
import { SearchableSelect } from "@/components/searchable-select";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;
const today = () => new Date().toISOString().split("T")[0];

/* ──────────────────── interfaces ─────────────────────── */
interface Customer { id: number; name: string; balance: number; customer_code?: number | null; }

interface ReceiptVoucher {
  id: number; voucher_no: string; date: string;
  customer_id: number | null; customer_name: string;
  safe_id: number; safe_name: string; amount: number;
  notes: string | null; created_at: string;
}
interface DepositVoucher {
  id: number; voucher_no: string; date: string;
  customer_id: number | null; customer_name: string | null;
  safe_id: number; safe_name: string; amount: number;
  posting_status: string; source: string | null; notes: string | null; created_at: string;
}
interface PaymentVoucher {
  id: number; voucher_no: string; date: string;
  customer_id: number | null; customer_name: string;
  safe_id: number; safe_name: string; amount: number;
  posting_status: string; notes: string | null; created_at: string;
}
interface SafeTransfer {
  id: number; type: string; safe_id: number | null; safe_name: string | null;
  amount: number; direction: string; description: string | null;
  date: string | null; created_at: string;
}

/* ──────────────────── unified row ─────────────────────── */
type VoucherKind = "receipt" | "deposit" | "payment" | "transfer";
interface UnifiedVoucher {
  uid: string; kind: VoucherKind; rawId: number;
  voucherNo: string; partyName: string; safeName: string;
  amount: number; status: string | null;
  date: string; notes: string | null;
  voucherType: "قبض" | "صرف";
  subType: string;
}

function toUnified(
  receipts: ReceiptVoucher[],
  deposits: DepositVoucher[],
  payments: PaymentVoucher[],
  transfers: SafeTransfer[],
): UnifiedVoucher[] {
  const rows: UnifiedVoucher[] = [];

  receipts.forEach(v => rows.push({
    uid: `receipt-${v.id}`, kind: "receipt", rawId: v.id,
    voucherNo: v.voucher_no, partyName: v.customer_name, safeName: v.safe_name,
    amount: v.amount, status: null, date: v.date, notes: v.notes,
    voucherType: "قبض", subType: "عميل",
  }));

  deposits.forEach(v => rows.push({
    uid: `deposit-${v.id}`, kind: "deposit", rawId: v.id,
    voucherNo: v.voucher_no, partyName: v.customer_name || v.source || "—", safeName: v.safe_name,
    amount: v.amount, status: v.posting_status, date: v.date, notes: v.notes,
    voucherType: "قبض", subType: "توريد",
  }));

  payments.forEach(v => rows.push({
    uid: `payment-${v.id}`, kind: "payment", rawId: v.id,
    voucherNo: v.voucher_no, partyName: v.customer_name, safeName: v.safe_name,
    amount: v.amount, status: v.posting_status, date: v.date, notes: v.notes,
    voucherType: "صرف", subType: "صرف",
  }));

  const outTransfers = transfers.filter(t => t.direction === "out" && t.type === "transfer_out");
  outTransfers.forEach(t => rows.push({
    uid: `transfer-${t.id}`, kind: "transfer", rawId: t.id,
    voucherNo: `TRF-${t.id}`, partyName: t.description || "تحويل خزنة", safeName: t.safe_name || "—",
    amount: t.amount, status: null, date: t.date || "", notes: null,
    voucherType: "صرف", subType: "تحويل خزنة",
  }));

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/* ──────────────────── badges ─────────────────────────── */
function TypeBadge({ type }: { type: "قبض" | "صرف" }) {
  return type === "قبض"
    ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><HandCoins className="w-3 h-3"/>قبض</span>
    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30"><ArrowUpFromLine className="w-3 h-3"/>صرف</span>;
}

function SubBadge({ sub }: { sub: string }) {
  const map: Record<string, string> = {
    "عميل":        "bg-blue-500/15 text-blue-300 border-blue-500/20",
    "توريد":       "bg-teal-500/15 text-teal-300 border-teal-500/20",
    "صرف":         "bg-orange-500/15 text-orange-300 border-orange-500/20",
    "تحويل خزنة": "bg-violet-500/15 text-violet-300 border-violet-500/20",
  };
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${map[sub] ?? "bg-white/10 text-white/50 border-white/10"}`}>{sub}</span>;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status)            return <span className="text-xs text-white/30">—</span>;
  if (status === "posted")    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">مرحَّل</span>;
  if (status === "cancelled") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">ملغى</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/50">مسودة</span>;
}

/* ──────────────────── Receipt modal ───────────────────── */
type ReceiptSource = "عميل" | "توريد";

function ReceiptModal({ safes, customers, onClose, onDone }: {
  safes: { id: number; name: string; balance: string | number }[];
  customers: Customer[];
  onClose: () => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [source, setSource] = useState<ReceiptSource>("عميل");
  const [form, setForm] = useState({
    customer_id: "", party_name: "", safe_id: "", amount: "", notes: "", date: today(),
  });

  const customerItems = useMemo(() =>
    customers.map(c => ({
      value: String(c.id),
      label: `${c.customer_code ? `[${c.customer_code}] ` : ""}${c.name}${Number(c.balance) > 0 ? ` — دين: ${formatCurrency(c.balance)}` : ""}`,
      searchKeys: [String(c.customer_code ?? ""), c.name],
    })), [customers]);

  const selectedCustomer = customers.find(c => String(c.id) === form.customer_id);

  const createReceipt = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authFetch(api("/api/receipt-vouchers"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "✅ تم حفظ سند القبض" }); onDone(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createDeposit = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authFetch(api("/api/deposit-vouchers"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "✅ تم حفظ سند التوريد" }); onDone(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] });
    qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
    qc.invalidateQueries({ queryKey: ["/api/customers"] });
  }

  const isPending = createReceipt.isPending || createDeposit.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.safe_id || !form.amount) {
      toast({ title: "الرجاء ملء جميع الحقول المطلوبة", variant: "destructive" }); return;
    }
    if (source === "عميل") {
      if (!form.customer_id) { toast({ title: "اختر العميل", variant: "destructive" }); return; }
      const cust = customers.find(c => String(c.id) === form.customer_id);
      createReceipt.mutate({
        customer_id: parseInt(form.customer_id), customer_name: cust?.name ?? "",
        safe_id: parseInt(form.safe_id), amount: parseFloat(form.amount),
        notes: form.notes || undefined, date: form.date,
      });
    } else {
      if (!form.customer_id && !form.party_name) {
        toast({ title: "اختر العميل أو أدخل الاسم", variant: "destructive" }); return;
      }
      const cust = customers.find(c => String(c.id) === form.customer_id);
      createDeposit.mutate({
        customer_id: form.customer_id ? parseInt(form.customer_id) : undefined,
        customer_name: cust?.name || form.party_name || undefined,
        safe_id: parseInt(form.safe_id), amount: parseFloat(form.amount),
        notes: form.notes || undefined, date: form.date,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md space-y-4 modal-panel">
        <div className="flex items-center gap-3 mb-2">
          <HandCoins className="w-5 h-5 text-emerald-400" />
          <h3 className="text-xl font-bold text-white">سند قبض جديد</h3>
        </div>

        {/* نوع القبض */}
        <div>
          <label className="text-white/60 text-sm block mb-2">مصدر القبض *</label>
          <div className="grid grid-cols-2 gap-2">
            {(["عميل", "توريد"] as ReceiptSource[]).map(s => (
              <button key={s} type="button"
                onClick={() => { setSource(s); setForm(f => ({ ...f, customer_id: "", party_name: "" })); }}
                className={`py-2 px-3 rounded-xl text-sm font-bold border transition-all ${
                  source === s
                    ? "bg-emerald-500 text-black border-emerald-500"
                    : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                }`}>{s}</button>
            ))}
          </div>
          <p className="text-xs text-white/30 mt-1.5">
            {source === "عميل" && "العميل يسدد دينه ← الخزينة ترتفع، رصيده ينزل"}
            {source === "توريد" && "يورّد نقداً بدون ربطه بعميل بالضرورة ← الخزينة ترتفع"}
          </p>
        </div>

        {/* الطرف */}
        {source === "عميل" ? (
          <div>
            <label className="text-white/60 text-sm block mb-1">العميل *</label>
            <SearchableSelect items={customerItems} value={form.customer_id}
              onChange={v => setForm(f => ({ ...f, customer_id: v }))}
              placeholder="ابحث باسم أو كود..." emptyLabel="-- اختر العميل --" clearable={false} />
            {selectedCustomer && <p className="text-xs mt-1 text-amber-400">إجمالي دين العميل: {formatCurrency(selectedCustomer.balance)}</p>}
          </div>
        ) : (
          <div>
            <label className="text-white/60 text-sm block mb-1">العميل / الطرف</label>
            <SearchableSelect items={customerItems} value={form.customer_id}
              onChange={v => setForm(f => ({ ...f, customer_id: v, party_name: "" }))}
              placeholder="ابحث عن عميل (اختياري)..." emptyLabel="-- غير مرتبط بعميل --" />
            {!form.customer_id && (
              <input type="text" className="glass-input w-full mt-2" placeholder="أو اكتب الاسم يدوياً..."
                value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} />
            )}
          </div>
        )}

        <div>
          <label className="text-white/60 text-sm block mb-1">الخزينة المستلِمة *</label>
          <select required className="glass-input w-full" value={form.safe_id}
            onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
            <option value="">-- اختر الخزينة --</option>
            {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
          </select>
        </div>
        <div>
          <label className="text-white/60 text-sm block mb-1">المبلغ (ج.م) *</label>
          <input required type="number" step="0.01" min="0.01" className="glass-input w-full"
            placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>
        <div>
          <label className="text-white/60 text-sm block mb-1">التاريخ</label>
          <input type="date" className="glass-input w-full" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div>
          <label className="text-white/60 text-sm block mb-1">ملاحظات</label>
          <input type="text" className="glass-input w-full" placeholder="اختياري"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={isPending} className="flex-1 btn-primary py-3 rounded-xl font-bold">
            {isPending ? "جاري الحفظ..." : "حفظ سند القبض"}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20">إلغاء</button>
        </div>
      </form>
    </div>
  );
}

/* ──────────────────── Payment modal ───────────────────── */
type PaymentSubType = "صرف" | "تحويل خزنة";

function PaymentModal({ safes, customers, onClose, onDone }: {
  safes: { id: number; name: string; balance: string | number }[];
  customers: Customer[];
  onClose: () => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [subType, setSubType] = useState<PaymentSubType>("صرف");
  const [form, setForm] = useState({
    customer_id: "", party_name: "", safe_id: "", to_safe_id: "",
    amount: "", notes: "", date: today(),
  });

  const customerItems = useMemo(() =>
    customers.map(c => ({
      value: String(c.id),
      label: `${c.customer_code ? `[${c.customer_code}] ` : ""}${c.name}`,
      searchKeys: [String(c.customer_code ?? ""), c.name],
    })), [customers]);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] });
    qc.invalidateQueries({ queryKey: ["/api/safe-transfers"] });
    qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
    qc.invalidateQueries({ queryKey: ["/api/customers"] });
  }

  const createPayment = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authFetch(api("/api/payment-vouchers"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "✅ تم حفظ سند الصرف" }); onDone(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createTransfer = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authFetch(api("/api/safe-transfers"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "✅ تم تحويل الخزينة بنجاح" }); onDone(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const isPending = createPayment.isPending || createTransfer.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount) { toast({ title: "أدخل المبلغ", variant: "destructive" }); return; }

    if (subType === "تحويل خزنة") {
      if (!form.safe_id || !form.to_safe_id) { toast({ title: "اختر خزينتَي التحويل", variant: "destructive" }); return; }
      if (form.safe_id === form.to_safe_id) { toast({ title: "لا يمكن التحويل من وإلى نفس الخزينة", variant: "destructive" }); return; }
      createTransfer.mutate({
        from_safe_id: parseInt(form.safe_id), to_safe_id: parseInt(form.to_safe_id),
        amount: parseFloat(form.amount), notes: form.notes || undefined, date: form.date,
      });
    } else {
      if (!form.safe_id) { toast({ title: "اختر الخزينة", variant: "destructive" }); return; }
      const cust = customers.find(c => String(c.id) === form.customer_id);
      const name = cust?.name || form.party_name || "";
      if (!name) { toast({ title: "أدخل الطرف المستفيد", variant: "destructive" }); return; }
      createPayment.mutate({
        customer_id: form.customer_id ? parseInt(form.customer_id) : undefined,
        customer_name: name, safe_id: parseInt(form.safe_id),
        amount: parseFloat(form.amount), notes: form.notes || undefined, date: form.date,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md space-y-4 modal-panel max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-2">
          <ArrowUpFromLine className="w-5 h-5 text-orange-400" />
          <h3 className="text-xl font-bold text-white">سند صرف جديد</h3>
        </div>

        {/* نوع الصرف */}
        <div>
          <label className="text-white/60 text-sm block mb-2">نوع الصرف *</label>
          <div className="grid grid-cols-2 gap-2">
            {(["صرف", "تحويل خزنة"] as PaymentSubType[]).map(s => (
              <button key={s} type="button"
                onClick={() => { setSubType(s); setForm(f => ({ ...f, customer_id: "", party_name: "", to_safe_id: "" })); }}
                className={`py-2 px-3 rounded-xl text-sm font-bold border transition-all ${
                  subType === s
                    ? "bg-orange-500 text-black border-orange-500"
                    : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                }`}>{s}</button>
            ))}
          </div>
          <p className="text-xs text-white/30 mt-1.5">
            {subType === "صرف" && "صرف نقدي للطرف المستفيد ← الخزينة تنزل"}
            {subType === "تحويل خزنة" && "تحويل رصيد من خزينة إلى أخرى ← لا تغيير في الإجمالي"}
          </p>
        </div>

        {subType !== "تحويل خزنة" && (
          <div>
            <label className="text-white/60 text-sm block mb-1">الطرف المستفيد</label>
            <SearchableSelect items={customerItems} value={form.customer_id}
              onChange={v => setForm(f => ({ ...f, customer_id: v, party_name: "" }))}
              placeholder="ابحث عن عميل / مورد..." emptyLabel="-- غير مرتبط --" />
            {!form.customer_id && (
              <input type="text" className="glass-input w-full mt-2" placeholder="أو اكتب الاسم يدوياً..."
                value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} />
            )}
          </div>
        )}

        {subType === "تحويل خزنة" ? (
          <>
            <div>
              <label className="text-white/60 text-sm block mb-1">من الخزينة *</label>
              <select required className="glass-input w-full" value={form.safe_id}
                onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
                <option value="">-- اختر الخزينة المُحوِّلة --</option>
                {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1">إلى الخزينة *</label>
              <select required className="glass-input w-full" value={form.to_safe_id}
                onChange={e => setForm(f => ({ ...f, to_safe_id: e.target.value }))}>
                <option value="">-- اختر الخزينة المستقبِلة --</option>
                {safes.filter(s => String(s.id) !== form.safe_id).map(s =>
                  <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>
                )}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="text-white/60 text-sm block mb-1">الخزينة الصارفة *</label>
            <select required className="glass-input w-full" value={form.safe_id}
              onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
              <option value="">-- اختر الخزينة --</option>
              {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-white/60 text-sm block mb-1">المبلغ (ج.م) *</label>
          <input required type="number" step="0.01" min="0.01" className="glass-input w-full"
            placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>
        <div>
          <label className="text-white/60 text-sm block mb-1">التاريخ</label>
          <input type="date" className="glass-input w-full" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div>
          <label className="text-white/60 text-sm block mb-1">ملاحظات</label>
          <input type="text" className="glass-input w-full" placeholder="اختياري"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={isPending} className="flex-1 btn-primary py-3 rounded-xl font-bold">
            {isPending ? "جاري الحفظ..." : subType === "تحويل خزنة" ? "تنفيذ التحويل" : "حفظ سند الصرف"}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20">إلغاء</button>
        </div>
      </form>
    </div>
  );
}

/* ──────────────────── main page ───────────────────────── */
type TabFilter = "الكل" | "قبض" | "صرف";

export default function Vouchers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: safes = [] } = useGetSettingsSafes();

  const { data: receipts = [],  isLoading: l1 } = useQuery<ReceiptVoucher[]>({
    queryKey: ["/api/receipt-vouchers"],
    queryFn: () => authFetch(api("/api/receipt-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });
  const { data: deposits = [],  isLoading: l2 } = useQuery<DepositVoucher[]>({
    queryKey: ["/api/deposit-vouchers"],
    queryFn: () => authFetch(api("/api/deposit-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });
  const { data: payments = [],  isLoading: l3 } = useQuery<PaymentVoucher[]>({
    queryKey: ["/api/payment-vouchers"],
    queryFn: () => authFetch(api("/api/payment-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });
  const { data: transfers = [], isLoading: l4 } = useQuery<SafeTransfer[]>({
    queryKey: ["/api/safe-transfers"],
    queryFn: () => authFetch(api("/api/safe-transfers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => authFetch(api("/api/customers")).then(r => { if (!r.ok) throw new Error("خطأ"); return r.json(); }),
  });

  const isLoading = l1 || l2 || l3 || l4;

  const [tab, setTab]             = useState<TabFilter>("الكل");
  const [showReceipt, setShowReceipt] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ uid: string; kind: VoucherKind; rawId: number } | null>(null);

  const allRows = useMemo(() => toUnified(receipts, deposits, payments, transfers), [receipts, deposits, payments, transfers]);
  const filtered = tab === "الكل" ? allRows : allRows.filter(r => r.voucherType === tab);

  /* ── mutations ── */
  const deleteReceipt = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/receipt-vouchers/${id}`), { method: "DELETE" }).then(r => { if (!r.ok) throw new Error("فشل الحذف"); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/receipt-vouchers"] }); qc.invalidateQueries({ queryKey: ["/api/settings/safes"] }); qc.invalidateQueries({ queryKey: ["/api/customers"] }); toast({ title: "تم الحذف" }); setConfirmDelete(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const deleteDeposit = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/deposit-vouchers/${id}`), { method: "DELETE" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] }); qc.invalidateQueries({ queryKey: ["/api/settings/safes"] }); toast({ title: "تم الحذف" }); setConfirmDelete(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const deletePayment = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/payment-vouchers/${id}`), { method: "DELETE" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] }); qc.invalidateQueries({ queryKey: ["/api/settings/safes"] }); toast({ title: "تم الحذف" }); setConfirmDelete(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const postDeposit = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/deposit-vouchers/${id}/post`), { method: "POST" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] }); toast({ title: "✅ تم الترحيل" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const cancelDeposit = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/deposit-vouchers/${id}/cancel`), { method: "POST" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/deposit-vouchers"] }); toast({ title: "تم الإلغاء" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const postPayment = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/payment-vouchers/${id}/post`), { method: "POST" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] }); toast({ title: "✅ تم الترحيل" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const cancelPayment = useMutation({
    mutationFn: (id: number) => authFetch(api(`/api/payment-vouchers/${id}/cancel`), { method: "POST" }).then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error || "فشل"); } return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] }); toast({ title: "تم الإلغاء" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleDelete() {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "receipt") deleteReceipt.mutate(confirmDelete.rawId);
    if (confirmDelete.kind === "deposit") deleteDeposit.mutate(confirmDelete.rawId);
    if (confirmDelete.kind === "payment") deletePayment.mutate(confirmDelete.rawId);
  }

  /* ── summaries ── */
  const totalReceipt  = allRows.filter(r => r.voucherType === "قبض").reduce((s, r) => s + r.amount, 0);
  const totalPayment  = allRows.filter(r => r.voucherType === "صرف" && r.kind !== "transfer").reduce((s, r) => s + r.amount, 0);
  const totalTransfer = allRows.filter(r => r.kind === "transfer").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmModal
          title="حذف السند"
          description="سيتم حذف السند وعكس أثره على الخزينة."
          isPending={deleteReceipt.isPending || deleteDeposit.isPending || deletePayment.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Modals */}
      {showReceipt && (
        <ReceiptModal safes={safes} customers={customers}
          onClose={() => setShowReceipt(false)}
          onDone={() => setShowReceipt(false)} />
      )}
      {showPayment && (
        <PaymentModal safes={safes} customers={customers}
          onClose={() => setShowPayment(false)}
          onDone={() => setShowPayment(false)} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Landmark className="w-6 h-6 text-amber-400" />
            نظام السندات
          </h1>
          <p className="text-white/40 text-sm mt-1">سندات القبض والصرف وتحويلات الخزائن في مكان واحد</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReceipt(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30">
            <HandCoins className="w-4 h-4" /> سند قبض
          </button>
          <button onClick={() => setShowPayment(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30">
            <ArrowUpFromLine className="w-4 h-4" /> سند صرف
          </button>
        </div>
      </div>

      {/* بطاقات الخزائن */}
      {safes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {safes.map(s => (
            <div key={s.id} className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <p className="text-white/50 text-xs mb-1">{s.name}</p>
              <p className="text-xl font-black text-amber-400">{formatCurrency(Number(s.balance))}</p>
            </div>
          ))}
        </div>
      )}

      {/* بطاقات الإجماليات */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-right">
          <div className="text-emerald-400/70 text-xs mb-1">إجمالي القبض</div>
          <div className="text-lg font-black text-emerald-400">{formatCurrency(totalReceipt)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r => r.voucherType === "قبض").length} سند</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-right">
          <div className="text-orange-400/70 text-xs mb-1">إجمالي الصرف</div>
          <div className="text-lg font-black text-orange-400">{formatCurrency(totalPayment)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r => r.voucherType === "صرف" && r.kind !== "transfer").length} سند</div>
        </div>
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 text-right">
          <div className="text-violet-400/70 text-xs mb-1">تحويلات الخزائن</div>
          <div className="text-lg font-black text-violet-400">{formatCurrency(totalTransfer)}</div>
          <div className="text-white/30 text-xs mt-1">{allRows.filter(r => r.kind === "transfer").length} تحويل</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-2xl p-1 w-fit">
        {(["الكل", "قبض", "صرف"] as TabFilter[]).map(t => {
          const count = t === "الكل" ? allRows.length
            : allRows.filter(r => r.voucherType === t).length;
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === t ? "bg-amber-500 text-black shadow-lg" : "text-white/50 hover:text-white"
              }`}>
              {t === "قبض" && <HandCoins className="w-3.5 h-3.5" />}
              {t === "صرف" && <ArrowUpFromLine className="w-3.5 h-3.5" />}
              {t === "الكل" && <ArrowLeftRight className="w-3.5 h-3.5" />}
              {t}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t ? "bg-black/20" : "bg-white/10"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium text-white/60">النوع</th>
                <th className="p-4 font-medium text-white/60">رقم السند</th>
                <th className="p-4 font-medium text-white/60">الطرف</th>
                <th className="p-4 font-medium text-white/60">الخزينة</th>
                <th className="p-4 font-medium text-white/60">المبلغ</th>
                <th className="p-4 font-medium text-white/60">الحالة</th>
                <th className="p-4 font-medium text-white/60">التاريخ</th>
                <th className="p-4 font-medium text-white/60">ملاحظات</th>
                <th className="p-4 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={9} rows={6} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-white/40">
                    لا توجد سندات بعد
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr key={row.uid} className="border-b border-white/5 erp-table-row">
                  {/* النوع */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <TypeBadge type={row.voucherType} />
                      <SubBadge sub={row.subType} />
                    </div>
                  </td>
                  {/* رقم السند */}
                  <td className="p-4 font-mono text-amber-400 text-sm">{row.voucherNo}</td>
                  {/* الطرف */}
                  <td className="p-4 font-bold text-white">{row.partyName}</td>
                  {/* الخزينة */}
                  <td className="p-4 text-blue-300">{row.safeName}</td>
                  {/* المبلغ */}
                  <td className="p-4 font-bold">
                    <span className={row.voucherType === "قبض" ? "text-emerald-400" : "text-orange-400"}>
                      {formatCurrency(row.amount)}
                    </span>
                  </td>
                  {/* الحالة */}
                  <td className="p-4"><StatusBadge status={row.status} /></td>
                  {/* التاريخ */}
                  <td className="p-4 text-sm text-white/60">{row.date || "—"}</td>
                  {/* ملاحظات */}
                  <td className="p-4 text-white/50 text-sm max-w-[150px] truncate">{row.notes || "—"}</td>
                  {/* إجراءات */}
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      {/* Deposit: post/cancel */}
                      {row.kind === "deposit" && row.status === "draft" && (
                        <button onClick={() => postDeposit.mutate(row.rawId)} disabled={postDeposit.isPending} title="ترحيل"
                          className="btn-icon text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {row.kind === "deposit" && row.status === "posted" && (
                        <button onClick={() => cancelDeposit.mutate(row.rawId)} disabled={cancelDeposit.isPending} title="إلغاء"
                          className="btn-icon text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {/* Payment: post/cancel */}
                      {row.kind === "payment" && row.status === "draft" && (
                        <button onClick={() => postPayment.mutate(row.rawId)} disabled={postPayment.isPending} title="ترحيل"
                          className="btn-icon text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {row.kind === "payment" && row.status === "posted" && (
                        <button onClick={() => cancelPayment.mutate(row.rawId)} disabled={cancelPayment.isPending} title="إلغاء"
                          className="btn-icon text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {/* Delete (not for transfers, not for posted) */}
                      {row.kind !== "transfer" && row.status !== "posted" && (
                        <button onClick={() => setConfirmDelete({ uid: row.uid, kind: row.kind, rawId: row.rawId })}
                          className="btn-icon btn-icon-danger" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
