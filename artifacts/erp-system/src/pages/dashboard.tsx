import { useGetDashboardStats } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Wallet, Users,
  AlertTriangle, PackageX, ArrowUpRight, ArrowDownRight,
  ShoppingCart, ReceiptText, DollarSign, Landmark
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";

/* ── Type label helpers ───────────────────────────────── */
const TX_LABELS: Record<string, string> = {
  sale: "مبيعات", purchase: "مشتريات", expense: "مصروف",
  income: "إيراد", receipt: "سند قبض", deposit: "سند توريد",
  payment: "سند صرف", transfer: "تحويل",
};
const TX_ICONS: Record<string, typeof ShoppingCart> = {
  sale: ShoppingCart, purchase: Landmark, expense: TrendingDown,
  income: TrendingUp, receipt: ReceiptText, deposit: DollarSign,
};
const TX_IS_INCOME = new Set(["sale", "receipt", "income", "deposit"]);

/* ─────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboardStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500/60 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3 opacity-70" />
        <p className="text-white/60">حدث خطأ في تحميل البيانات</p>
      </div>
    );
  }

  const netIsPositive = stats.net_profit >= 0;

  /* ── Single-day chart data ─────────────────────────── */
  const barData = [
    { name: "مبيعات", amount: stats.total_sales_today, fill: "#f59e0b" },
    { name: "مصروفات", amount: stats.total_expenses_today, fill: "#f87171" },
    { name: "إيرادات", amount: stats.total_income_today, fill: "#60a5fa" },
    { name: "صافي", amount: Math.abs(stats.net_profit), fill: stats.net_profit >= 0 ? "#34d399" : "#f87171" },
  ];

  return (
    <div className="space-y-5">

      {/* ── KPI Cards Row ───────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="مبيعات اليوم"
          value={stats.total_sales_today}
          icon={ShoppingCart}
          variant="amber"
          positive
        />
        <KpiCard
          label="مصروفات اليوم"
          value={stats.total_expenses_today}
          icon={TrendingDown}
          variant="red"
          positive={false}
        />
        <KpiCard
          label="إيرادات أخرى"
          value={stats.total_income_today}
          icon={Wallet}
          variant="blue"
          positive
        />
        <KpiCard
          label="صافي الربح"
          value={stats.net_profit}
          icon={TrendingUp}
          variant={netIsPositive ? "emerald" : "red"}
          positive={netIsPositive}
          highlight
        />
      </div>

      {/* ── Secondary Row ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricBand
          label="ديون العملاء (لنا)"
          value={stats.total_customer_debts}
          color="#f59e0b"
          icon={Users}
          sub="مستحقات غير مسددة"
        />
        <MetricBand
          label="إجمالي الفواتير"
          value={stats.total_sales_today}
          color="#60a5fa"
          icon={ReceiptText}
          sub="فواتير اليوم"
        />
        <MetricBand
          label="الخزينة"
          value={stats.total_income_today + stats.total_sales_today}
          color="#34d399"
          icon={DollarSign}
          sub="الرصيد التقديري"
        />
      </div>

      {/* ── Charts + Lists ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Bar Chart */}
        <div className="lg:col-span-2 card-premium p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.90)" }}>نظرة مالية (اليوم)</h3>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>مقارنة المبيعات والمصروفات والأرباح</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.25)" tick={{ fontSize: 12, fontFamily: "Tajawal" }} axisLine={false} tickLine={false} />
              <YAxis stroke="rgba(255,255,255,0.25)" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)", radius: 8 }}
                contentStyle={{
                  background: "hsla(225,25%,10%,0.95)", border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12, fontSize: 13, fontFamily: "Tajawal",
                }}
                labelStyle={{ color: "rgba(255,255,255,0.60)", marginBottom: 4 }}
                itemStyle={{ color: "#fff" }}
                formatter={(v: number) => [formatCurrency(v), ""]}
              />
              <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Right column: alerts + transactions */}
        <div className="space-y-4">

          {/* Low Stock */}
          <div className="card-premium p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>تنبيهات المخزون</h3>
              {stats.low_stock_products?.length > 0 && (
                <span className="mr-auto text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>
                  {stats.low_stock_products.length}
                </span>
              )}
            </div>
            {stats.low_stock_products?.length === 0 ? (
              <div className="flex flex-col items-center py-5 gap-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                <PackageX className="w-7 h-7 opacity-50" />
                <p className="text-xs">لا توجد منتجات ناقصة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.low_stock_products.slice(0, 4).map((prod: { id: number; name: string; quantity: number; sku?: string }) => (
                  <div key={prod.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#f59e0b" }} />
                      <p className="text-sm font-medium truncate" style={{ color: "rgba(255,255,255,0.80)" }}>{prod.name}</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
                      style={{
                        background: prod.quantity === 0 ? "rgba(248,113,113,0.15)" : "rgba(245,158,11,0.15)",
                        color: prod.quantity === 0 ? "#f87171" : "#f59e0b",
                        border: `1px solid ${prod.quantity === 0 ? "rgba(248,113,113,0.25)" : "rgba(245,158,11,0.25)"}`,
                      }}>
                      {prod.quantity} قطعة
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Transactions */}
          <div className="card-premium p-4">
            <h3 className="text-sm font-bold mb-3" style={{ color: "rgba(255,255,255,0.85)" }}>آخر العمليات</h3>
            {stats.recent_transactions?.length === 0 ? (
              <div className="py-5 text-center text-xs" style={{ color: "rgba(255,255,255,0.30)" }}>لا توجد عمليات حديثة</div>
            ) : (
              <div className="space-y-2">
                {stats.recent_transactions.slice(0, 5).map((tx: { id: number; type: string; amount: number; created_at: string }) => {
                  const isIncome = TX_IS_INCOME.has(tx.type);
                  const TxIcon = TX_ICONS[tx.type] || DollarSign;
                  return (
                    <div key={tx.id} className="flex items-center gap-2.5 py-1">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: isIncome ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                        }}>
                        <TxIcon className="w-3.5 h-3.5" style={{ color: isIncome ? "#34d399" : "#f87171" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
                          {TX_LABELS[tx.type] || tx.type}
                        </p>
                      </div>
                      <p className="text-xs font-bold shrink-0" style={{ color: isIncome ? "#34d399" : "#f87171" }}>
                        {isIncome ? "+" : "−"}{formatCurrency(tx.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────── KPI Card ────────────────────────────────────── */
const VARIANT_STYLES = {
  amber:   { card: "stat-card-amber",   icon: "rgba(245,158,11,0.15)",  iconColor: "#f59e0b",  value: "#f59e0b"  },
  emerald: { card: "stat-card-emerald", icon: "rgba(52,211,153,0.15)",  iconColor: "#34d399",  value: "#34d399"  },
  red:     { card: "stat-card-red",     icon: "rgba(248,113,113,0.15)", iconColor: "#f87171",  value: "#f87171"  },
  blue:    { card: "stat-card-blue",    icon: "rgba(96,165,250,0.15)",  iconColor: "#60a5fa",  value: "#60a5fa"  },
  violet:  { card: "stat-card-violet",  icon: "rgba(167,139,250,0.15)", iconColor: "#a78bfa",  value: "#a78bfa"  },
};

function KpiCard({
  label, value, icon: Icon, variant = "amber", positive = true, highlight = false
}: {
  label: string; value: number; icon: typeof TrendingUp;
  variant?: keyof typeof VARIANT_STYLES; positive?: boolean; highlight?: boolean;
}) {
  const s = VARIANT_STYLES[variant];
  return (
    <div className={`stat-card ${s.card}`}>
      {/* Glow blob */}
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl pointer-events-none"
        style={{ background: s.icon, transform: "translate(30%, -30%)", opacity: 0.8 }} />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.50)" }}>{label}</p>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: s.icon }}>
            <Icon className="w-4.5 h-4.5" style={{ color: s.iconColor, width: 18, height: 18 }} />
          </div>
        </div>

        {/* Value */}
        <p className="text-2xl font-black tracking-tight mb-3" style={{ color: highlight ? s.value : "rgba(255,255,255,0.92)" }}>
          {formatCurrency(value)}
        </p>

        {/* Trend badge */}
        <div className={positive ? "badge-up" : "badge-down"}>
          {positive
            ? <ArrowUpRight className="w-3 h-3" />
            : <ArrowDownRight className="w-3 h-3" />
          }
          <span>{positive ? "إيجابي" : "سالب"}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────── Metric Band ─────────────────────────────────── */
function MetricBand({
  label, value, color, icon: Icon, sub
}: { label: string; value: number; color: string; icon: typeof TrendingUp; sub: string }) {
  return (
    <div className="card-premium p-4 flex items-center gap-4">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}25` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</p>
        <p className="text-lg font-black" style={{ color: "rgba(255,255,255,0.90)" }}>{formatCurrency(value)}</p>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>{sub}</p>
      </div>
    </div>
  );
}
