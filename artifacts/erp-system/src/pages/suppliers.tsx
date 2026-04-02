import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useGetSuppliers, useCreateSupplier, useCreateSupplierPayment, useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, Search, DollarSign, FileText, X, Loader2, TrendingDown, TrendingUp, RotateCcw } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── أنواع بيانات كشف الحساب ─── */
interface StatementRow {
  date: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference_no?: string | null;
}

interface SupplierStatement {
  supplier: { id: number; name: string; phone: string | null; balance: number };
  statement: StatementRow[];
  closing_balance: number;
}

/* ─── نافذة كشف حساب المورد — تستدعي /api/suppliers/:id/statement ─── */
function SupplierStatementModal({ supplierId, supplierName, onClose }: {
  supplierId: number;
  supplierName: string;
  onClose: () => void;
}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("erp_auth_token") : null;

  const { data, isLoading, isError } = useQuery<SupplierStatement>({
    queryKey: [`/api/suppliers/${supplierId}/statement`],
    queryFn: async () => {
      const res = await authFetch(api(`/api/suppliers/${supplierId}/statement`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("فشل جلب كشف الحساب");
      return res.json() as Promise<SupplierStatement>;
    },
  });

  const totalCredit = data?.statement.reduce((s, r) => s + r.credit, 0) ?? 0;
  const totalDebit  = data?.statement.reduce((s, r) => s + r.debit, 0)  ?? 0;

  const rowTypeConfig: Record<string, { label: string; color: string }> = {
    opening_balance: { label: "رصيد أول المدة", color: "text-amber-400" },
    purchase:        { label: "فاتورة شراء",    color: "text-red-400"   },
    purchase_return: { label: "مرتجع مشتريات",  color: "text-blue-400"  },
    payment:         { label: "دفعة مسددة",     color: "text-emerald-400" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay"
      onKeyDown={e => e.key === "Escape" && onClose()}>
      <div className="glass-panel rounded-3xl p-0 w-full max-w-4xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
          <div>
            <h3 className="text-2xl font-bold text-white">كشف حساب مورد</h3>
            <p className="text-amber-400 font-semibold mt-1">{supplierName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
          )}

          {isError && (
            <div className="text-center py-16 text-red-400">فشل تحميل كشف الحساب</div>
          )}

          {data && (
            <>
              {/* ── بطاقات الملخص ── */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    <p className="text-red-400 text-xs">إجمالي الديون</p>
                  </div>
                  <p className="text-white font-black text-lg">{formatCurrency(totalCredit)}</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <p className="text-emerald-400 text-xs">إجمالي المدفوع</p>
                  </div>
                  <p className="text-white font-black text-lg">{formatCurrency(totalDebit)}</p>
                </div>
                <div className={`border rounded-2xl p-4 text-center ${data.closing_balance > 0 ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <RotateCcw className={`w-3.5 h-3.5 ${data.closing_balance > 0 ? "text-red-400" : "text-emerald-400"}`} />
                    <p className={`text-xs ${data.closing_balance > 0 ? "text-red-400" : "text-emerald-400"}`}>الرصيد الختامي</p>
                  </div>
                  <p className="text-white font-black text-lg">{formatCurrency(Math.abs(data.closing_balance))}</p>
                  <p className={`text-xs mt-0.5 font-bold ${data.closing_balance > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {data.closing_balance > 0 ? "مستحق للمورد" : data.closing_balance < 0 ? "له رصيد دائن" : "متسوّى"}
                  </p>
                </div>
              </div>

              {/* ── جدول الحركات ── */}
              {data.statement.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-8">لا توجد حركات مسجلة لهذا المورد</p>
              ) : (
                <div className="rounded-2xl overflow-hidden border border-white/10">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="p-3 text-white/60 font-semibold">التاريخ</th>
                        <th className="p-3 text-white/60 font-semibold">البيان</th>
                        <th className="p-3 text-white/60 font-semibold">مرجع</th>
                        <th className="p-3 text-white/60 font-semibold text-center">مدين (عليه)</th>
                        <th className="p-3 text-white/60 font-semibold text-center">دائن (له)</th>
                        <th className="p-3 text-white/60 font-semibold text-center">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.statement.map((row, i) => {
                        const cfg = rowTypeConfig[row.type] ?? { label: row.type, color: "text-white/70" };
                        return (
                          <tr key={i} className="border-b border-white/5 erp-table-row">
                            <td className="p-3 text-white/50 tabular-nums">{row.date}</td>
                            <td className={`p-3 font-medium ${cfg.color}`}>{row.description}</td>
                            <td className="p-3 text-white/40 font-mono text-xs">{row.reference_no ?? "—"}</td>
                            <td className="p-3 text-center font-bold text-emerald-400">
                              {row.debit > 0 ? formatCurrency(row.debit) : "—"}
                            </td>
                            <td className="p-3 text-center font-bold text-red-400">
                              {row.credit > 0 ? formatCurrency(row.credit) : "—"}
                            </td>
                            <td className={`p-3 text-center font-black ${row.balance > 0 ? "text-red-400" : row.balance < 0 ? "text-emerald-400" : "text-white/30"}`}>
                              {row.balance !== 0
                                ? `${formatCurrency(Math.abs(row.balance))} ${row.balance > 0 ? "↑" : "↓"}`
                                : "صفر"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-white/5 border-t border-white/10">
                      <tr>
                        <td colSpan={3} className="p-3 text-white/60 font-bold">الإجمالي</td>
                        <td className="p-3 text-center font-black text-emerald-400">{formatCurrency(totalDebit)}</td>
                        <td className="p-3 text-center font-black text-red-400">{formatCurrency(totalCredit)}</td>
                        <td className={`p-3 text-center font-black ${data.closing_balance > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {formatCurrency(Math.abs(data.closing_balance))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── الصفحة الرئيسية ─── */
export default function Suppliers() {
  const { data: suppliers = [], isLoading } = useGetSuppliers();
  const { data: safes = [] } = useGetSettingsSafes();
  const createMutation = useCreateSupplier();
  const paymentMutation = useCreateSupplierPayment();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showPayment, setShowPayment] = useState<{ id: number; name: string; balance: number } | null>(null);
  const [showReport, setShowReport] = useState<{ id: number; name: string } | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", balance: 0 });
  const [paymentData, setPaymentData] = useState({ amount: 0, safe_id: 0, description: "" });
  const [payError, setPayError] = useState("");

  const filtered = suppliers.filter(s =>
    s.name.includes(search) ||
    (s.phone && s.phone.includes(search)) ||
    (s.supplier_code && String(s.supplier_code).includes(search))
  );

  const totalOwed = suppliers.reduce((s, sup) => s + (Number(sup.balance) > 0 ? Number(sup.balance) : 0), 0);
  const suppliersWithDebt = suppliers.filter(s => Number(s.balance) > 0).length;
  const suppliersSettled = suppliers.length - suppliersWithDebt;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    createMutation.mutate({ data: formData as never }, {
      onSuccess: () => {
        toast({ title: "تم إضافة المورد بنجاح" });
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        setShowAdd(false);
        setFormData({ name: "", phone: "", balance: 0 });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "فشل إضافة المورد";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPayError("");
    if (!showPayment) return;
    if (!paymentData.safe_id) { setPayError("يجب اختيار الخزينة"); return; }
    if (!paymentData.amount || paymentData.amount <= 0) { setPayError("يجب إدخال مبلغ صحيح"); return; }
    if (paymentData.amount > showPayment.balance) { setPayError(`المبلغ أكبر من الرصيد المستحق (${formatCurrency(showPayment.balance)})`); return; }

    paymentMutation.mutate(
      { id: showPayment.id, data: { amount: paymentData.amount, safe_id: paymentData.safe_id, description: paymentData.description || undefined } as never },
      {
        onSuccess: () => {
          toast({ title: "تم تسجيل الدفعة بنجاح" });
          queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
          setShowPayment(null);
          setPaymentData({ amount: 0, safe_id: 0, description: "" });
          setPayError("");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "فشل تسجيل الدفعة";
          setPayError(msg);
        },
      }
    );
  };

  return (
    <div className="space-y-6">

      {/* ── شريط البحث والإضافة ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input type="text" placeholder="بحث عن مورد..." className="glass-input pl-4 pr-12 w-full"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus className="w-5 h-5" /> إضافة مورد
        </button>
      </div>

      {/* ── إحصائيات الموردين ── */}
      {!isLoading && suppliers.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-panel rounded-2xl p-4 border border-white/10 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <TrendingDown className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-white/40 text-xs">إجمالي الموردين</p>
              <p className="text-white font-black text-xl">{suppliers.length}</p>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-red-500/30 bg-red-500/5 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <DollarSign className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-400/70 text-xs">إجمالي المستحقات</p>
              <p className="text-red-400 font-black text-xl tabular-nums">{formatCurrency(totalOwed)}</p>
              <p className="text-red-400/40 text-xs">{suppliersWithDebt} مورد بدين</p>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-emerald-400/70 text-xs">موردون متسوّيون</p>
              <p className="text-emerald-400 font-black text-xl">{suppliersSettled}</p>
              <p className="text-emerald-400/40 text-xs">لا يوجد دين</p>
            </div>
          </div>
        </div>
      )}

      {/* ── كشف حساب المورد ── */}
      {showReport && (
        <SupplierStatementModal
          supplierId={showReport.id}
          supplierName={showReport.name}
          onClose={() => setShowReport(null)}
        />
      )}

      {/* ── نافذة إضافة مورد ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay">
          <form onSubmit={handleAdd} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">مورد جديد</h3>
              <button type="button" onClick={() => setShowAdd(false)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">اسم المورد *</label>
                <input required type="text" className="glass-input" value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رقم الهاتف</label>
                <input type="text" className="glass-input" value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-1">رصيد ابتدائي (له)</label>
                <input type="number" step="0.01" min="0" className="glass-input"
                  value={formData.balance || ""}
                  onChange={e => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })} />
              </div>

            </div>
            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "حفظ"}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setFormData({ name: "", phone: "", balance: 0 }); }} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* ── نافذة سداد دفعة ── */}
      {showPayment !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay">
          <form onSubmit={handlePayment} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-2xl font-bold text-white">سداد مستحقات مورد</h3>
              <button type="button" onClick={() => { setShowPayment(null); setPayError(""); }}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <p className="text-amber-400 font-semibold mb-1">{showPayment.name}</p>
            <p className="text-white/50 text-sm mb-6">
              الرصيد المستحق: <span className="text-red-400 font-bold">{formatCurrency(showPayment.balance)}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-1">الخزينة *</label>
                <select required className="glass-input" value={paymentData.safe_id || ""}
                  onChange={e => setPaymentData({ ...paymentData, safe_id: parseInt(e.target.value) || 0 })}>
                  <option value="">— اختر الخزينة —</option>
                  {safes.map((s: { id: number; name: string; balance: number | string }) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatCurrency(Number(s.balance))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-white/70 text-sm">المبلغ المدفوع *</label>
                  <button type="button"
                    onClick={() => setPaymentData({ ...paymentData, amount: showPayment.balance })}
                    className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg hover:bg-amber-500/20 transition-colors font-bold">
                    سداد كامل ({formatCurrency(showPayment.balance)})
                  </button>
                </div>
                <input required type="number" step="0.01" min="0.01"
                  max={showPayment.balance}
                  className="glass-input"
                  value={paymentData.amount || ""}
                  onChange={e => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })} />
                {paymentData.amount > 0 && paymentData.amount < showPayment.balance && (
                  <div className="flex items-center justify-between mt-2 px-3 py-1.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <span className="text-amber-400/70 text-xs">المتبقي بعد الدفع</span>
                    <span className="text-amber-400 font-bold text-xs tabular-nums">
                      {formatCurrency(showPayment.balance - paymentData.amount)}
                    </span>
                  </div>
                )}
                {paymentData.amount >= showPayment.balance && paymentData.amount > 0 && (
                  <p className="text-emerald-400 text-xs mt-1.5 font-bold">✓ سداد كامل — الرصيد سيصبح صفر</p>
                )}
              </div>

              <div>
                <label className="block text-white/70 text-sm mb-1">البيان</label>
                <input type="text" className="glass-input" placeholder="اختياري..."
                  value={paymentData.description}
                  onChange={e => setPaymentData({ ...paymentData, description: e.target.value })} />
              </div>
            </div>

            {payError && (
              <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                {payError}
              </p>
            )}

            <div className="flex gap-4 mt-8">
              <button type="submit" disabled={paymentMutation.isPending}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-colors disabled:opacity-50">
                {paymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "تأكيد الدفع"}
              </button>
              <button type="button" onClick={() => { setShowPayment(null); setPayError(""); }}
                className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* ── جدول الموردين ── */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-semibold text-white/60">الكود</th>
                <th className="p-4 font-semibold text-white/60">المورد</th>
                <th className="p-4 font-semibold text-white/60">رقم الهاتف</th>
                <th className="p-4 font-semibold text-white/60">الرصيد المستحق</th>
                <th className="p-4 font-semibold text-white/60">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={5} rows={5} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-white/40">
                    {search ? "لا توجد نتائج مطابقة" : "لا يوجد موردون بعد"}
                  </td>
                </tr>
              ) : (
                filtered.map(supplier => (
                  <tr key={supplier.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-4">
                      <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {supplier.supplier_code ?? "—"}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-white">{supplier.name}</td>
                    <td className="p-4 text-white/60">{supplier.phone || "—"}</td>
                    <td className="p-4">
                      {Number(supplier.balance) > 0 ? (
                        <div>
                          <span className="font-black text-red-400 tabular-nums block">{formatCurrency(Number(supplier.balance))}</span>
                          <span className="text-xs text-red-400/50 font-medium">مستحق للمورد</span>
                        </div>
                      ) : (
                        <span className="text-emerald-400/70 text-sm font-bold">متسوّى ✓</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => setShowReport({ id: supplier.id, name: supplier.name })}
                          className="flex items-center gap-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-blue-500/30"
                        >
                          <FileText className="w-3.5 h-3.5" /> كشف حساب
                        </button>
                        <button
                          onClick={() => {
                            setPayError("");
                            setPaymentData({ amount: 0, safe_id: 0, description: "" });
                            setShowPayment({ id: supplier.id, name: supplier.name, balance: supplier.balance });
                          }}
                          disabled={supplier.balance <= 0}
                          className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-emerald-500/30"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> سداد دفعة
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
