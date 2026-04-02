import { useState, useMemo } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery } from "@tanstack/react-query";
import { useGetProducts } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  BarChart3, RefreshCw, Calendar, Info, Search, X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── أنواع البيانات ─── */
interface ProductProfit {
  product_id: number;
  product_name: string;
  qty_sold: number;
  revenue: number;
  cost: number;
  profit: number;
  profit_margin: number;
  avg_cost_price: number;
  avg_sale_price: number;
}

interface MonthProfit {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface ProfitsData {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  profit_margin: number;
  total_expenses: number;
  net_profit: number;
  invoice_count: number;
  item_count: number;
  by_product: ProductProfit[];
  by_month: MonthProfit[];
}

/* ─── صندوق الملخص المالي الرئيسي ─── */
function FinancialSummaryBox({ revenue, cogs, netProfit }: { revenue: number; cogs: number; netProfit: number }) {
  const isProfit = netProfit >= 0;
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="glass-panel rounded-2xl p-5 border border-emerald-500/40 bg-emerald-500/5 flex flex-col">
        <p className="text-emerald-400/80 text-xs font-semibold mb-2 uppercase tracking-wide">الإيرادات</p>
        <p className="text-emerald-400 font-black text-2xl leading-none" style={{ fontFeatureSettings: '"tnum"' }}>
          {formatCurrency(revenue)}
        </p>
      </div>
      <div className="glass-panel rounded-2xl p-5 border border-red-500/40 bg-red-500/5 flex flex-col">
        <p className="text-red-400/80 text-xs font-semibold mb-2 uppercase tracking-wide">تكلفة البضاعة</p>
        <p className="text-red-400 font-black text-2xl leading-none" style={{ fontFeatureSettings: '"tnum"' }}>
          {formatCurrency(cogs)}
        </p>
      </div>
      <div className={`glass-panel rounded-2xl p-5 border flex flex-col ${isProfit ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
        <p className={`text-xs font-semibold mb-2 uppercase tracking-wide ${isProfit ? "text-green-400/80" : "text-red-400/80"}`}>صافي الربح</p>
        <p className={`font-black text-2xl leading-none ${isProfit ? "text-green-400" : "text-red-400"}`} style={{ fontFeatureSettings: '"tnum"' }}>
          {formatCurrency(netProfit)}
        </p>
        <p className={`text-xs mt-2 font-bold ${isProfit ? "text-green-400/60" : "text-red-400/60"}`}>
          {isProfit ? "▲ ربح" : "▼ خسارة"}
        </p>
      </div>
    </div>
  );
}

/* ─── بطاقة ملخص ─── */
function SummaryCard({ label, value, sub, color, icon: Icon, hint }: {
  label: string; value: string; sub?: string;
  color: string; icon: React.ElementType; hint?: string;
}) {
  return (
    <div className={`glass-panel rounded-2xl p-5 border ${color} relative group`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-xl border ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        {hint && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-white/40 flex items-center gap-1 text-left">
            <Info className="w-3 h-3 shrink-0" /> {hint}
          </span>
        )}
      </div>
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className="text-white font-black text-xl">{value}</p>
      {sub && <p className="text-white/40 text-xs mt-1">{sub}</p>}
    </div>
  );
}

/* ─── شريط تقدم ─── */
function ProfitBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ─── الصفحة الرئيسية ─── */
export default function Profits() {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = today.slice(0, 7) + "-01";

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [sortBy, setSortBy] = useState<"profit" | "revenue" | "margin" | "qty">("profit");
  const [productFilter, setProductFilter] = useState<number | "">("");
  const [productSearch, setProductSearch] = useState("");

  // الاستعلام النشط (يتحكم فيه زر "احسب")
  const [activeQuery, setActiveQuery] = useState({
    from: firstOfMonth,
    to: today,
    product_id: "" as number | "",
  });

  const { data: products = [] } = useGetProducts();

  const { data, isLoading, isError, error, refetch } = useQuery<ProfitsData>({
    queryKey: ["/api/profits", activeQuery.from, activeQuery.to, activeQuery.product_id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeQuery.from) params.set("date_from", activeQuery.from);
      if (activeQuery.to) params.set("date_to", activeQuery.to);
      if (activeQuery.product_id !== "") params.set("product_id", String(activeQuery.product_id));
      const r = await authFetch(api(`/api/profits?${params}`));
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `خطأ ${r.status}`);
      return json;
    },
    retry: 1,
  });

  const handleSearch = () => {
    setActiveQuery({ from: dateFrom, to: dateTo, product_id: productFilter });
  };

  const clearProductFilter = () => {
    setProductFilter("");
    setProductSearch("");
    setActiveQuery(q => ({ ...q, product_id: "" }));
  };

  const setQuickRange = (days: number | "month" | "year" | "all") => {
    const end = new Date();
    let start = new Date();
    if (days === "all") {
      setDateFrom(""); setDateTo("");
      setActiveQuery(q => ({ ...q, from: "", to: "" }));
      return;
    }
    if (days === "month") { start = new Date(end.getFullYear(), end.getMonth(), 1); }
    else if (days === "year") { start = new Date(end.getFullYear(), 0, 1); }
    else { start.setDate(start.getDate() - days); }
    const fromStr = start.toISOString().split("T")[0];
    const toStr = end.toISOString().split("T")[0];
    setDateFrom(fromStr); setDateTo(toStr);
    setActiveQuery(q => ({ ...q, from: fromStr, to: toStr }));
  };

  const sortedProducts = useMemo(() => {
    if (!data?.by_product) return [];
    return [...data.by_product].sort((a, b) => {
      if (sortBy === "profit") return b.profit - a.profit;
      if (sortBy === "revenue") return b.revenue - a.revenue;
      if (sortBy === "margin") return (b.profit_margin ?? 0) - (a.profit_margin ?? 0);
      if (sortBy === "qty") return b.qty_sold - a.qty_sold;
      return 0;
    });
  }, [data?.by_product, sortBy]);

  const maxProfit = useMemo(() =>
    Math.max(...(data?.by_product?.map(p => Math.abs(p.profit)) ?? [0]), 0.01),
    [data?.by_product]
  );

  const arabicMonth = (m: string) => {
    const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const [year, month] = m.split("-");
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const maxMonthRevenue = useMemo(() =>
    Math.max(...(data?.by_month?.map(m => m.revenue) ?? [0]), 0.01),
    [data?.by_month]
  );

  // المنتجات المصفّاة في القائمة المنسدلة
  const filteredProducts = useMemo(() =>
    products.filter(p => !productSearch || p.name.includes(productSearch) || (p.sku && p.sku.includes(productSearch))),
    [products, productSearch]
  );

  const selectedProduct = products.find(p => p.id === productFilter);

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── لوحة الفلاتر ── */}
      <div className="glass-panel rounded-3xl p-5 border border-white/10 space-y-4">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-400" /> فلاتر التقرير
        </h3>

        <div className="flex flex-wrap items-end gap-3">
          {/* من */}
          <div>
            <label className="text-white/50 text-xs block mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> من
            </label>
            <input type="date" className="glass-input text-sm px-3 py-2"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          {/* إلى */}
          <div>
            <label className="text-white/50 text-xs block mb-1">إلى</label>
            <input type="date" className="glass-input text-sm px-3 py-2"
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>

          {/* فلتر صنف */}
          <div className="min-w-[200px]">
            <label className="text-white/50 text-xs block mb-1 flex items-center gap-1">
              <Package className="w-3 h-3" /> صنف معين (اختياري)
            </label>
            {selectedProduct ? (
              <div className="glass-input py-2 px-3 flex items-center justify-between gap-2 text-sm">
                <span className="text-amber-400 font-bold truncate">{selectedProduct.name}</span>
                <button onClick={clearProductFilter} className="text-white/40 hover:text-red-400 transition-colors shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                <input type="text" placeholder="بحث عن صنف..." className="glass-input text-sm px-3 py-2 pr-8 w-full"
                  value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                {productSearch && (
                  <div className="absolute top-full right-0 left-0 mt-1 glass-panel border border-white/10 rounded-xl z-20 max-h-48 overflow-y-auto shadow-xl">
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-white/40 text-sm text-center">لا نتائج</div>
                    ) : filteredProducts.map(p => (
                      <button key={p.id} type="button"
                        className="w-full text-right px-3 py-2 text-sm hover:bg-white/10 text-white flex items-center justify-between gap-2 transition-colors"
                        onClick={() => { setProductFilter(p.id); setProductSearch(""); }}>
                        <span>{p.name}</span>
                        {p.sku && <span className="text-white/30 font-mono text-xs">{p.sku}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* زر الحساب */}
          <button onClick={handleSearch}
            className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2 font-bold">
            <BarChart3 className="w-4 h-4" /> احسب الأرباح
          </button>
          <button onClick={() => refetch()} className="btn-secondary px-3 py-2.5" title="تحديث">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* اختصارات سريعة */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "هذا الشهر", action: () => setQuickRange("month") },
            { label: "آخر 7 أيام", action: () => setQuickRange(7) },
            { label: "آخر 30 يوم", action: () => setQuickRange(30) },
            { label: "هذا العام", action: () => setQuickRange("year") },
            { label: "الكل", action: () => setQuickRange("all") },
          ].map(q => (
            <button key={q.label} onClick={q.action}
              className="text-xs bg-white/5 hover:bg-amber-500/20 hover:text-amber-400 text-white/60 hover:text-white px-3 py-1.5 rounded-xl border border-white/10 hover:border-amber-500/30 transition-all">
              {q.label}
            </button>
          ))}
        </div>

        {/* شارة الصنف المُختار */}
        {activeQuery.product_id !== "" && selectedProduct && (
          <div className="flex items-center gap-2 text-sm bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 w-fit">
            <Package className="w-4 h-4 text-amber-400" />
            <span className="text-white/60">عرض أرباح:</span>
            <span className="text-amber-400 font-bold">{selectedProduct.name}</span>
            <button onClick={clearProductFilter} className="text-white/40 hover:text-red-400 mr-1 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── حالة التحميل / الخطأ ── */}
      {isLoading ? (
        <div className="text-center py-20 space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-white/40">جاري حساب الأرباح...</p>
        </div>
      ) : isError ? (
        <div className="glass-panel rounded-3xl p-8 border border-red-500/30 bg-red-500/5 text-center space-y-3">
          <p className="text-red-400 font-bold text-lg">خطأ في تحميل البيانات</p>
          <p className="text-white/40 text-sm">{(error as Error)?.message || "تعذّر الاتصال بالخادم"}</p>
          <button onClick={() => refetch()} className="btn-secondary px-6 py-2 mt-2 flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" /> إعادة المحاولة
          </button>
        </div>
      ) : !data || typeof data.profit_margin !== "number" ? (
        <div className="text-center py-12 text-white/30">لا توجد بيانات للعرض</div>
      ) : (
        <>
          {/* ── صندوق الملخص المالي ── */}
          <FinancialSummaryBox revenue={data.total_revenue} cogs={data.total_cost} netProfit={data.net_profit} />

          {/* ── بطاقات الملخص التفصيلية ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <SummaryCard
              label="إجمالي الإيرادات"
              value={formatCurrency(data.total_revenue)}
              sub={`${data.invoice_count} فاتورة · ${data.item_count} قطعة`}
              color="border-blue-500/20 bg-blue-500/5 text-blue-400"
              icon={DollarSign}
              hint="سعر البيع الإجمالي لكل الفواتير"
            />
            <SummaryCard
              label="إجمالي التكلفة"
              value={formatCurrency(data.total_cost)}
              sub="متوسط مرجّح"
              color="border-orange-500/20 bg-orange-500/5 text-orange-400"
              icon={Package}
              hint="تكلفة البضاعة بالمتوسط المرجّح وقت البيع"
            />
            <SummaryCard
              label="الربح الإجمالي"
              value={formatCurrency(data.gross_profit)}
              sub={`هامش ${data.profit_margin.toFixed(1)}%`}
              color={data.gross_profit >= 0
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                : "border-red-500/20 bg-red-500/5 text-red-400"}
              icon={TrendingUp}
              hint="إيرادات − تكلفة البضاعة المباعة"
            />
            <SummaryCard
              label="هامش الربح"
              value={`${data.profit_margin.toFixed(2)}%`}
              sub="إجمالي"
              color={data.profit_margin >= 20
                ? "border-green-500/20 bg-green-500/5 text-green-400"
                : data.profit_margin >= 10
                  ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-400"
                  : "border-red-500/20 bg-red-500/5 text-red-400"}
              icon={BarChart3}
              hint="(ربح إجمالي ÷ إيرادات) × 100"
            />
            <SummaryCard
              label="إجمالي المصاريف"
              value={formatCurrency(data.total_expenses)}
              sub="المصروفات المسجلة"
              color="border-red-500/20 bg-red-500/5 text-red-400"
              icon={TrendingDown}
              hint="مصاريف تشغيلية مسجلة في الفترة"
            />
            <SummaryCard
              label="صافي الربح"
              value={formatCurrency(data.net_profit)}
              sub="بعد المصاريف"
              color={data.net_profit >= 0
                ? "border-amber-500/20 bg-amber-500/5 text-amber-400"
                : "border-red-500/20 bg-red-500/5 text-red-400"}
              icon={TrendingUp}
              hint="ربح إجمالي − مصاريف الفترة"
            />
          </div>

          {/* ── تحذير إذا لا توجد تكلفة ── */}
          {data.total_cost === 0 && data.total_revenue > 0 && (
            <div className="glass-panel rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5 text-amber-300 text-sm flex gap-3 items-start">
              <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-bold">تنبيه: التكلفة المسجلة = صفر</p>
                <p className="text-amber-300/70 text-xs mt-1">
                  الفواتير المُدرجة أُنشئت قبل تفعيل نظام متوسط التكلفة. الأرباح الظاهرة تساوي الإيرادات فقط.
                  الفواتير الجديدة ستُسجَّل بالتكلفة الصحيحة تلقائياً.
                </p>
              </div>
            </div>
          )}

          {/* ── الرسم البياني الشهري ── */}
          {data.by_month.length > 0 && (
            <div className="glass-panel rounded-3xl p-6 border border-white/10">
              <h3 className="text-white font-bold text-lg mb-5 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-400" /> الأداء الشهري
              </h3>
              <div className="space-y-3">
                {data.by_month.map(m => (
                  <div key={m.month} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-white/60 font-medium">{arabicMonth(m.month)}</span>
                      <div className="flex gap-4">
                        <span className="text-blue-400">إيراد: {formatCurrency(m.revenue)}</span>
                        <span className={m.profit >= 0 ? "text-emerald-400" : "text-red-400"}>
                          ربح: {formatCurrency(m.profit)}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 right-0 bg-blue-500/30 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (m.revenue / maxMonthRevenue) * 100)}%` }} />
                      <div className={`absolute inset-y-0 right-0 rounded-full transition-all ${m.profit >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, Math.max(0, (Math.abs(m.profit) / maxMonthRevenue) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── جدول الأصناف ── */}
          {sortedProducts.length > 0 && (
            <div className="glass-panel rounded-3xl overflow-hidden border border-white/10">
              <div className="flex justify-between items-center p-5 border-b border-white/10">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-400" />
                  ربحية الأصناف
                  <span className="text-white/30 text-sm font-normal">({sortedProducts.length} صنف)</span>
                </h3>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span>ترتيب:</span>
                  {(["profit", "revenue", "margin", "qty"] as const).map(s => (
                    <button key={s} onClick={() => setSortBy(s)}
                      className={`px-2.5 py-1 rounded-lg border transition-all ${sortBy === s ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/50"}`}>
                      {s === "profit" ? "ربح" : s === "revenue" ? "إيراد" : s === "margin" ? "هامش" : "كمية"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-4 text-white/60 font-semibold">#</th>
                      <th className="p-4 text-white/60 font-semibold">الصنف</th>
                      <th className="p-4 text-white/60 font-semibold text-right">الكمية</th>
                      <th className="p-4 text-white/60 font-semibold text-right">متوسط التكلفة</th>
                      <th className="p-4 text-white/60 font-semibold text-right">متوسط سعر البيع</th>
                      <th className="p-4 text-white/60 font-semibold text-right">الإيرادات</th>
                      <th className="p-4 text-white/60 font-semibold text-right">تكلفة البضاعة</th>
                      <th className="p-4 text-white/60 font-semibold text-right">الربح</th>
                      <th className="p-4 text-white/60 font-semibold text-right">الهامش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((p, i) => (
                      <tr key={p.product_id} className="border-b border-white/5 erp-table-row">
                        <td className="p-4 text-white/30 text-xs">{i + 1}</td>
                        <td className="p-4">
                          <div className="font-bold text-white">{p.product_name}</div>
                          <ProfitBar value={Math.abs(p.profit)} max={maxProfit}
                            color={p.profit >= 0 ? "bg-emerald-500" : "bg-red-500"} />
                        </td>
                        <td className="p-4 text-right text-white/70 tabular-nums">{p.qty_sold}</td>
                        <td className="p-4 text-right text-orange-400 tabular-nums">{formatCurrency(p.avg_cost_price)}</td>
                        <td className="p-4 text-right text-blue-400 tabular-nums">{formatCurrency(p.avg_sale_price)}</td>
                        <td className="p-4 text-right font-bold text-emerald-400 tabular-nums">{formatCurrency(p.revenue)}</td>
                        <td className="p-4 text-right text-red-400 tabular-nums">{formatCurrency(p.cost)}</td>
                        <td className="p-4 text-right font-black tabular-nums">
                          <span className={p.profit >= 0 ? "text-green-400" : "text-red-400"}>
                            {formatCurrency(p.profit)}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                            (p.profit_margin ?? 0) >= 30 ? 'text-green-400 bg-green-500/10 border-green-500/30' :
                            (p.profit_margin ?? 0) >= 15 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' :
                            (p.profit_margin ?? 0) >= 0  ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' :
                                                           'text-red-400 bg-red-500/10 border-red-500/30'}`}>
                            {Number(p.profit_margin ?? 0).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-amber-500/30 bg-gradient-to-l from-amber-500/10 via-amber-500/5 to-transparent">
                    <tr>
                      <td colSpan={5} className="p-4 text-amber-400 font-black text-sm">الإجمالي الكلي</td>
                      <td className="p-4 text-right font-black text-emerald-400 tabular-nums text-sm">{formatCurrency(data.total_revenue)}</td>
                      <td className="p-4 text-right font-black text-red-400 tabular-nums text-sm">{formatCurrency(data.total_cost)}</td>
                      <td className="p-4 text-right font-black tabular-nums text-sm">
                        <span className={data.gross_profit >= 0 ? "text-green-400" : "text-red-400"}>{formatCurrency(data.gross_profit)}</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className={`px-2 py-1 rounded-lg text-xs font-black border ${
                          data.profit_margin >= 20 ? 'text-green-400 bg-green-500/10 border-green-500/30' :
                                                     'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'}`}>
                          {data.profit_margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                    {data.total_expenses > 0 && (
                      <tr className="border-t border-white/5">
                        <td colSpan={7} className="p-3 text-right text-red-400/70 text-sm pr-5">
                          − مصاريف الفترة: {formatCurrency(data.total_expenses)}
                        </td>
                        <td colSpan={2} className="p-3 text-center font-black text-amber-400">
                          صافي: {formatCurrency(data.net_profit)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {data.by_product.length === 0 && (
            <div className="glass-panel rounded-3xl p-12 border border-white/10 text-center">
              <Package className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40 text-lg">لا توجد مبيعات في هذه الفترة</p>
              <p className="text-white/20 text-sm mt-2">جرّب تغيير نطاق التاريخ أو اختيار "الكل"</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
