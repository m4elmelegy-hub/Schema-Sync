import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  BarChart3, RefreshCw, Calendar, Info,
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
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs text-white/40 flex items-center gap-1">
              <Info className="w-3 h-3" /> {hint}
            </span>
          </div>
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
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
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
  const [activeQuery, setActiveQuery] = useState({ from: firstOfMonth, to: today });

  const { data, isLoading, refetch } = useQuery<ProfitsData>({
    queryKey: ["/api/profits", activeQuery.from, activeQuery.to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeQuery.from) params.set("date_from", activeQuery.from);
      if (activeQuery.to) params.set("date_to", activeQuery.to);
      return fetch(api(`/api/profits?${params}`)).then(r => r.json());
    },
  });

  const handleSearch = () => setActiveQuery({ from: dateFrom, to: dateTo });

  const setQuickRange = (days: number | "month" | "year" | "all") => {
    const end = new Date();
    let start = new Date();
    if (days === "all") { setDateFrom(""); setDateTo(""); setActiveQuery({ from: "", to: "" }); return; }
    if (days === "month") { start = new Date(end.getFullYear(), end.getMonth(), 1); }
    else if (days === "year") { start = new Date(end.getFullYear(), 0, 1); }
    else { start.setDate(start.getDate() - days); }
    const fromStr = start.toISOString().split("T")[0];
    const toStr = end.toISOString().split("T")[0];
    setDateFrom(fromStr); setDateTo(toStr);
    setActiveQuery({ from: fromStr, to: toStr });
  };

  const sortedProducts = useMemo(() => {
    if (!data?.by_product) return [];
    return [...data.by_product].sort((a, b) => {
      if (sortBy === "profit") return b.profit - a.profit;
      if (sortBy === "revenue") return b.revenue - a.revenue;
      if (sortBy === "margin") return b.profit_margin - a.profit_margin;
      if (sortBy === "qty") return b.qty_sold - a.qty_sold;
      return 0;
    });
  }, [data?.by_product, sortBy]);

  const maxProfit = useMemo(() => Math.max(...(data?.by_product?.map(p => p.profit) ?? [0])), [data?.by_product]);

  const arabicMonth = (m: string) => {
    const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const [year, month] = m.split("-");
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── فلتر الفترة ── */}
      <div className="glass-panel rounded-3xl p-5 border border-white/10">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-white/50 text-xs block mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> من</label>
            <input type="date" className="glass-input text-sm px-3 py-2" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-white/50 text-xs block mb-1">إلى</label>
            <input type="date" className="glass-input text-sm px-3 py-2" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button onClick={handleSearch} className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> احسب الأرباح
          </button>
          <button onClick={() => refetch()} className="btn-secondary px-3 py-2.5" title="تحديث">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "هذا الشهر", action: () => setQuickRange("month") },
              { label: "آخر 7 أيام", action: () => setQuickRange(7) },
              { label: "آخر 30 يوم", action: () => setQuickRange(30) },
              { label: "هذا العام", action: () => setQuickRange("year") },
              { label: "الكل", action: () => setQuickRange("all") },
            ].map(q => (
              <button key={q.label} onClick={q.action}
                className="text-xs bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 py-1.5 rounded-xl border border-white/10 transition-all">
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-white/40 text-lg">جاري حساب الأرباح...</div>
      ) : (!data || typeof data.profit_margin !== "number") ? null : (
        <>
          {/* ── بطاقات الملخص ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <SummaryCard
              label="إجمالي الإيرادات"
              value={formatCurrency(data.total_revenue)}
              sub={`${data.invoice_count} فاتورة`}
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
                <p className="font-bold mb-1">تنبيه: تكلفة البضاعة = صفر</p>
                <p className="text-amber-300/70 text-xs">
                  الفواتير القديمة المسجلة قبل تفعيل نظام المتوسط المرجّح لا تحتوي على تكلفة.
                  أرباحها تظهر مبالغ فيها. الفواتير الجديدة ستُسجَّل بالتكلفة الصحيحة تلقائياً.
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
                {data.by_month.map(m => {
                  const maxRev = Math.max(...data.by_month.map(x => x.revenue));
                  const revPct = maxRev > 0 ? (m.revenue / maxRev) * 100 : 0;
                  const profitPct = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
                  return (
                    <div key={m.month} className="grid grid-cols-[8rem_1fr_auto_auto_auto] gap-4 items-center">
                      <span className="text-white/60 text-sm">{arabicMonth(m.month)}</span>
                      <div className="space-y-1">
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500/60 rounded-full transition-all" style={{ width: `${revPct}%` }} />
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${m.profit >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
                            style={{ width: `${Math.abs(profitPct)}%` }} />
                        </div>
                      </div>
                      <span className="text-blue-400 text-sm font-bold w-28 text-left">{formatCurrency(m.revenue)}</span>
                      <span className={`text-sm font-bold w-28 text-left ${m.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(m.profit)}
                      </span>
                      <span className={`text-xs w-14 text-left ${m.profit >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                        {m.revenue > 0 ? ((m.profit / m.revenue) * 100).toFixed(1) + "%" : "—"}
                      </span>
                    </div>
                  );
                })}
                <div className="flex gap-4 mt-3 text-xs text-white/30 border-t border-white/5 pt-3">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500/60 rounded-sm" />الإيرادات</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500/70 rounded-sm" />الأرباح</span>
                </div>
              </div>
            </div>
          )}

          {/* ── جدول الأصناف ── */}
          <div className="glass-panel rounded-3xl overflow-hidden border border-white/10">
            <div className="p-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" /> أرباح الأصناف
                <span className="text-white/30 text-sm font-normal">({sortedProducts.length} صنف)</span>
              </h3>
              <div className="flex gap-2">
                <span className="text-white/40 text-xs self-center">ترتيب حسب:</span>
                {[
                  { key: "profit", label: "الربح" },
                  { key: "revenue", label: "الإيراد" },
                  { key: "margin", label: "الهامش" },
                  { key: "qty", label: "الكمية" },
                ].map(s => (
                  <button key={s.key} onClick={() => setSortBy(s.key as typeof sortBy)}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${sortBy === s.key
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              {sortedProducts.length === 0 ? (
                <div className="p-12 text-center text-white/30">لا توجد مبيعات في هذه الفترة</div>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-4 text-white/60">#</th>
                      <th className="p-4 text-white/60">الصنف</th>
                      <th className="p-4 text-white/60 text-center">الكمية</th>
                      <th className="p-4 text-white/60 text-center">متوسط التكلفة</th>
                      <th className="p-4 text-white/60 text-center">متوسط سعر البيع</th>
                      <th className="p-4 text-white/60 text-center">إجمالي الإيراد</th>
                      <th className="p-4 text-white/60 text-center">إجمالي التكلفة</th>
                      <th className="p-4 text-white/60 text-center">الربح</th>
                      <th className="p-4 text-white/60 text-center">هامش الربح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((p, i) => (
                      <tr key={p.product_id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${p.profit < 0 ? 'bg-red-500/3' : ''}`}>
                        <td className="p-4 text-white/30 text-xs">{i + 1}</td>
                        <td className="p-4">
                          <p className="font-bold text-white">{p.product_name}</p>
                          <ProfitBar value={p.profit} max={maxProfit} color={p.profit >= 0 ? "bg-emerald-500/60" : "bg-red-500/60"} />
                        </td>
                        <td className="p-4 text-center text-white/70">{Number(p.qty_sold).toFixed(0)}</td>
                        <td className="p-4 text-center">
                          <span className="text-orange-400 font-bold">{formatCurrency(p.avg_cost_price)}</span>
                          {p.avg_cost_price === 0 && <span className="text-red-400/60 text-xs block">غير مسجلة</span>}
                        </td>
                        <td className="p-4 text-center text-blue-400 font-bold">{formatCurrency(p.avg_sale_price)}</td>
                        <td className="p-4 text-center text-white font-bold">{formatCurrency(p.revenue)}</td>
                        <td className="p-4 text-center text-orange-400">{formatCurrency(p.cost)}</td>
                        <td className="p-4 text-center">
                          <span className={`font-black text-base ${p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {p.profit >= 0 ? '+' : ''}{formatCurrency(p.profit)}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                            p.profit_margin >= 30 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                            p.profit_margin >= 15 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' :
                            p.profit_margin >= 0  ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' :
                                                    'text-red-400 bg-red-500/10 border-red-500/30'}`}>
                            {Number(p.profit_margin ?? 0).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td colSpan={5} className="p-4 text-white/60 font-bold">الإجمالي</td>
                      <td className="p-4 text-center font-black text-white">{formatCurrency(data.total_revenue)}</td>
                      <td className="p-4 text-center font-black text-orange-400">{formatCurrency(data.total_cost)}</td>
                      <td className="p-4 text-center font-black text-emerald-400">{formatCurrency(data.gross_profit)}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-lg text-xs font-black border ${
                          data.profit_margin >= 20 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                                                     'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'}`}>
                          {data.profit_margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                    {data.total_expenses > 0 && (
                      <tr className="border-t border-white/5">
                        <td colSpan={6} className="p-4 text-red-400/80 text-sm">مصاريف الفترة</td>
                        <td colSpan={3} className="p-4 text-center font-bold text-red-400">
                          − {formatCurrency(data.total_expenses)}
                        </td>
                      </tr>
                    )}
                    {data.total_expenses > 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-amber-400 font-bold">صافي الربح</td>
                        <td colSpan={3} className="p-4 text-center font-black text-amber-400 text-lg">
                          {formatCurrency(data.net_profit)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* ── شرح المنهجية ── */}
          <div className="glass-panel rounded-2xl p-4 border border-white/5 text-xs text-white/30 space-y-1">
            <p className="text-white/50 font-bold mb-2">كيفية حساب الأرباح — المتوسط المرجّح (Weighted Average Cost)</p>
            <p>• عند كل عملية شراء: متوسط التكلفة = (كمية قديمة × تكلفة قديمة + كمية جديدة × سعر شراء جديد) ÷ (إجمالي الكمية)</p>
            <p>• عند البيع: يُحفظ متوسط التكلفة لحظة البيع مع كل صنف في الفاتورة</p>
            <p>• الربح الإجمالي للصنف = (سعر البيع − متوسط التكلفة) × الكمية</p>
            <p>• صافي الربح = ربح إجمالي − مصاريف تشغيلية</p>
          </div>
        </>
      )}
    </div>
  );
}
