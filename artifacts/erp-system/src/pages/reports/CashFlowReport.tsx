import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import {
  api, authFetch, formatCurrency, useCountUp,
  DateFilterBar, getDateRange, getPrevRange, DateMode, thisMonthStart, todayStr,
} from "./shared";
import { useAppSettings } from "@/contexts/app-settings";

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface CashFlowSummary {
  total_in: number; total_out: number; net_cash_flow: number;
  customer_receipts: number; receipts_in: number; cash_sales: number;
  deposits_in: number; payments_out: number; expenses_out: number;
}
interface CashFlowData {
  days: Array<{
    day: string; receipts_in: number; cash_sales: number; deposits_in: number;
    total_in: number; payments_out: number; expenses_out: number; total_out: number; net_flow: number;
  }>;
  summary: CashFlowSummary;
}
interface Safe { id: number; name: string; balance: string; }

const EMPTY_CF: CashFlowSummary = {
  total_in: 0, total_out: 0, net_cash_flow: 0,
  customer_receipts: 0, receipts_in: 0, cash_sales: 0,
  deposits_in: 0, payments_out: 0, expenses_out: 0,
};

function fmtAcct(n: number): string {
  const abs = formatCurrency(Math.abs(n));
  return n < 0 ? `(${abs})` : abs;
}

/* ── KPI Card ─────────────────────────────────────────────────────────────── */
function CfKPICard({ label, hint, value, variant, icon: Icon }: {
  label: string; hint: string; value: number;
  variant: "green" | "red" | "net"; icon: React.ElementType;
}) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const animated = useCountUp(value);
  const isPos    = value >= 0;

  const clr =
    variant === "green" ? "#059669" :
    variant === "red"   ? "#dc2626" :
    isPos ? "#059669" : "#dc2626";
  const bg =
    variant === "green" ? (isLight ? "#f0fdf4" : "rgba(5,150,105,0.08)") :
    variant === "red"   ? (isLight ? "#fef2f2" : "rgba(220,38,38,0.08)") :
    isPos ? (isLight ? "#f0fdf4" : "rgba(5,150,105,0.08)") : (isLight ? "#fef2f2" : "rgba(220,38,38,0.08)");
  const bdr =
    variant === "green" ? (isLight ? "#bbf7d0" : "rgba(5,150,105,0.20)") :
    variant === "red"   ? (isLight ? "#fecaca" : "rgba(220,38,38,0.20)") :
    isPos ? (isLight ? "#bbf7d0" : "rgba(5,150,105,0.20)") : (isLight ? "#fecaca" : "rgba(220,38,38,0.20)");
  const txtHint = isLight ? "#9ca3af" : "rgba(255,255,255,0.35)";

  return (
    <div className="rpt-panel rounded-2xl p-4" style={{ border: `1px solid ${bdr}`, background: bg }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color: clr }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: clr }}>{label}</span>
      </div>
      <p style={{ fontSize: 10, color: txtHint, marginBottom: 8 }}>{hint}</p>
      <p style={{ fontSize: 19, fontWeight: 900, color: clr, fontVariantNumeric: "tabular-nums" }}>
        {formatCurrency(animated)}
      </p>
    </div>
  );
}

/* ── Accounting Statement ─────────────────────────────────────────────────── */
function CashFlowStatement({
  cf, closingBalance, prevNetCf,
}: {
  cf: CashFlowSummary;
  closingBalance: number | null;
  prevNetCf: number | null;
}) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";

  const border    = isLight ? "#e5e7eb"              : "rgba(255,255,255,0.08)";
  const txtMain   = isLight ? "#111827"              : "rgba(255,255,255,0.90)";
  const txtSub    = isLight ? "#6b7280"              : "rgba(255,255,255,0.40)";
  const txtHint   = isLight ? "#9ca3af"              : "rgba(255,255,255,0.28)";
  const secBg     = isLight ? "#f8fafc"              : "rgba(255,255,255,0.03)";
  const totalBg   = isLight ? "#f1f5f9"              : "rgba(255,255,255,0.05)";
  const neutralClr = isLight ? "#4b5563"             : "rgba(255,255,255,0.55)";

  const netColor  = cf.net_cash_flow >= 0 ? "#059669" : "#dc2626";
  const netBg     = cf.net_cash_flow >= 0
    ? (isLight ? "#ecfdf5" : "rgba(5,150,105,0.12)")
    : (isLight ? "#fef2f2" : "rgba(220,38,38,0.12)");

  const openingBalance = closingBalance !== null ? closingBalance - cf.net_cash_flow : null;
  const operatingNet   = cf.customer_receipts - cf.payments_out - cf.expenses_out;
  const hasInvesting   = cf.deposits_in > 0;
  const showSubBreak   = cf.receipts_in > 0 && cf.cash_sales > 0;

  /* Comparison with previous period */
  const changeAmt  = prevNetCf !== null ? cf.net_cash_flow - prevNetCf : null;
  const changePct  = prevNetCf !== null && prevNetCf !== 0
    ? ((cf.net_cash_flow - prevNetCf) / Math.abs(prevNetCf)) * 100
    : null;
  const isImproved = changeAmt !== null && changeAmt >= 0;

  /* ── Cell helpers ── */
  const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: "10px 20px", borderBottom: `1px solid ${border}`,
    color: txtMain, fontSize: 13, verticalAlign: "middle", ...extra,
  });
  const cellNum = (extra?: React.CSSProperties): React.CSSProperties => ({
    ...cell(), textAlign: "left", fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap", fontWeight: 700, ...extra,
  });

  const SectionHd = ({ label, hint }: { label: string; hint?: string }) => (
    <tr style={{ background: secBg }}>
      <td colSpan={2} style={{ padding: "10px 20px 6px", borderTop: `2px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: txtMain, letterSpacing: "0.02em" }}>{label}</p>
        {hint && <p style={{ fontSize: 10, color: txtHint, marginTop: 2 }}>{hint}</p>}
      </td>
    </tr>
  );

  const ChildRow = ({ label, amount, color }: { label: string; amount: string; color?: string }) => (
    <tr>
      <td style={cell({ paddingRight: 36, color: txtSub, fontSize: 12.5 })}>{label}</td>
      <td style={cellNum({ color: color ?? txtSub, fontSize: 12.5 })}>{amount}</td>
    </tr>
  );

  const TotalRow = ({ label, amount, color, bg }: { label: string; amount: string; color?: string; bg?: string }) => (
    <tr style={{ background: bg ?? totalBg, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
      <td style={cell({ fontWeight: 700, color: color ?? txtMain, borderBottom: "none", borderTop: "none", paddingTop: 12, paddingBottom: 12 })}>{label}</td>
      <td style={cellNum({ fontWeight: 700, color: color ?? txtMain, borderBottom: "none", borderTop: "none", paddingTop: 12, paddingBottom: 12 })}>{amount}</td>
    </tr>
  );

  const Spacer = () => (
    <tr><td colSpan={2} style={{ height: 1, background: border, padding: 0 }} /></tr>
  );

  return (
    <div className="rpt-panel rounded-2xl overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: border }}>
        <div>
          <p className="rpt-strong font-bold text-sm">قائمة التدفقات النقدية</p>
          <p style={{ fontSize: 10, color: txtHint, marginTop: 2 }}>حركة النقد الفعلية · التحويلات بين الخزن مستثناة</p>
        </div>
        <span className="rpt-muted text-xs">بالجنيه المصري (ج.م)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: "62%" }} />
            <col style={{ width: "38%" }} />
          </colgroup>
          <tbody>

            {/* ══ رصيد أول الفترة ══ */}
            {openingBalance !== null && (
              <tr style={{ background: isLight ? "#fafafa" : "rgba(255,255,255,0.02)" }}>
                <td style={cell({ color: txtSub, fontSize: 12.5, fontStyle: "italic" })}>رصيد أول الفترة (الخزينة)</td>
                <td style={cellNum({ color: txtSub, fontSize: 12.5, fontStyle: "italic" })}>{formatCurrency(openingBalance)}</td>
              </tr>
            )}

            <Spacer />

            {/* ══ 1. التدفقات التشغيلية ══ */}
            <SectionHd label="التدفقات التشغيلية" hint="حركة النقد من النشاط الرئيسي للشركة" />

            <tr>
              <td style={cell({ fontWeight: 600 })}>مقبوضات من العملاء</td>
              <td style={cellNum({ color: "#059669" })}>{formatCurrency(cf.customer_receipts)}</td>
            </tr>
            {showSubBreak && <>
              <ChildRow label="  · سندات القبض المرحّلة" amount={formatCurrency(cf.receipts_in)}  color={txtSub} />
              <ChildRow label="  · مبيعات نقدية مباشرة"  amount={formatCurrency(cf.cash_sales)}   color={txtSub} />
            </>}

            <ChildRow
              label="(−) مدفوعات للموردين"
              amount={cf.payments_out > 0 ? `(${formatCurrency(cf.payments_out)})` : "لا يوجد"}
              color={cf.payments_out > 0 ? "#dc2626" : txtSub} />

            <ChildRow
              label="(−) مصروفات تشغيلية"
              amount={cf.expenses_out > 0 ? `(${formatCurrency(cf.expenses_out)})` : "لا يوجد"}
              color={cf.expenses_out > 0 ? "#dc2626" : txtSub} />

            <TotalRow
              label="= صافي التدفق التشغيلي"
              amount={fmtAcct(operatingNet)}
              color={operatingNet >= 0 ? "#059669" : "#dc2626"} />

            <Spacer />

            {/* ══ 2. التدفقات الاستثمارية (اختياري) ══ */}
            {hasInvesting && <>
              <SectionHd label="التدفقات الاستثمارية" hint="الإيداعات وحركة الأصول" />
              <ChildRow
                label="إيداعات"
                amount={formatCurrency(cf.deposits_in)}
                color={neutralClr} />
              <TotalRow
                label="= صافي التدفقات الاستثمارية"
                amount={formatCurrency(cf.deposits_in)}
                color={neutralClr} />
              <Spacer />
            </>}

            {/* ══ صافي التدفق النقدي ══ */}
            <tr style={{ background: netBg }}>
              <td style={cell({
                fontWeight: 800, fontSize: 20, color: netColor,
                borderBottom: "none", borderTop: `2px solid ${netColor}35`,
                paddingTop: 20, paddingBottom: changePct !== null ? 12 : 20,
              })}>
                <div>= صافي التدفق النقدي</div>
                {changePct !== null && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: isImproved ? "#059669" : "#dc2626", marginTop: 4, opacity: 0.85 }}>
                    {isImproved ? "↑" : "↓"} {Math.abs(changePct).toFixed(1)}% {isImproved ? "أعلى" : "أقل"} من الفترة السابقة
                  </div>
                )}
              </td>
              <td style={cellNum({
                fontWeight: 800, fontSize: 20, color: netColor,
                borderBottom: "none", borderTop: `2px solid ${netColor}35`,
                paddingTop: 20, paddingBottom: 20, verticalAlign: "middle",
              })}>
                {fmtAcct(cf.net_cash_flow)}
              </td>
            </tr>

            {/* ══ رصيد آخر الفترة ══ */}
            {closingBalance !== null && (
              <>
                <Spacer />
                <tr style={{ background: isLight ? "#f8fafc" : "rgba(255,255,255,0.03)" }}>
                  <td style={cell({ fontWeight: 700, color: txtMain, fontSize: 13 })}>= رصيد آخر الفترة (الخزينة)</td>
                  <td style={cellNum({ fontWeight: 700, color: txtMain, fontSize: 13 })}>{formatCurrency(closingBalance)}</td>
                </tr>
              </>
            )}

          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function CashFlowReport() {
  const [mode, setMode]             = useState<DateMode>("month");
  const [customFrom, setCustomFrom] = useState(thisMonthStart());
  const [customTo,   setCustomTo]   = useState(todayStr());
  const [dateFrom, dateTo]          = getDateRange(mode, customFrom, customTo);
  const [prevFrom, prevTo]          = getPrevRange(dateFrom, dateTo);

  /* ── Current period ── */
  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey:  ["/api/reports/cash-flow", dateFrom, dateTo],
    queryFn:   () => authFetch(api(`/api/reports/cash-flow?date_from=${dateFrom}&date_to=${dateTo}`)).then(r => r.json()),
    staleTime: 60_000,
  });

  /* ── Previous period (for comparison) ── */
  const { data: prevData } = useQuery<CashFlowData>({
    queryKey:  ["/api/reports/cash-flow", prevFrom, prevTo],
    queryFn:   () => authFetch(api(`/api/reports/cash-flow?date_from=${prevFrom}&date_to=${prevTo}`)).then(r => r.json()),
    staleTime: 300_000,
  });

  /* ── Safe balances (closing balance = current treasury total) ── */
  const { data: safes } = useQuery<Safe[]>({
    queryKey:  ["/api/settings/safes"],
    queryFn:   () => authFetch(api("/api/settings/safes")).then(r => r.json()),
    staleTime: 120_000,
  });

  const cf = { ...EMPTY_CF, ...(data?.summary ?? {}) };
  const prevNetCf      = prevData?.summary?.net_cash_flow ?? null;
  const closingBalance = useMemo(() => {
    if (!safes?.length) return null;
    return safes.reduce((s, safe) => s + Number(safe.balance ?? 0), 0);
  }, [safes]);

  const handlePdf = async () => {
    const { printCashFlow } = await import("@/lib/export-pdf");
    printCashFlow({
      ...cf,
      dateFrom, dateTo,
      closingBalance: closingBalance ?? undefined,
    });
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}>

      {/* ── Filter bar + PDF ── */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <DateFilterBar
          mode={mode} setMode={setMode}
          customFrom={customFrom} setCustomFrom={setCustomFrom}
          customTo={customTo}   setCustomTo={setCustomTo} />
        <button
          onClick={handlePdf}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all"
          style={{ background: "rgba(245,158,11,0.10)", borderColor: "rgba(245,158,11,0.30)", color: "#f59e0b" }}>
          طباعة PDF
        </button>
      </div>

      {/* ── KPI cards ── */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <div key={i} className="rpt-panel rounded-2xl p-4 h-20 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CfKPICard label="إجمالي الداخل النقدي"  hint="مقبوضات + مبيعات نقدية + إيداعات" value={cf.total_in}       variant="green" icon={TrendingUp} />
          <CfKPICard label="إجمالي الخارج النقدي"  hint="مدفوعات للموردين + مصروفات"        value={cf.total_out}      variant="red"   icon={TrendingDown} />
          <CfKPICard label="صافي التدفق النقدي"    hint="الداخل − الخارج"                   value={cf.net_cash_flow}  variant="net"   icon={Activity} />
        </div>
      )}

      {/* ── Accounting Statement ── */}
      {isLoading ? (
        <div className="rpt-panel rounded-2xl p-8 animate-pulse h-72" />
      ) : (
        <CashFlowStatement
          cf={cf}
          closingBalance={closingBalance}
          prevNetCf={prevNetCf} />
      )}

    </div>
  );
}
