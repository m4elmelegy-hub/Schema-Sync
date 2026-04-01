import { useState, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2, ArrowUpFromLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmModal } from "@/components/confirm-modal";
import { SearchableSelect } from "@/components/searchable-select";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface PaymentVoucher {
  id: number; voucher_no: string; date: string;
  customer_id: number | null; customer_name: string;
  safe_id: number; safe_name: string;
  amount: number; notes: string | null; created_at: string;
}

interface Customer { id: number; name: string; balance: number; customer_code?: number | null; }

export default function PaymentVouchers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: safes = [] } = useGetSettingsSafes();
  const { data: vouchers = [], isLoading } = useQuery<PaymentVoucher[]>({
    queryKey: ["/api/payment-vouchers"],
    queryFn: () => authFetch(api("/api/payment-vouchers")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => authFetch(api("/api/customers")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    customer_id: "", customer_name_manual: "", safe_id: "", amount: "", notes: "",
    date: new Date().toISOString().split("T")[0],
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authFetch(api("/api/payment-vouchers"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "خطأ"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم حفظ سند التوريد" });
      qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowAdd(false);
      setForm({ customer_id: "", customer_name_manual: "", safe_id: "", amount: "", notes: "", date: new Date().toISOString().split("T")[0] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(api(`/api/payment-vouchers/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      toast({ title: "تم الحذف" });
      qc.invalidateQueries({ queryKey: ["/api/payment-vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const selectedCustomer = customers.find(c => String(c.id) === form.customer_id);
  const resolvedName = selectedCustomer?.name || form.customer_name_manual;

  const customerItems = useMemo(() =>
    customers.map(c => ({
      value: String(c.id),
      label: `${c.customer_code ? `[${c.customer_code}] ` : ""}${c.name}${Number(c.balance) < 0 ? ` (علينا له ${formatCurrency(Math.abs(Number(c.balance)))})` : ""}`,
      searchKeys: [String(c.customer_code ?? ""), c.name],
    })),
    [customers]
  );

  const normalizeName = (s: string) =>
    s.trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();

  const handleManualBlur = () => {
    if (!form.customer_name_manual || form.customer_id) return;
    const q = normalizeName(form.customer_name_manual);
    const match = customers.find(c => normalizeName(c.name) === q);
    if (match) {
      setForm(f => ({ ...f, customer_id: String(match.id), customer_name_manual: "" }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedName) { toast({ title: "اختر العميل أو أدخل الاسم", variant: "destructive" }); return; }
    if (!form.safe_id || !form.amount) { toast({ title: "اختر الخزينة وأدخل المبلغ", variant: "destructive" }); return; }
    createMutation.mutate({
      customer_id: form.customer_id ? parseInt(form.customer_id) : undefined,
      customer_name: resolvedName,
      safe_id: parseInt(form.safe_id),
      amount: parseFloat(form.amount),
      notes: form.notes || undefined,
      date: form.date,
    });
  };

  return (
    <div className="space-y-6">
      {confirmDeleteId !== null && (
        <ConfirmModal
          title="حذف سند التوريد"
          description="سيتم حذف السند وعكس المبلغ من الخزينة ورصيد العميل."
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDeleteId, { onSuccess: () => setConfirmDeleteId(null) })}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ArrowUpFromLine className="w-6 h-6 text-orange-400" />
          <h2 className="text-xl font-bold text-white">سندات التوريد</h2>
          <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded-full">{vouchers.length} سند</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl">
          <Plus className="w-4 h-4" /> سند توريد جديد
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
          <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md space-y-4 modal-panel">
            <h3 className="text-xl font-bold text-white mb-2">سند توريد جديد</h3>
            <p className="text-xs text-white/50 -mt-2 mb-4">تسديد نقدي للعميل → الخزينة تنزل ورصيده يرتفع</p>

            <div>
              <label className="text-white/60 text-sm block mb-1">العميل *</label>
              <SearchableSelect
                items={customerItems}
                value={form.customer_id}
                onChange={v => setForm(f => ({ ...f, customer_id: v, customer_name_manual: "" }))}
                placeholder="ابحث باسم أو كود..."
                emptyLabel="-- اختر العميل --"
              />
              {selectedCustomer && Number(selectedCustomer.balance) < 0 && (
                <p className="text-xs text-orange-400 mt-1">
                  رصيد العميل الحالي: <span className="font-bold">{formatCurrency(Math.abs(Number(selectedCustomer.balance)))}</span> علينا له
                </p>
              )}
              {!form.customer_id && (
                <input
                  type="text"
                  className="glass-input w-full mt-2"
                  placeholder="أو اكتب الاسم يدوياً..."
                  value={form.customer_name_manual}
                  onChange={e => setForm(f => ({ ...f, customer_name_manual: e.target.value }))}
                  onBlur={handleManualBlur}
                />
              )}
            </div>

            <div>
              <label className="text-white/60 text-sm block mb-1">الخزينة الصارفة *</label>
              <select required className="glass-input w-full" value={form.safe_id}
                onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
                <option value="">-- اختر الخزينة --</option>
                {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
              </select>
            </div>

            <div>
              <label className="text-white/60 text-sm block mb-1">المبلغ المُسدَّد *</label>
              <input required type="number" step="0.01" min="0.01" className="glass-input w-full"
                placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
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
              <button type="submit" disabled={createMutation.isPending}
                className="flex-1 btn-primary py-3 rounded-xl font-bold">
                {createMutation.isPending ? "جاري الحفظ..." : "حفظ سند التوريد"}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold hover:bg-white/20">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium">رقم السند</th>
                <th className="p-4 font-medium">العميل</th>
                <th className="p-4 font-medium">الخزينة</th>
                <th className="p-4 font-medium">المبلغ المُسدَّد</th>
                <th className="p-4 font-medium">التاريخ</th>
                <th className="p-4 font-medium">ملاحظات</th>
                <th className="p-4 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={7} rows={5} />
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-white/40">لا توجد سندات توريد بعد</td></tr>
              ) : vouchers.map(v => (
                <tr key={v.id} className="border-b border-white/5 erp-table-row">
                  <td className="p-4 font-mono text-orange-400 text-sm">{v.voucher_no}</td>
                  <td className="p-4 font-bold text-white">{v.customer_name}</td>
                  <td className="p-4 text-blue-300">{v.safe_name}</td>
                  <td className="p-4 font-bold text-orange-400">{formatCurrency(v.amount)}</td>
                  <td className="p-4 text-sm text-white/60">{v.date}</td>
                  <td className="p-4 text-white/50 text-sm">{v.notes || '-'}</td>
                  <td className="p-4">
                    <button onClick={() => setConfirmDeleteId(v.id)}
                      className="btn-icon btn-icon-danger">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
