import { useState, useMemo, useEffect } from "react";
import { useGetSales, useGetSaleById, useGetProducts, useGetCustomers, useGetSettingsSafes } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Search, Plus, Minus, Trash2, X, Printer, ShoppingCart, User, Package, Receipt, RotateCcw, Percent, Vault, Lock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { TableSkeleton } from "@/components/skeletons";
import { ConfirmModal } from "@/components/confirm-modal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface SalesReturn {
  id: number; return_no: string; customer_name: string | null;
  total_amount: number; reason: string | null; created_at: string;
  refund_type: string | null; safe_name: string | null; date: string | null;
}

function SalesReturnsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const resetForm = () => setForm({ customer_id: "", reason: "", item_id: "", quantity: "1", unit_price: "", refund_type: "credit", safe_id: "", date: new Date().toISOString().split("T")[0] });
  const [form, setForm] = useState({ customer_id: "", reason: "", item_id: "", quantity: "1", unit_price: "", refund_type: "credit", safe_id: "", date: new Date().toISOString().split("T")[0] });

  const { data: returns_ = [], isLoading } = useQuery<SalesReturn[]>({
    queryKey: ["/api/sales-returns"],
    queryFn: () => fetch(api("/api/sales-returns")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });
  const { data: products = [] } = useGetProducts();
  const { data: customers = [] } = useGetCustomers();
  const { data: safes = [] } = useGetSettingsSafes();

  const createMutation = useMutation({
    mutationFn: (data: object) => fetch(api("/api/sales-returns"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sales-returns"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setShowForm(false);
      resetForm();
      toast({ title: "✅ تم تسجيل المرتجع — البضاعة عادت للمخزون" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(api(`/api/sales-returns/${id}`), { method: "DELETE" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sales-returns"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      toast({ title: "تم الحذف وعكس جميع الحركات" });
    },
  });

  const totalReturns = returns_.reduce((s, r) => s + r.total_amount, 0);
  const selectedProduct = products.find(p => String(p.id) === form.item_id);
  const selectedCustomer = customers.find(c => String(c.id) === form.customer_id);
  const itemTotal = (parseInt(form.quantity) || 1) * (parseFloat(form.unit_price) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(form.quantity) || 1;
    const price = parseFloat(form.unit_price) || (selectedProduct ? Number(selectedProduct.sale_price) : 0);
    if (!form.item_id) { toast({ title: "اختر الصنف المرتجع", variant: "destructive" }); return; }
    if (form.refund_type === "cash" && !form.safe_id) { toast({ title: "اختر الخزينة للاسترداد النقدي", variant: "destructive" }); return; }
    createMutation.mutate({
      customer_id: form.customer_id ? parseInt(form.customer_id) : null,
      customer_name: selectedCustomer?.name ?? null,
      reason: form.reason || null,
      refund_type: form.refund_type,
      safe_id: form.refund_type === "cash" ? parseInt(form.safe_id) : null,
      date: form.date,
      items: [{
        product_id: parseInt(form.item_id),
        product_name: selectedProduct?.name ?? "",
        quantity: qty,
        unit_price: price,
        total_price: qty * price,
      }],
    });
  };

  return (
    <div className="space-y-4">
      {confirmDeleteId !== null && (
        <ConfirmModal
          title="حذف مرتجع مبيعات"
          description="سيتم حذف المرتجع وعكس تأثيره على رصيد العميل والمخزون نهائياً."
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDeleteId, { onSuccess: () => setConfirmDeleteId(null) })}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
      <div className="flex gap-3 items-center justify-between">
        {totalReturns > 0 && (
          <div className="glass-panel rounded-2xl px-5 py-2 border border-orange-500/20 bg-orange-500/5 text-sm">
            إجمالي المرتجعات: <span className="text-orange-400 font-black">{formatCurrency(totalReturns)}</span>
          </div>
        )}
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary px-5 py-2 text-sm flex items-center gap-2 mr-auto">
          <Plus className="w-4 h-4" /> مرتجع جديد
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
          <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">مرتجع مبيعات جديد</h3>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X className="w-4 h-4 text-white/70" /></button>
            </div>

            {/* نوع الاسترداد */}
            <div>
              <label className="text-white/60 text-xs mb-2 block">نوع الاسترداد *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, refund_type: "credit", safe_id: "" }))}
                  className={`py-2.5 px-3 rounded-xl text-sm font-bold border transition-all ${form.refund_type === "credit" ? "bg-blue-500/30 border-blue-500/60 text-blue-300" : "bg-white/5 border-white/10 text-white/50"}`}>
                  خصم من رصيد العميل
                </button>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, refund_type: "cash" }))}
                  className={`py-2.5 px-3 rounded-xl text-sm font-bold border transition-all ${form.refund_type === "cash" ? "bg-emerald-500/30 border-emerald-500/60 text-emerald-300" : "bg-white/5 border-white/10 text-white/50"}`}>
                  استرداد نقدي
                </button>
              </div>
              <p className="text-xs text-white/40 mt-1.5">
                {form.refund_type === "credit"
                  ? "يُخصم من رصيد العميل — مناسب لفواتير الآجل"
                  : "تُصرف فلوس من الخزينة للعميل — مناسب لفواتير النقدي"}
              </p>
            </div>

            {/* عميل */}
            <div>
              <label className="text-white/60 text-xs mb-1 block">العميل</label>
              <select className="glass-input w-full appearance-none" value={form.customer_id}
                onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                <option value="" className="bg-gray-900">-- عميل غير مسجل / نقدي --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id} className="bg-gray-900">
                    {c.name}{Number(c.balance) > 0 ? ` — دين: ${Number(c.balance).toFixed(0)} ج.م` : Number(c.balance) < 0 ? ` — له: ${Math.abs(Number(c.balance)).toFixed(0)} ج.م` : ''}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <p className={`text-xs mt-1 ${Number(selectedCustomer.balance) > 0 ? 'text-amber-400' : Number(selectedCustomer.balance) < 0 ? 'text-orange-400' : 'text-white/40'}`}>
                  رصيده الحالي: {Number(selectedCustomer.balance) < 0 ? `علينا له ${formatCurrency(Math.abs(Number(selectedCustomer.balance)))}` : formatCurrency(Number(selectedCustomer.balance))}
                  {form.refund_type === "credit" && ` ← بعد المرتجع: ${formatCurrency(Number(selectedCustomer.balance) - itemTotal)}`}
                </p>
              )}
            </div>

            {/* خزينة الاسترداد النقدي */}
            {form.refund_type === "cash" && (
              <div>
                <label className="text-white/60 text-xs mb-1 block">الخزينة الصارفة *</label>
                <select required className="glass-input w-full appearance-none" value={form.safe_id}
                  onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
                  <option value="" className="bg-gray-900">-- اختر خزينة --</option>
                  {safes.map(s => <option key={s.id} value={s.id} className="bg-gray-900">{s.name} ({formatCurrency(Number(s.balance))})</option>)}
                </select>
              </div>
            )}

            {/* الصنف */}
            <div>
              <label className="text-white/60 text-xs mb-1 block">الصنف المرتجع *</label>
              <select required className="glass-input w-full appearance-none" value={form.item_id} onChange={e => {
                const prod = products.find(p => String(p.id) === e.target.value);
                setForm(f => ({ ...f, item_id: e.target.value, unit_price: prod ? String(prod.sale_price) : "" }));
              }}>
                <option value="" className="bg-gray-900">-- اختر صنف --</option>
                {products.map(p => <option key={p.id} value={p.id} className="bg-gray-900">{p.name} (مخزون: {Number(p.quantity)})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/60 text-xs mb-1 block">الكمية</label>
                <input type="number" min="1" className="glass-input" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1 block">سعر الوحدة</label>
                <input type="number" step="0.01" min="0" className="glass-input" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
              </div>
            </div>

            {form.item_id && form.unit_price && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2 flex justify-between">
                <span className="text-white/60 text-sm">إجمالي المرتجع</span>
                <span className="text-orange-400 font-bold">{formatCurrency(itemTotal)}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/60 text-xs mb-1 block">التاريخ</label>
                <input type="date" className="glass-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1 block">سبب الإرجاع</label>
                <input type="text" className="glass-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="عيب مصنعي..." />
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={createMutation.isPending} className="flex-1 btn-primary py-3">{createMutation.isPending ? "جاري الحفظ..." : "تسجيل المرتجع"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/60">رقم المرتجع</th>
                <th className="p-4 text-white/60">العميل</th>
                <th className="p-4 text-white/60">الإجمالي</th>
                <th className="p-4 text-white/60">نوع الاسترداد</th>
                <th className="p-4 text-white/60">السبب</th>
                <th className="p-4 text-white/60">التاريخ</th>
                <th className="p-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton cols={7} rows={5} />
              ) : returns_.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-white/40">لا توجد مرتجعات</td></tr>
              ) : returns_.map(r => (
                <tr key={r.id} className="border-b border-white/5 erp-table-row">
                  <td className="p-4 font-bold text-amber-400 font-mono">{r.return_no}</td>
                  <td className="p-4 text-white">{r.customer_name || "عميل نقدي"}</td>
                  <td className="p-4 font-bold text-orange-400">{formatCurrency(r.total_amount)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${r.refund_type === "cash" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}`}>
                      {r.refund_type === "cash" ? `نقدي — ${r.safe_name || ""}` : "خصم رصيد"}
                    </span>
                  </td>
                  <td className="p-4 text-white/50">{r.reason || "—"}</td>
                  <td className="p-4 text-white/40 text-xs">{r.date || formatDate(r.created_at)}</td>
                  <td className="p-4"><button onClick={() => setConfirmDeleteId(r.id)} className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface CartItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    unpaid: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = { paid: "مدفوع", partial: "جزئي", unpaid: "غير مدفوع" };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${map[status] || map.unpaid}`}>
      {labels[status] || status}
    </span>
  );
}

function PaymentBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    cash: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    credit: "bg-red-500/20 text-red-400 border-red-500/30",
    partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  const labels: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${map[type] || ''}`}>
      {labels[type] || type}
    </span>
  );
}

function SaleDetailModal({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const { data: sale, isLoading } = useGetSaleById(saleId);

  const handlePrint = () => {
    if (!sale) return;
    const payLabel: Record<string, string> = { cash: 'نقدي', credit: 'آجل', partial: 'جزئي' };
    const s = sale as any;
    const itemsHtml = (sale.items || []).map((item, i) =>
      `<tr><td>${i+1}</td><td><strong>${item.product_name}</strong></td><td>${item.quantity}</td><td>${Number(item.unit_price).toFixed(2)} ج.م</td><td><strong>${Number(item.total_price).toFixed(2)} ج.م</strong></td></tr>`
    ).join("");
    const discountHtml = Number(s.discount_amount) > 0 ? `
      <div class="total-row"><span>الإجمالي قبل الخصم</span><span>${(Number(sale.total_amount) + Number(s.discount_amount)).toFixed(2)} ج.م</span></div>
      <div class="total-row"><span>الخصم (${s.discount_percent}%)</span><span>- ${Number(s.discount_amount).toFixed(2)} ج.م</span></div>` : "";
    const remainHtml = Number(sale.remaining_amount) > 0 ?
      `<div class="total-row" style="color:red"><span>المتبقي</span><span><strong>${Number(sale.remaining_amount).toFixed(2)} ج.م</strong></span></div>` : "";
    const extraMeta = [
      s.warehouse_name ? `<div class="meta-item"><span class="meta-label">المخزن:</span><span class="meta-value">${s.warehouse_name}</span></div>` : "",
      s.salesperson_name ? `<div class="meta-item"><span class="meta-label">المندوب:</span><span class="meta-value">${s.salesperson_name}</span></div>` : "",
    ].join("");
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"/><title>فاتورة ${sale.invoice_no}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;background:#fff;padding:24px;direction:rtl}
  .header{text-align:center;border-bottom:3px double #333;padding-bottom:14px;margin-bottom:16px}
  .company-name{font-size:28px;font-weight:900;letter-spacing:2px}
  .company-slogan{font-size:13px;color:#666;margin:4px 0}
  .company-info{font-size:12px;color:#555;margin-top:6px}
  .invoice-title{text-align:center;font-size:19px;font-weight:bold;margin:14px 0;background:#f3f3f3;padding:9px;border-radius:6px}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:16px;font-size:13px}
  .meta-item{display:flex;gap:6px}
  .meta-label{color:#777;font-weight:600;min-width:80px}
  .meta-value{font-weight:bold;color:#111}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px}
  thead{background:#222;color:#fff}
  th,td{padding:9px 10px;text-align:right}
  td{border-bottom:1px solid #e8e8e8}
  tbody tr:nth-child(even){background:#f7f7f7}
  .totals{border:2px solid #333;border-radius:6px;padding:12px 16px;font-size:13px}
  .total-row{display:flex;justify-content:space-between;padding:4px 0}
  .total-final{font-size:18px;font-weight:900;border-top:2px solid #333;padding-top:8px;margin-top:6px}
  .footer{text-align:center;margin-top:24px;font-size:12px;color:#999;border-top:1px dashed #ccc;padding-top:12px}
  @media print{body{padding:10px}}
</style></head>
<body>
<div class="header">
  <div class="company-name">Halal Tech — حلال تك</div>
  <div class="company-slogan">الحلال = البركة | متخصصون في صيانة الهواتف المحمولة</div>
  <div class="company-info">📍 مصر — القاهرة &nbsp;&nbsp; 📞 01000000000</div>
</div>
<div class="invoice-title">فاتورة مبيعات — ${sale.invoice_no}</div>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">رقم الفاتورة:</span><span class="meta-value">${sale.invoice_no}</span></div>
  <div class="meta-item"><span class="meta-label">التاريخ:</span><span class="meta-value">${formatDate(sale.created_at)}</span></div>
  <div class="meta-item"><span class="meta-label">العميل:</span><span class="meta-value">${sale.customer_name || 'عميل نقدي'}</span></div>
  <div class="meta-item"><span class="meta-label">طريقة الدفع:</span><span class="meta-value">${payLabel[sale.payment_type] || sale.payment_type}</span></div>
  ${extraMeta}
</div>
<table>
  <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div class="totals">
  ${discountHtml}
  <div class="total-row total-final"><span>الإجمالي الكلي</span><span>${Number(sale.total_amount).toFixed(2)} ج.م</span></div>
  <div class="total-row"><span>المدفوع</span><span>${Number(sale.paid_amount).toFixed(2)} ج.م</span></div>
  ${remainHtml}
</div>
<div class="footer">شكراً لتعاملكم معنا — Halal Tech | الحلال = البركة</div>
</body></html>`;
    const w = window.open("", "_blank", "width=820,height=950");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm modal-overlay">
      <div className="glass-panel rounded-3xl p-8 w-full max-w-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-amber-400" /> تفاصيل الفاتورة
          </h3>
          <div className="flex gap-2">
            <button onClick={handlePrint} disabled={isLoading || !sale} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 text-amber-300 transition-colors text-sm font-bold">
              <Printer className="w-4 h-4" /> طباعة
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-3 p-8">{Array.from({length:4}).map((_,i)=><div key={i} className="skeleton-shimmer h-8 rounded-xl"/>)}</div>
        ) : !sale ? (
          <div className="text-center py-12 text-white/40">لم يتم العثور على الفاتورة</div>
        ) : (
          <>
            {/* Screen view */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div><p className="text-white/50 text-sm">رقم الفاتورة</p><p className="text-amber-400 font-bold text-lg">{sale.invoice_no}</p></div>
                <div><p className="text-white/50 text-sm">التاريخ</p><p className="text-white">{formatDate(sale.created_at)}</p></div>
                <div><p className="text-white/50 text-sm">العميل</p><p className="text-white font-semibold">{sale.customer_name || 'عميل نقدي'}</p></div>
                <div><p className="text-white/50 text-sm">طريقة الدفع</p><PaymentBadge type={sale.payment_type} /></div>
                {(sale as any).warehouse_name && <div><p className="text-white/50 text-sm">المخزن</p><p className="text-white">{(sale as any).warehouse_name}</p></div>}
                {(sale as any).salesperson_name && <div><p className="text-white/50 text-sm">المندوب</p><p className="text-amber-300 font-semibold">{(sale as any).salesperson_name}</p></div>}
              </div>
              <div>
                <h4 className="text-white font-bold mb-3">أصناف الفاتورة</h4>
                <div className="rounded-2xl overflow-hidden border border-white/10">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="p-3 text-white/60">الصنف</th>
                        <th className="p-3 text-white/60">الكمية</th>
                        <th className="p-3 text-white/60">سعر الوحدة</th>
                        <th className="p-3 text-white/60">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sale.items || []).map((item, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td className="p-3 font-bold text-white">{item.product_name}</td>
                          <td className="p-3 text-white/70">{item.quantity}</td>
                          <td className="p-3 text-white/70">{formatCurrency(item.unit_price)}</td>
                          <td className="p-3 font-bold text-emerald-400">{formatCurrency(item.total_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                {(sale as any).discount_amount > 0 && <>
                  <div className="flex justify-between"><span className="text-white/60">الإجمالي قبل الخصم</span><span className="text-white">{formatCurrency(sale.total_amount + (sale as any).discount_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-white/60">الخصم ({(sale as any).discount_percent}%)</span><span className="text-red-400">- {formatCurrency((sale as any).discount_amount)}</span></div>
                </>}
                <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/60">الإجمالي</span><span className="font-bold text-white text-lg">{formatCurrency(sale.total_amount)}</span></div>
                <div className="flex justify-between"><span className="text-white/60">المدفوع</span><span className="font-bold text-emerald-400">{formatCurrency(sale.paid_amount)}</span></div>
                {sale.remaining_amount > 0 && (
                  <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/60">المتبقي</span><span className="font-bold text-red-400 text-lg">{formatCurrency(sale.remaining_amount)}</span></div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/60">الحالة</span><StatusBadge status={sale.status} /></div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface SuccessInvoice {
  invoice_no: string;
  total_amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  payment_type: string;
  items: CartItem[];
}

function WhatsAppSuccessModal({ invoice, onClose }: { invoice: SuccessInvoice; onClose: () => void }) {
  const paymentLabel: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };

  const buildWhatsAppMsg = () => {
    const lines = [
      `🧾 *فاتورة مبيعات - Halal Tech*`,
      `رقم الفاتورة: ${invoice.invoice_no}`,
      ``,
      `*الأصناف:*`,
      ...invoice.items.map(i => `• ${i.product_name} × ${i.quantity} = ${i.total_price.toFixed(2)} ج.م`),
      ``,
      `*الإجمالي: ${invoice.total_amount.toFixed(2)} ج.م*`,
      `طريقة الدفع: ${paymentLabel[invoice.payment_type] || invoice.payment_type}`,
      ``,
      `شكراً لتعاملكم معنا 🙏`,
    ];
    return encodeURIComponent(lines.join("\n"));
  };

  const phoneRaw = invoice.customer_phone?.replace(/\D/g, "") ?? "";
  const phone = phoneRaw.startsWith("0") ? "2" + phoneRaw : phoneRaw.startsWith("2") ? phoneRaw : "2" + phoneRaw;
  const waUrl = `https://wa.me/${phone}?text=${buildWhatsAppMsg()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-3xl p-8 w-full max-w-sm border border-emerald-500/30 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
          <Receipt className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">تم إصدار الفاتورة</h3>
          <p className="text-amber-400 font-bold text-lg mt-1">{invoice.invoice_no}</p>
          <p className="text-white/50 text-sm mt-1">الإجمالي: <span className="text-white font-bold">{formatCurrency(invoice.total_amount)}</span></p>
          {invoice.customer_name && <p className="text-white/50 text-sm">العميل: <span className="text-white">{invoice.customer_name}</span></p>}
        </div>
        <div className="space-y-3">
          {invoice.customer_phone && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-3 rounded-2xl bg-[#25D366]/20 border border-[#25D366]/40 text-[#25D366] font-bold hover:bg-[#25D366]/30 transition-all">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              إرسال الفاتورة عبر واتساب
            </a>
          )}
          <button onClick={onClose} className="w-full btn-secondary py-3">إغلاق</button>
        </div>
      </div>
    </div>
  );
}

function NewSalePanel({ onDone }: { onDone: () => void }) {
  const { user: currentUser } = useAuth();
  const { data: products = [] } = useGetProducts();
  const { data: customers = [] } = useGetCustomers();
  const { data: safes = [] } = useGetSettingsSafes();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: warehouses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/warehouses"],
    queryFn: () => fetch(api("/api/settings/warehouses")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [safeId, setSafeId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [discountPct, setDiscountPct] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // اختيار المخزن رقم 1 تلقائياً عند التحميل
  useEffect(() => {
    if (warehouses.length > 0 && !warehouseId) {
      setWarehouseId(String(warehouses[0].id));
    }
  }, [warehouses, warehouseId]);

  // المندوب هو المستخدم الحالي تلقائياً
  const salespersonId = currentUser ? String(currentUser.id) : "";
  const salespersonName = currentUser?.name ?? "—";
  const [successInvoice, setSuccessInvoice] = useState<SuccessInvoice | null>(null);

  const checkoutMutation = useMutation({
    mutationFn: (data: object) => fetch(api("/api/sales"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "خطأ في التسجيل"); return j; }),
    onSuccess: (data) => {
      const selectedCustomer = customers.find(c => c.id === parseInt(customerId));
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
      setSuccessInvoice({
        invoice_no: data.invoice_no,
        total_amount: data.total_amount,
        customer_name: selectedCustomer?.name ?? null,
        customer_phone: selectedCustomer?.phone ?? null,
        payment_type: paymentType,
        items: [...cart],
      });
      setCart([]); setPaidAmount(""); setCustomerId(""); setSafeId("");
      setDiscountPct(""); setPaymentType("cash");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchCat = !categoryFilter || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const cartSubtotal = useMemo(() => cart.reduce((s, i) => s + i.total_price, 0), [cart]);
  const discountAmount = useMemo(() => cartSubtotal * (parseFloat(discountPct) || 0) / 100, [cartSubtotal, discountPct]);
  const cartTotal = useMemo(() => cartSubtotal - discountAmount, [cartSubtotal, discountAmount]);

  const addToCart = (product: typeof products[0]) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price } : i);
      return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.sale_price, total_price: product.sale_price }];
    });
  };

  const updateQty = (pid: number, delta: number) => setCart(prev => prev.map(i => {
    if (i.product_id !== pid) return i;
    const newQ = Math.max(1, i.quantity + delta);
    return { ...i, quantity: newQ, total_price: newQ * i.unit_price };
  }));

  const selectedCustomer = customers.find(c => c.id === parseInt(customerId));

  const handleCheckout = () => {
    if (cart.length === 0) { toast({ title: "السلة فارغة", variant: "destructive" }); return; }
    if ((paymentType === "credit" || paymentType === "partial") && !customerId) {
      toast({ title: "يجب اختيار عميل للآجل أو الجزئي", variant: "destructive" }); return;
    }
    const actualPaid = paymentType === "cash" ? cartTotal : paymentType === "credit" ? 0 : parseFloat(paidAmount) || 0;

    checkoutMutation.mutate({
      payment_type: paymentType,
      total_amount: cartTotal,
      paid_amount: actualPaid,
      customer_id: selectedCustomer?.id ?? null,
      customer_name: selectedCustomer?.name ?? null,
      safe_id: safeId ? parseInt(safeId) : null,
      warehouse_id: warehouseId ? parseInt(warehouseId) : null,
      salesperson_id: salespersonId ? parseInt(salespersonId) : null,
      discount_percent: parseFloat(discountPct) || 0,
      discount_amount: discountAmount,
      items: cart,
    });
  };

  const selectRow = (label: string, icon: React.ReactNode, children: React.ReactNode) => (
    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
      <span className="text-white/40 shrink-0">{icon}</span>
      <span className="text-white/40 text-xs w-14 shrink-0">{label}</span>
      {children}
    </div>
  );

  return (
    <>
      {successInvoice && (
        <WhatsAppSuccessModal invoice={successInvoice} onClose={() => { setSuccessInvoice(null); onDone(); }} />
      )}

      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-220px)]">
        {/* Products grid */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="glass-panel rounded-2xl p-3 mb-3 shrink-0 flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Search className="w-4 h-4 text-white/40 shrink-0" />
              <input type="text" placeholder="ابحث عن منتج..." className="bg-transparent text-white outline-none text-sm w-full placeholder:text-white/30" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="bg-black/30 text-white/70 border border-white/10 rounded-xl px-3 py-1.5 text-sm outline-none appearance-none" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">كل الأصناف</option>
              {categories.map(cat => <option key={cat} value={cat!} className="bg-gray-900">{cat}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto glass-panel rounded-2xl p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <button key={product.id} onClick={() => addToCart(product)} disabled={product.quantity <= 0}
                  className={`glass-panel rounded-2xl p-3 text-right transition-all hover:-translate-y-0.5 ${product.quantity <= 0 ? 'opacity-40 cursor-not-allowed' : 'hover:border-amber-500/40'}`}>
                  <div className="h-14 bg-white/5 rounded-xl mb-3 flex items-center justify-center border border-white/5">
                    <Package className="w-6 h-6 text-white/30" />
                  </div>
                  <p className="font-bold text-white text-sm truncate">{product.name}</p>
                  {product.category && <p className="text-xs text-amber-400/70 mt-0.5">{product.category}</p>}
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-emerald-400 font-bold text-sm">{formatCurrency(product.sale_price)}</span>
                    <span className="text-xs text-white/40">{product.quantity}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cart panel */}
        <div className="w-full lg:w-[400px] flex flex-col glass-panel rounded-2xl overflow-hidden shrink-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 bg-white/5">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-white flex items-center gap-2 text-base">
                <ShoppingCart className="w-5 h-5 text-amber-400" /> فاتورة مبيعات
              </h3>
              <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-xs font-bold">{cart.length} صنف</span>
            </div>
            {/* حقول الفاتورة الرئيسية */}
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {selectRow("المخزن", <Vault className="w-3.5 h-3.5" />,
                <select className="bg-transparent text-white outline-none w-full appearance-none text-xs" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  <option value="" className="bg-slate-900">-- مخزن --</option>
                  {warehouses.map(w => <option key={w.id} value={w.id} className="bg-slate-900">{w.name}</option>)}
                </select>
              )}
              <div className="flex items-center gap-2 bg-white/5 border border-amber-500/20 rounded-xl px-3 py-2">
                <span className="text-amber-400/60 shrink-0"><Lock className="w-3.5 h-3.5" /></span>
                <span className="text-white/40 text-xs w-14 shrink-0">المندوب</span>
                <span className="text-amber-300 text-xs font-bold truncate">{salespersonName}</span>
              </div>
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-white/20 gap-3 py-10">
                <ShoppingCart className="w-12 h-12 opacity-30" />
                <p className="text-sm">اضغط على منتج لإضافته</p>
              </div>
            ) : cart.map(item => (
              <div key={item.product_id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-bold text-white text-sm flex-1 ml-2 truncate">{item.product_name}</p>
                  <button onClick={() => setCart(prev => prev.filter(i => i.product_id !== item.product_id))} className="text-red-400/70 hover:text-red-400 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateQty(item.product_id, -1)} className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"><Minus className="w-3 h-3 text-white" /></button>
                    <span className="text-white font-bold text-sm w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.product_id, 1)} className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"><Plus className="w-3 h-3 text-white" /></button>
                    <span className="text-white/40 text-xs mr-1">× {formatCurrency(item.unit_price)}</span>
                  </div>
                  <span className="font-bold text-emerald-400 text-sm">{formatCurrency(item.total_price)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer: بيانات الدفع */}
          <div className="p-3 border-t border-white/10 bg-black/40 space-y-2">
            {/* العميل والخزينة */}
            <div className="grid grid-cols-1 gap-1.5">
              {selectRow("العميل", <User className="w-3.5 h-3.5" />,
                <select className="bg-transparent text-white outline-none w-full appearance-none text-xs" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="" className="bg-slate-900">عميل نقدي</option>
                  {customers.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}{Number(c.balance) > 0 ? ` (دين: ${Number(c.balance).toFixed(0)} ج.م)` : ''}</option>)}
                </select>
              )}
              {selectedCustomer?.phone && (
                <div className="text-xs text-[#25D366] flex items-center gap-1 px-2">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  {selectedCustomer.phone} — سيُرسل الفاتورة للواتساب بعد التسجيل
                </div>
              )}
              {selectRow("الخزينة", <Vault className="w-3.5 h-3.5 text-amber-400/70" />,
                <select className="bg-transparent text-white outline-none w-full appearance-none text-xs" value={safeId} onChange={e => setSafeId(e.target.value)}>
                  <option value="" className="bg-slate-900">-- اختر الخزينة --</option>
                  {safes.map(s => <option key={s.id} value={s.id} className="bg-slate-900">{s.name} ({formatCurrency(Number(s.balance))})</option>)}
                </select>
              )}
            </div>

            {/* طريقة الدفع والخصم */}
            <div className="flex gap-1.5 items-center">
              <div className="flex gap-1 flex-1">
                {[{ v: "cash", l: "نقدي" }, { v: "credit", l: "آجل" }, { v: "partial", l: "جزئي" }].map(opt => (
                  <button key={opt.v} onClick={() => setPaymentType(opt.v as "cash" | "credit" | "partial")}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${paymentType === opt.v ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                    {opt.l}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 w-24">
                <Percent className="w-3 h-3 text-white/30 shrink-0" />
                <input type="number" min="0" max="100" step="1" placeholder="خصم" className="bg-transparent text-white outline-none w-full text-xs placeholder:text-white/20" value={discountPct} onChange={e => setDiscountPct(e.target.value)} />
              </div>
            </div>

            {paymentType === "partial" && (
              <input type="number" step="0.01" placeholder="المبلغ المدفوع جزئياً..." className="glass-input text-xs py-2" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
            )}

            {/* ملخص الإجماليات */}
            <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">قبل الخصم ({discountPct}%)</span>
                  <span className="text-white/60 line-through">{formatCurrency(cartSubtotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-white/70 text-sm font-semibold">الإجمالي</span>
                <span className="font-black text-white text-lg">{formatCurrency(cartTotal)}</span>
              </div>
              {paymentType === "partial" && paidAmount && (
                <>
                  <div className="flex justify-between text-xs border-t border-white/10 pt-1"><span className="text-white/60">المدفوع</span><span className="text-emerald-400 font-bold">{formatCurrency(parseFloat(paidAmount) || 0)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-white/60">المتبقي</span><span className="text-red-400 font-bold">{formatCurrency(cartTotal - (parseFloat(paidAmount) || 0))}</span></div>
                </>
              )}
              {paymentType === "credit" && customerId && <p className="text-xs text-yellow-400 pt-1">⚠ سيُضاف على دَين العميل</p>}
            </div>

            <button onClick={handleCheckout} disabled={checkoutMutation.isPending || cart.length === 0}
              className="w-full btn-primary py-3 text-sm disabled:opacity-50 font-bold">
              {checkoutMutation.isPending ? "جاري التسجيل..." : "✦ إصدار الفاتورة"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Sales() {
  const [tab, setTab] = useState<"new" | "returns">("new");
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
          <button onClick={() => setTab("new")} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === "new" ? "bg-amber-500 text-black shadow" : "text-white/50 hover:text-white"}`}>
            ➕ فاتورة بيع جديدة
          </button>
          <button onClick={() => setTab("returns")} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === "returns" ? "bg-orange-500 text-white shadow" : "text-white/50 hover:text-white"}`}>
            ↩ المرتجعات
          </button>
        </div>
      </div>

      {selectedSaleId && <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />}

      {tab === "returns" ? <SalesReturnsPanel /> : <NewSalePanel onDone={() => {}} />}
    </div>
  );
}
