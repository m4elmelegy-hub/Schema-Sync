import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  Package, AlertTriangle, TrendingDown, TrendingUp,
  Search, X, RefreshCw, ChevronDown, ChevronUp, Edit3, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface AuditProduct {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  actual_qty: number;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number | null;
  opening_qty: number;
  purchased_qty: number;
  sold_qty: number;
  sale_return_qty: number;
  purchase_return_qty: number;
  adjustment_qty: number;
  calculated_qty: number;
  discrepancy: number;
  total_value: number;
}

interface AuditSummary {
  total_products: number;
  total_inventory_value: number;
  low_stock_count: number;
  zero_stock_count: number;
}

interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost: number;
  reference_type: string | null;
  reference_id: number | null;
  reference_no: string | null;
  notes: string | null;
  date: string | null;
  created_at: string;
}

interface ProductDetail {
  product: { id: number; name: string; sku: string | null; quantity: number; cost_price: number; sale_price: number };
  movements: StockMovement[];
  calculated_qty: number;
  actual_qty: number;
  discrepancy: number;
  breakdown: Record<string, number>;
  formula: string;
}

const movementTypeLabel: Record<string, { label: string; color: string; sign: "+" | "-" | "±" }> = {
  opening_balance:  { label: "رصيد افتتاحي",     color: "bg-blue-500/20 text-blue-300",     sign: "+" },
  purchase:         { label: "مشتريات",            color: "bg-emerald-500/20 text-emerald-300", sign: "+" },
  sale:             { label: "مبيعات",             color: "bg-red-500/20 text-red-300",        sign: "-" },
  sale_return:      { label: "مرتجع مبيعات",       color: "bg-teal-500/20 text-teal-300",      sign: "+" },
  purchase_return:  { label: "مرتجع مشتريات",      color: "bg-orange-500/20 text-orange-300",  sign: "-" },
  adjustment:       { label: "تسوية يدوية",        color: "bg-violet-500/20 text-violet-300",  sign: "±" },
};

export default function Inventory() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<keyof AuditProduct>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAdjust, setShowAdjust] = useState<number | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  const { data: auditData, isLoading, refetch } = useQuery<{ products: AuditProduct[]; summary: AuditSummary }>({
    queryKey: ["inventory-audit"],
    queryFn: () => authFetch(api("/api/inventory/audit")).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  const { data: productDetail } = useQuery<ProductDetail>({
    queryKey: ["inventory-product", selectedProduct],
    queryFn: () => authFetch(api(`/api/inventory/product/${selectedProduct}`)).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
    enabled: selectedProduct !== null,
  });

  const adjustMutation = useMutation({
    mutationFn: ({ product_id, new_quantity, notes }: { product_id: number; new_quantity: number; notes: string }) =>
      authFetch(api("/api/inventory/adjustment"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id, new_quantity, notes }),
      }).then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-audit"] });
      qc.invalidateQueries({ queryKey: ["inventory-product"] });
      setShowAdjust(null);
      setAdjustQty("");
      setAdjustNotes("");
      toast({ title: "تم تعديل المخزون بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء تعديل المخزون", variant: "destructive" });
    },
  });

  const products = auditData?.products ?? [];
  const summary = auditData?.summary;

  const filtered = products
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string")
        return sortAsc ? va.localeCompare(vb, "ar") : vb.localeCompare(va, "ar");
      return sortAsc ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });

  function toggleSort(key: keyof AuditProduct) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const SortIcon = ({ k }: { k: keyof AuditProduct }) => sortKey === k
    ? (sortAsc ? <ChevronUp className="w-3 h-3 inline ms-1" /> : <ChevronDown className="w-3 h-3 inline ms-1" />)
    : null;

  return (
    <div className="p-6 space-y-6 text-right" dir="rtl">
      {/* ── رأس الصفحة ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">مراجعة المخزون</h1>
          <p className="text-white/50 text-sm mt-1">تتبع كامل لحركات المخزون — وارد ، صادر ، مرتجعات</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      {/* ── بطاقات الملخص ──────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">إجمالي المنتجات</div>
            <div className="text-2xl font-bold text-white">{summary.total_products}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">قيمة المخزون الكلية</div>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(summary.total_inventory_value)}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">تحت حد الطلب</div>
            <div className={`text-2xl font-bold ${summary.low_stock_count > 0 ? "text-amber-400" : "text-white/40"}`}>
              {summary.low_stock_count}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-white/50 text-xs mb-1">نفد المخزون</div>
            <div className={`text-2xl font-bold ${summary.zero_stock_count > 0 ? "text-red-400" : "text-white/40"}`}>
              {summary.zero_stock_count}
            </div>
          </div>
        </div>
      )}

      {/* ── مفتاح الألوان ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-300">↑ رصيد افتتاحي</span>
        <span className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300">↑ مشتريات</span>
        <span className="px-2 py-1 rounded-lg bg-teal-500/20 text-teal-300">↑ مرتجع مبيعات</span>
        <span className="px-2 py-1 rounded-lg bg-red-500/20 text-red-300">↓ مبيعات</span>
        <span className="px-2 py-1 rounded-lg bg-orange-500/20 text-orange-300">↓ مرتجع مشتريات</span>
        <span className="px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300">± تسوية</span>
      </div>

      {/* ── بحث ───────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث عن منتج..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 pe-10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── جدول المخزون ──────────────────────────────────── */}
      {isLoading ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm min-w-[1100px]"><tbody><TableSkeleton cols={13} rows={7} /></tbody></table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {[
                  { key: "name" as const, label: "المنتج" },
                  { key: "opening_qty" as const, label: "افتتاحي" },
                  { key: "purchased_qty" as const, label: "وارد مشتريات" },
                  { key: "sale_return_qty" as const, label: "مرتجع مبيعات" },
                  { key: "sold_qty" as const, label: "صادر مبيعات" },
                  { key: "purchase_return_qty" as const, label: "مرتجع مشتريات" },
                  { key: "calculated_qty" as const, label: "محسوب" },
                  { key: "actual_qty" as const, label: "فعلي" },
                  { key: "discrepancy" as const, label: "فرق" },
                  { key: "cost_price" as const, label: "تكلفة" },
                  { key: "total_value" as const, label: "قيمة المخزون" },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="p-3 text-right text-white/60 font-medium cursor-pointer hover:text-white/90 select-none whitespace-nowrap"
                  >
                    {col.label}<SortIcon k={col.key} />
                  </th>
                ))}
                <th className="p-3 text-right text-white/60 font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isLow = p.low_stock_threshold !== null && p.actual_qty <= p.low_stock_threshold;
                const isZero = p.actual_qty <= 0;
                const hasDisc = Math.abs(p.discrepancy) > 0.001;
                return (
                  <tr key={p.id} className="border-b border-white/5 erp-table-row">
                    {/* المنتج */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {isZero ? <TrendingDown className="w-4 h-4 text-red-400 shrink-0" /> :
                          isLow ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> :
                          <Package className="w-4 h-4 text-white/30 shrink-0" />}
                        <div>
                          <div className="text-white font-medium">{p.name}</div>
                          {p.sku && <div className="text-white/40 text-xs">{p.sku}</div>}
                          {p.category && <div className="text-white/30 text-xs">{p.category}</div>}
                        </div>
                      </div>
                    </td>
                    {/* افتتاحي */}
                    <td className="p-3 text-blue-300 font-mono">{p.opening_qty > 0 ? `+${p.opening_qty}` : "—"}</td>
                    {/* وارد مشتريات */}
                    <td className="p-3 text-emerald-400 font-mono">{p.purchased_qty > 0 ? `+${p.purchased_qty}` : "—"}</td>
                    {/* مرتجع مبيعات */}
                    <td className="p-3 text-teal-300 font-mono">{p.sale_return_qty > 0 ? `+${p.sale_return_qty}` : "—"}</td>
                    {/* صادر مبيعات */}
                    <td className="p-3 text-red-400 font-mono">{p.sold_qty > 0 ? `-${p.sold_qty}` : "—"}</td>
                    {/* مرتجع مشتريات */}
                    <td className="p-3 text-orange-300 font-mono">{p.purchase_return_qty > 0 ? `-${p.purchase_return_qty}` : "—"}</td>
                    {/* محسوب */}
                    <td className="p-3 font-bold text-white font-mono">{p.calculated_qty.toFixed(2)}</td>
                    {/* فعلي */}
                    <td className="p-3 font-bold font-mono">
                      <span className={isZero ? "text-red-400" : isLow ? "text-amber-400" : "text-emerald-400"}>
                        {p.actual_qty.toFixed(2)}
                      </span>
                    </td>
                    {/* فرق */}
                    <td className="p-3 font-mono">
                      {hasDisc ? (
                        <span className="text-red-400 font-bold">{p.discrepancy > 0 ? `+${p.discrepancy.toFixed(2)}` : p.discrepancy.toFixed(2)}</span>
                      ) : (
                        <span className="text-emerald-400">✓</span>
                      )}
                    </td>
                    {/* تكلفة */}
                    <td className="p-3 text-white/70">{formatCurrency(p.cost_price)}</td>
                    {/* قيمة */}
                    <td className="p-3 text-white font-bold">{formatCurrency(p.total_value)}</td>
                    {/* إجراء */}
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSelectedProduct(p.id)}
                          className="px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors whitespace-nowrap"
                        >
                          الحركات
                        </button>
                        <button
                          onClick={() => { setShowAdjust(p.id); setAdjustQty(String(p.actual_qty)); setAdjustNotes(""); }}
                          className="px-2 py-1 text-xs bg-violet-500/20 text-violet-300 rounded-lg hover:bg-violet-500/30 transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center text-white/40 py-12">لا توجد منتجات</td>
                </tr>
              )}
            </tbody>
            {/* مجاميع */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/20 bg-white/5">
                  <td className="p-3 text-white/60 font-bold" colSpan={10}>المجموع</td>
                  <td className="p-3 text-white font-bold">
                    {formatCurrency(filtered.reduce((s, p) => s + p.total_value, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── مودال تفاصيل حركات منتج ──────────────────────── */}
      {selectedProduct && productDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-12 px-4"
          onClick={() => setSelectedProduct(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{productDetail.product.name}</h2>
                <p className="text-xs text-white/40 mt-1 font-mono">{productDetail.formula}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ملخص سريع */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/40">كمية محسوبة</div>
                <div className="text-xl font-bold text-white">{productDetail.calculated_qty.toFixed(2)}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/40">كمية فعلية</div>
                <div className={`text-xl font-bold ${productDetail.actual_qty <= 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {productDetail.actual_qty.toFixed(2)}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xs text-white/40">فرق</div>
                <div className={`text-xl font-bold ${Math.abs(productDetail.discrepancy) > 0.001 ? "text-red-400" : "text-emerald-400"}`}>
                  {Math.abs(productDetail.discrepancy) > 0.001 ? productDetail.discrepancy.toFixed(2) : "✓ صفر"}
                </div>
              </div>
            </div>

            {/* سجل الحركات */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white/60 mb-2">سجل الحركات ({productDetail.movements.length})</h3>
              {productDetail.movements.length === 0 && (
                <p className="text-white/30 text-sm text-center py-4">لا توجد حركات مسجّلة</p>
              )}
              {productDetail.movements.map(m => {
                const mt = movementTypeLabel[m.movement_type] ?? { label: m.movement_type, color: "bg-white/10 text-white/60", sign: "±" as const };
                const qtyNum = Number(m.quantity);
                const isIn = qtyNum > 0;
                return (
                  <div key={m.id} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                    <div className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-medium ${mt.color}`}>{mt.label}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`font-bold font-mono text-sm ${isIn ? "text-emerald-400" : "text-red-400"}`}>
                          {isIn ? "+" : ""}{qtyNum.toFixed(3)}
                        </span>
                        <span className="text-white/30 text-xs font-mono">
                          {m.quantity_before.toFixed(2)} → {m.quantity_after.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-white/50 text-xs mt-0.5 flex gap-3">
                        {m.reference_no && <span className="font-mono">{m.reference_no}</span>}
                        {m.date && <span>{m.date}</span>}
                        {m.notes && <span className="truncate">{m.notes}</span>}
                      </div>
                    </div>
                    <div className="text-white/30 text-xs shrink-0">
                      {formatCurrency(Number(m.unit_cost))}/وحدة
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── مودال التسوية اليدوية ─────────────────────────── */}
      {showAdjust !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4"
          onClick={() => setShowAdjust(null)}>
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">تسوية يدوية للمخزون</h2>
            {(() => {
              const p = products.find(x => x.id === showAdjust);
              return p ? (
                <>
                  <p className="text-white/60 text-sm mb-4">{p.name} — الكمية الحالية: <span className="text-white font-bold">{p.actual_qty}</span></p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">الكمية الجديدة</label>
                      <input
                        type="number"
                        value={adjustQty}
                        onChange={e => setAdjustQty(e.target.value)}
                        min="0"
                        step="0.001"
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">سبب التسوية</label>
                      <input
                        type="text"
                        value={adjustNotes}
                        onChange={e => setAdjustNotes(e.target.value)}
                        placeholder="مثال: جرد دوري، تالف..."
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                      />
                    </div>
                    {adjustQty !== "" && Number(adjustQty) !== p.actual_qty && (
                      <p className="text-xs text-white/50">
                        التغيير: {Number(adjustQty) > p.actual_qty
                          ? <span className="text-emerald-400">+{(Number(adjustQty) - p.actual_qty).toFixed(3)}</span>
                          : <span className="text-red-400">{(Number(adjustQty) - p.actual_qty).toFixed(3)}</span>}
                      </p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          if (!adjustQty) return;
                          adjustMutation.mutate({ product_id: showAdjust, new_quantity: Number(adjustQty), notes: adjustNotes || "تسوية يدوية" });
                        }}
                        disabled={adjustMutation.isPending || !adjustQty}
                        className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl py-2 transition-colors font-medium"
                      >
                        <Check className="w-4 h-4" />
                        {adjustMutation.isPending ? "جارٍ الحفظ..." : "حفظ التسوية"}
                      </button>
                      <button onClick={() => setShowAdjust(null)} className="px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">
                        إلغاء
                      </button>
                    </div>
                  </div>
                </>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
