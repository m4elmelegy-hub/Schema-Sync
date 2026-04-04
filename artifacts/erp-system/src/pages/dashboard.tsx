import { useQuery } from "@tanstack/react-query";
import { type DashboardStats } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { useWarehouse } from "@/contexts/warehouse";
import { formatCurrency } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Wallet, Users,
  AlertTriangle, PackageX, ShoppingCart, ReceiptText,
  DollarSign, Landmark, ArrowUpRight, ArrowDownRight,
  Package, Truck,
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ── Transaction meta ─────────────────────────────────────── */
const TX_LABELS: Record<string, string> = {
  sale: "مبيعات", purchase: "مشتريات", expense: "مصروف",
  income: "إيراد", receipt: "سند قبض", deposit: "سند توريد",
  payment: "سند صرف", transfer: "تحويل خزينة",
  sale_cash: "بيع نقدي", sale_credit: "بيع آجل", sale_partial: "بيع جزئي",
  sale_return: "مرتجع مبيعات", purchase_return: "مرتجع مشتريات",
  receipt_voucher: "سند قبض", payment_voucher: "سند صرف",
  sale_cancel: "إلغاء بيع",
};
const TX_ICONS: Record<string, typeof ShoppingCart> = {
  sale: ShoppingCart, purchase: Landmark, expense: TrendingDown,
  income: TrendingUp, receipt: ReceiptText, deposit: DollarSign,
};
const TX_IS_INCOME = new Set(["sale", "receipt", "income", "deposit", "sale_cash", "sale_credit", "sale_partial", "receipt_voucher"]);

/* ─────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { currentWarehouseId } = useWarehouse();
  const warehouseParam = currentWarehouseId ? `?warehouse_id=${currentWarehouseId}` : "";
  const { data: stats, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", currentWarehouseId],
    queryFn: () => authFetch(api(`/api/dashboard/stats${warehouseParam}`))
      .then(r => { if (!r.ok) throw new Error("خطأ في جلب البيانات"); return r.json(); }),
  });

  /* ── Loading skeleton ─────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "16px" }} className="db-grid-kpi">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="db-skeleton" style={{ height: "148px", animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <div className="db-skeleton" style={{ height: "280px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }} className="db-grid-bottom">
          {[0, 1].map(i => (
            <div key={i} className="db-skeleton" style={{ height: "260px", animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <style>{`@keyframes db-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  /* ── Error ─────────────────────────────────────────────── */
  if (isError || !stats) {
    return (
      <div style={{
        borderRadius: "20px", padding: "48px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        textAlign: "center",
      }} dir="rtl">
        <AlertTriangle style={{ width: 44, height: 44, color: "#f59e0b", margin: "0 auto 16px", opacity: 0.7 }} />
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 15 }}>حدث خطأ في تحميل البيانات</p>
      </div>
    );
  }

  const netIsPositive = stats.net_profit >= 0;

  /* ── Chart data ─────────────────────────────────────────── */
  const barData = [
    { name: "المبيعات",   amount: stats.total_sales_today,    fill: "#f59e0b" },
    { name: "المصروفات",  amount: stats.total_expenses_today,  fill: "#f87171" },
    { name: "الإيرادات",  amount: stats.total_income_today,    fill: "#60a5fa" },
    { name: "صافي الربح", amount: Math.abs(stats.net_profit),  fill: stats.net_profit >= 0 ? "#34d399" : "#f87171" },
  ];

  /* ── KPI card definitions ────────────────────────────────── */
  const kpiCards = [
    {
      label:    "مبيعات اليوم",
      value:    stats.total_sales_today,
      icon:     ShoppingCart,
      gradient: "linear-gradient(135deg, #92400e 0%, #b45309 40%, #d97706 100%)",
      glow:     "rgba(245,158,11,0.30)",
      iconBg:   "rgba(245,158,11,0.20)",
      iconClr:  "#fcd34d",
      badge:    { up: true, label: "اليوم" },
    },
    {
      label:    "صافي الربح",
      value:    stats.net_profit,
      icon:     netIsPositive ? TrendingUp : TrendingDown,
      gradient: netIsPositive
        ? "linear-gradient(135deg, #064e3b 0%, #065f46 40%, #059669 100%)"
        : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 40%, #dc2626 100%)",
      glow:     netIsPositive ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)",
      iconBg:   netIsPositive ? "rgba(52,211,153,0.20)" : "rgba(248,113,113,0.20)",
      iconClr:  netIsPositive ? "#6ee7b7" : "#fca5a5",
      badge:    { up: netIsPositive, label: netIsPositive ? "ربح" : "خسارة" },
    },
    {
      label:    "ديون العملاء",
      value:    stats.total_customer_debts,
      icon:     Users,
      gradient: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)",
      glow:     "rgba(99,102,241,0.28)",
      iconBg:   "rgba(129,140,248,0.20)",
      iconClr:  "#a5b4fc",
      badge:    { up: false, label: "مستحقة" },
    },
    {
      label:    "مستحقات لعملاء",
      value:    stats.total_supplier_debts ?? 0,
      icon:     Truck,
      gradient: "linear-gradient(135deg, #164e63 0%, #155e75 40%, #0e7490 100%)",
      glow:     "rgba(6,182,212,0.28)",
      iconBg:   "rgba(6,182,212,0.20)",
      iconClr:  "#67e8f9",
      badge:    {
        up:    (stats.total_supplier_debts ?? 0) === 0,
        label: (stats.total_supplier_debts ?? 0) === 0 ? "لا ديون" : "مستحقة",
      },
    },
    {
      label:    "تنبيهات المخزون",
      value:    stats.low_stock_products?.length ?? 0,
      icon:     Package,
      gradient: "linear-gradient(135deg, #3b0764 0%, #581c87 40%, #7e22ce 100%)",
      glow:     "rgba(167,139,250,0.28)",
      iconBg:   "rgba(167,139,250,0.20)",
      iconClr:  "#e9d5ff",
      badge:    {
        up:    (stats.low_stock_products?.length ?? 0) === 0,
        label: (stats.low_stock_products?.length ?? 0) === 0 ? "لا تنبيهات" : "منتج ناقص",
      },
      rawValue: true,
    },
  ];

  const totalRevenue = stats.total_sales_today + stats.total_income_today;
  const totalOut     = stats.total_expenses_today;

  return (
    <div dir="rtl" style={{ fontFamily: "inherit" }} className="page-enter">

      {/* ══════════════════════════════════════════════════════
          HERO SUMMARY STRIP
      ══════════════════════════════════════════════════════ */}
      <div className="erp-hero-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="erp-hero-cell">
          <div className="hero-icon-wrap" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.22)" }}>
            <ShoppingCart style={{ width: 16, height: 16, color: "#f59e0b" }} />
          </div>
          <div>
            <p className="hero-label">إجمالي الإيرادات اليوم</p>
            <p className="hero-value">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>
        <div className="erp-hero-cell">
          <div className="hero-icon-wrap" style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.22)" }}>
            <TrendingDown style={{ width: 16, height: 16, color: "#f87171" }} />
          </div>
          <div>
            <p className="hero-label">إجمالي المصروفات اليوم</p>
            <p className="hero-value">{formatCurrency(totalOut)}</p>
          </div>
        </div>
        <div className="erp-hero-cell">
          <div className="hero-icon-wrap" style={{
            background: netIsPositive ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
            border: `1px solid ${netIsPositive ? "rgba(52,211,153,0.22)" : "rgba(248,113,113,0.22)"}`,
          }}>
            {netIsPositive
              ? <TrendingUp style={{ width: 16, height: 16, color: "#34d399" }} />
              : <TrendingDown style={{ width: 16, height: 16, color: "#f87171" }} />
            }
          </div>
          <div>
            <p className="hero-label">صافي الربح</p>
            <p className="hero-value" style={{ color: netIsPositive ? "#34d399" : "#f87171" }}>
              {formatCurrency(stats.net_profit)}
            </p>
          </div>
        </div>
        <div className="erp-hero-cell">
          <div className="hero-icon-wrap" style={{
            background: (stats.low_stock_products?.length ?? 0) === 0 ? "rgba(52,211,153,0.15)" : "rgba(245,158,11,0.15)",
            border: `1px solid ${(stats.low_stock_products?.length ?? 0) === 0 ? "rgba(52,211,153,0.22)" : "rgba(245,158,11,0.22)"}`,
          }}>
            <Package style={{ width: 16, height: 16, color: (stats.low_stock_products?.length ?? 0) === 0 ? "#34d399" : "#f59e0b" }} />
          </div>
          <div>
            <p className="hero-label">تنبيهات المخزون</p>
            <p className="hero-value">
              {(stats.low_stock_products?.length ?? 0) === 0 ? "المخزون بخير ✓" : `${stats.low_stock_products?.length} منتج`}
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          KPI CARDS
      ══════════════════════════════════════════════════════ */}
      <div className="db-grid-kpi" style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: "16px",
        marginBottom: "24px",
      }}>
        {kpiCards.map((card, i) => (
          <KpiCard key={card.label} card={card} index={i} />
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          BIG CHART — full width
      ══════════════════════════════════════════════════════ */}
      <div
        className="db-card"
        style={{
          marginBottom: "24px",
          padding: "28px 28px 20px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h3 className="db-chart-title">النظرة المالية اليوم</h3>
            <p className="db-chart-sub">مقارنة المبيعات والمصروفات والأرباح</p>
          </div>
          <div style={{ display: "flex", gap: "20px" }}>
            {barData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: d.fill }} />
                <span className="db-legend-label">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Check for no data */}
        {barData.every(d => d.amount === 0) ? (
          <EmptyState msg="لا توجد بيانات بعد — ابدأ بإضافة أول عملية" height={240} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} barSize={52} barCategoryGap="35%">
              <CartesianGrid
                strokeDasharray="3 4"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                stroke="rgba(255,255,255,0.18)"
                tick={{ fontSize: 13, fontFamily: "Tajawal, sans-serif", fill: "rgba(255,255,255,0.55)" }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                stroke="rgba(255,255,255,0.18)"
                tick={{ fontSize: 11, fill: "rgba(255,255,255,0.40)" }}
                axisLine={false} tickLine={false} width={64}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)", radius: 10 }}
                contentStyle={{
                  background: "hsla(240,30%,8%,0.96)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 14, fontSize: 13, fontFamily: "Tajawal, sans-serif",
                  boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
                }}
                labelStyle={{ color: "rgba(255,255,255,0.55)", marginBottom: 6, fontWeight: 700 }}
                itemStyle={{ color: "#fff" }}
                formatter={(v: number) => [formatCurrency(v), ""]}
              />
              <Bar dataKey="amount" radius={[10, 10, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} fillOpacity={0.88} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          BOTTOM  — 2 columns
      ══════════════════════════════════════════════════════ */}
      <div className="db-grid-bottom" style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px",
      }}>

        {/* ── Recent transactions ──────────────────────── */}
        <div className="db-card" style={{ padding: "24px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <h3 className="db-card-title">آخر العمليات</h3>
              <p className="db-card-sub">أحدث الحركات المالية</p>
            </div>
            <div className="db-section-badge-blue">{stats.recent_transactions?.length ?? 0} حركة</div>
          </div>

          {!stats.recent_transactions?.length ? (
            <EmptyState msg="لا توجد عمليات بعد — ابدأ بإضافة أول عملية" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {stats.recent_transactions.slice(0, 7).map((tx: {
                id: number; type: string; amount: number; created_at: string
              }) => {
                const isIncome = TX_IS_INCOME.has(tx.type);
                const TxIcon  = TX_ICONS[tx.type] || DollarSign;
                const dt      = new Date(tx.created_at);
                const time    = dt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div
                    key={tx.id}
                    className="db-tx-row"
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 12px",
                      borderRadius: "12px",
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isIncome ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                      border: `1px solid ${isIncome ? "rgba(52,211,153,0.18)" : "rgba(248,113,113,0.18)"}`,
                    }}>
                      <TxIcon style={{
                        width: 16, height: 16,
                        color: isIncome ? "#34d399" : "#f87171",
                      }} />
                    </div>
                    {/* Label */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="db-tx-label">{TX_LABELS[tx.type] || tx.type}</p>
                      <p className="db-tx-time">{time}</p>
                    </div>
                    {/* Amount */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {isIncome
                        ? <ArrowUpRight style={{ width: 14, height: 14, color: "#34d399" }} />
                        : <ArrowDownRight style={{ width: 14, height: 14, color: "#f87171" }} />
                      }
                      <span style={{
                        fontSize: "13.5px", fontWeight: 800,
                        color: isIncome ? "#34d399" : "#f87171",
                      }}>
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Low stock products ───────────────────────── */}
        <div className="db-card" style={{ padding: "24px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <h3 className="db-card-title">تنبيهات المخزون</h3>
              <p className="db-card-sub">منتجات تحتاج تجديداً</p>
            </div>
            {(stats.low_stock_products?.length ?? 0) > 0 && (
              <div className="db-section-badge-amber">{stats.low_stock_products.length} منتج</div>
            )}
          </div>

          {!stats.low_stock_products?.length ? (
            <div className="erp-empty-state" style={{ padding: "32px 0", flexDirection: "column", gap: "12px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.20)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PackageX style={{ width: 24, height: 24, color: "#34d399" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p className="db-tx-label" style={{ marginBottom: 4 }}>المخزون بخير ✓</p>
                <p className="db-tx-time">لا توجد منتجات منخفضة المخزون</p>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {stats.low_stock_products.slice(0, 7).map((prod) => {
                const outOfStock = Number(prod.quantity) === 0;
                return (
                  <div key={prod.id} className="db-tx-row" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px" }}>
                    <div className="hero-icon-wrap" style={{ background: outOfStock ? "rgba(248,113,113,0.12)" : "rgba(245,158,11,0.12)", border: `1px solid ${outOfStock ? "rgba(248,113,113,0.20)" : "rgba(245,158,11,0.20)"}` }}>
                      <Package style={{ width: 16, height: 16, color: outOfStock ? "#f87171" : "#f59e0b" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="db-product-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>{prod.name}</p>
                      <p className="db-product-cat">{outOfStock ? "نفد من المخزون" : "مخزون منخفض"}</p>
                    </div>
                    <div style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 800, background: outOfStock ? "rgba(248,113,113,0.15)" : "rgba(245,158,11,0.15)", color: outOfStock ? "#fca5a5" : "#fcd34d", border: `1px solid ${outOfStock ? "rgba(248,113,113,0.22)" : "rgba(245,158,11,0.22)"}`, whiteSpace: "nowrap" }}>
                      {outOfStock ? "نفد" : `${prod.quantity} قطعة`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes db-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .db-kpi-card { animation: db-fade-up 0.5s cubic-bezier(.22,1,.36,1) both; }
        .db-kpi-hover { transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.25s ease, filter 0.25s ease; }
        .db-kpi-hover:hover { transform: translateY(-4px); box-shadow: 0 24px 56px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.14) !important; filter: brightness(1.06) saturate(1.1); }
        @media (max-width: 1280px) { .db-grid-kpi { grid-template-columns: repeat(3,1fr) !important; } }
        @media (max-width: 1024px) { .db-grid-kpi { grid-template-columns: repeat(2,1fr) !important; } .db-grid-bottom { grid-template-columns: 1fr !important; } }
        @media (max-width: 640px)  { .db-grid-kpi { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   KPI CARD
────────────────────────────────────────────────────────── */
interface KpiDef {
  label: string;
  value: number;
  icon: typeof ShoppingCart;
  gradient: string;
  glow: string;
  iconBg: string;
  iconClr: string;
  badge: { up: boolean; label: string };
  rawValue?: boolean;
}

function KpiCard({ card, index }: { card: KpiDef; index: number }) {
  const Icon = card.icon;
  return (
    <div
      className="db-kpi-card db-kpi-hover"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "20px",
        padding: "22px 22px 20px",
        background: card.gradient,
        boxShadow: `0 10px 40px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.12)`,
        animationDelay: `${index * 0.08}s`,
        cursor: "default",
      }}
    >
      {/* Top shimmer line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "1px",
        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {/* Glow orb */}
      <div style={{
        position: "absolute", top: "-50px", left: "-50px",
        width: "220px", height: "220px", borderRadius: "50%",
        background: card.glow,
        filter: "blur(55px)",
        pointerEvents: "none",
      }} />

      {/* Dot pattern */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
        maskImage: "radial-gradient(ellipse 70% 70% at 80% 20%, #000 40%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 80% 20%, #000 40%, transparent 100%)",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
          <p style={{ fontSize: "11.5px", fontWeight: 700, color: "rgba(255,255,255,0.65)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {card.label}
          </p>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: card.iconBg,
            border: "1.5px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.20)",
          }}>
            <Icon style={{ width: 21, height: 21, color: card.iconClr }} />
          </div>
        </div>

        {/* Big value */}
        <p style={{
          fontSize: "26px", fontWeight: 900, color: "#fff",
          marginBottom: "14px", letterSpacing: "-0.8px", lineHeight: 1,
          textShadow: "0 2px 12px rgba(0,0,0,0.3)",
        }}>
          {card.rawValue ? String(card.value) : formatCurrency(card.value)}
        </p>

        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "4px",
          padding: "4px 10px",
          borderRadius: "20px",
          background: card.badge.up
            ? "rgba(52,211,153,0.20)"
            : "rgba(248,113,113,0.20)",
          border: `1px solid ${card.badge.up ? "rgba(52,211,153,0.30)" : "rgba(248,113,113,0.30)"}`,
          fontSize: "11px", fontWeight: 700,
          color: card.badge.up ? "#6ee7b7" : "#fca5a5",
          backdropFilter: "blur(4px)",
        }}>
          {card.badge.up
            ? <ArrowUpRight style={{ width: 12, height: 12 }} />
            : <ArrowDownRight style={{ width: 12, height: 12 }} />
          }
          <span>{card.badge.label}</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   EMPTY STATE
────────────────────────────────────────────────────────── */
function EmptyState({ msg, height = 160 }: { msg: string; height?: number }) {
  return (
    <div className="erp-empty-state" style={{ height, flexDirection: "column", gap: "12px" }}>
      <div className="erp-empty-icon" style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Wallet style={{ width: 22, height: 22 }} />
      </div>
      <p className="erp-empty-label" style={{ textAlign: "center", maxWidth: 260 }}>{msg}</p>
    </div>
  );
}
