import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { api, authFetch, formatCurrency, useCountUp } from "./shared";
import { useAppSettings } from "@/contexts/app-settings";
import { printBalanceSheet, type BalanceSheetPrintData } from "@/lib/export-pdf";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface BalanceSheetData {
  assets: { cash: number; receivables: number; inventory: number; total: number };
  liabilities: { payables: number; total: number };
  equity: { opening_capital: number; retained_earnings: number; total: number };
  total_liabilities_equity: number;
  pl_detail: { total_revenue: number; total_cogs: number; total_expenses: number };
  balanced: boolean;
  as_of: string;
  validation: { status: "OK" | "WARNING"; validation_message?: string };
}

const EMPTY_BS: BalanceSheetData = {
  assets:      { cash: 0, receivables: 0, inventory: 0, total: 0 },
  liabilities: { payables: 0, total: 0 },
  equity:      { opening_capital: 0, retained_earnings: 0, total: 0 },
  total_liabilities_equity: 0,
  pl_detail:   { total_revenue: 0, total_cogs: 0, total_expenses: 0 },
  balanced: true,
  as_of: new Date().toISOString().split("T")[0],
  validation: { status: "OK" },
};

/* ── KPI Card ──────────────────────────────────────────────────────────── */
function BsKPICard({ label, hint, value, variant }: {
  label: string; hint: string; value: number;
  variant: "green" | "red" | "amber" | "balanced";
}) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const animated = useCountUp(value);

  const colors = {
    green:    { clr: "#059669", bg: isLight ? "#f0fdf4" : "rgba(5,150,105,0.08)",    bdr: isLight ? "#bbf7d0" : "rgba(5,150,105,0.20)" },
    red:      { clr: "#dc2626", bg: isLight ? "#fef2f2" : "rgba(220,38,38,0.08)",    bdr: isLight ? "#fecaca" : "rgba(220,38,38,0.20)" },
    amber:    { clr: "#d97706", bg: isLight ? "#fffbeb" : "rgba(245,158,11,0.08)",   bdr: isLight ? "#fde68a" : "rgba(245,158,11,0.20)" },
    balanced: { clr: "#059669", bg: isLight ? "#f0fdf4" : "rgba(5,150,105,0.08)",    bdr: isLight ? "#bbf7d0" : "rgba(5,150,105,0.20)" },
  }[variant];

  const txtHint = isLight ? "#9ca3af" : "rgba(255,255,255,0.35)";

  return (
    <div className="rpt-panel rounded-2xl p-4" style={{ border: `1px solid ${colors.bdr}`, background: colors.bg }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: colors.clr, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 10, color: txtHint, marginBottom: 8 }}>{hint}</p>
      <p style={{ fontSize: 19, fontWeight: 900, color: colors.clr, fontVariantNumeric: "tabular-nums" }}>
        {formatCurrency(animated)}
      </p>
    </div>
  );
}

/* ── Balance Equation Badge ─────────────────────────────────────────────── */
function BalanceBadge({ balanced }: { balanced: boolean }) {
  return balanced ? (
    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: "rgba(5,150,105,0.10)", border: "1px solid rgba(5,150,105,0.25)" }}>
      <CheckCircle className="w-3.5 h-3.5" style={{ color: "#059669" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#059669" }}>الميزانية متوازنة ✓</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.25)" }}>
      <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>تحذير: الميزانية غير متوازنة</span>
    </div>
  );
}

/* ── Accounting Statement Helpers ───────────────────────────────────────── */
function SectionHd({ label, hint }: { label: string; hint?: string }) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const bg   = isLight ? "#1e293b" : "#1e293b";
  const sub  = isLight ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.45)";
  return (
    <tr>
      <td colSpan={2} style={{ background: bg, color: "#f8fafc", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", padding: "8px 16px", borderBottom: "none" }}>
        {label}
        {hint && <span style={{ fontSize: 10, fontWeight: 400, marginRight: 8, color: sub }}>{hint}</span>}
      </td>
    </tr>
  );
}

function ChildRow({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const txtMain = isLight ? "#374151" : "rgba(255,255,255,0.80)";
  const txtDim  = isLight ? "#9ca3af" : "rgba(255,255,255,0.35)";
  const bdColor = isLight ? "#f3f4f6" : "rgba(255,255,255,0.05)";
  return (
    <tr>
      <td style={{ paddingRight: 36, paddingLeft: 16, paddingTop: 9, paddingBottom: 9, fontSize: 12.5, color: dim ? txtDim : txtMain, borderBottom: `1px solid ${bdColor}` }}>
        {label}
      </td>
      <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 13, color: dim ? txtDim : txtMain, paddingLeft: 20, paddingRight: 16, borderBottom: `1px solid ${bdColor}` }}>
        {Number(value).toFixed(2)}
      </td>
    </tr>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const clr = accent ?? "#d97706";
  const bg  = isLight ? `${clr}14` : `${clr}1a`;
  const bdr = isLight ? `${clr}40` : `${clr}35`;
  return (
    <tr>
      <td style={{ fontWeight: 800, fontSize: 13.5, background: bg, color: clr, borderTop: `2px solid ${bdr}`, borderBottom: `2px solid ${bdr}`, padding: "10px 16px" }}>
        {label}
      </td>
      <td style={{ textAlign: "left", fontWeight: 800, fontSize: 13.5, background: bg, color: clr, borderTop: `2px solid ${bdr}`, borderBottom: `2px solid ${bdr}`, padding: "10px 16px", fontVariantNumeric: "tabular-nums" }}>
        {Number(value).toFixed(2)}
      </td>
    </tr>
  );
}

function NetRow({ label, value, isPositive }: { label: string; value: number; isPositive: boolean }) {
  const clr = isPositive ? "#059669" : "#dc2626";
  const bg  = isPositive ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)";
  const bdr = isPositive ? "#059669" : "#dc2626";
  return (
    <tr>
      <td style={{ fontWeight: 900, fontSize: 16, background: bg, color: clr, borderTop: `2px solid ${bdr}`, padding: "13px 16px" }}>
        {label}
      </td>
      <td style={{ textAlign: "left", fontWeight: 900, fontSize: 16, background: bg, color: clr, borderTop: `2px solid ${bdr}`, padding: "13px 16px", fontVariantNumeric: "tabular-nums" }}>
        {Number(value).toFixed(2)}
      </td>
    </tr>
  );
}

function Spacer() {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  return (
    <tr>
      <td colSpan={2} style={{ height: 1, background: isLight ? "#e5e7eb" : "rgba(255,255,255,0.07)", padding: 0 }} />
    </tr>
  );
}

/* ── Accounting Statement ───────────────────────────────────────────────── */
function BalanceSheetStatement({ data }: { data: BalanceSheetData }) {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  const panelBg = isLight ? "#ffffff" : "rgba(255,255,255,0.03)";
  const panelBdr = isLight ? "#e5e7eb" : "rgba(255,255,255,0.08)";
  const symColor = isLight ? "#6b7280" : "rgba(255,255,255,0.35)";
  const retainedIsPos = data.equity.retained_earnings >= 0;

  return (
    <div className="rpt-panel rounded-2xl overflow-hidden" style={{ border: `1px solid ${panelBdr}`, background: panelBg }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Tajawal','Cairo',sans-serif" }}>
        <colgroup>
          <col style={{ width: "70%" }} />
          <col style={{ width: "30%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 10, fontWeight: 700, color: symColor, letterSpacing: "0.06em", borderBottom: `1px solid ${panelBdr}` }}>
              البيان
            </th>
            <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, fontWeight: 700, color: symColor, letterSpacing: "0.06em", borderBottom: `1px solid ${panelBdr}` }}>
              المبلغ
            </th>
          </tr>
        </thead>
        <tbody>

          {/* ── قسم الأصول ── */}
          <SectionHd label="الأصول" hint="(Assets)" />
          <ChildRow label="النقدية — أرصدة الخزن الحالية" value={data.assets.cash} />
          <ChildRow label="ذمم العملاء المدينة — أرصدة العملاء الموجبة" value={data.assets.receivables} />
          <ChildRow label="المخزون — الكمية × سعر التكلفة" value={data.assets.inventory} />
          <TotalRow label="= إجمالي الأصول" value={data.assets.total} accent="#d97706" />

          <Spacer />

          {/* ── قسم الخصوم ── */}
          <SectionHd label="الخصوم" hint="(Liabilities)" />
          <ChildRow label="ذمم الموردين الدائنة — أرصدة الموردين الموجبة" value={data.liabilities.payables} />
          {data.liabilities.total === 0 && (
            <ChildRow label="لا توجد خصوم مسجّلة" value={0} dim />
          )}
          <TotalRow label="= إجمالي الخصوم" value={data.liabilities.total} accent="#6b7280" />

          <Spacer />

          {/* ── قسم حقوق الملكية ── */}
          <SectionHd label="حقوق الملكية" hint="(Equity)" />
          <ChildRow label="رأس المال المفتوح — الأرصدة الافتتاحية" value={data.equity.opening_capital} />
          <ChildRow
            label={`الأرباح المحتجزة — صافي ربح كلي (الإيراد − التكلفة − المصروفات)`}
            value={data.equity.retained_earnings}
          />
          <TotalRow label="= إجمالي حقوق الملكية" value={data.equity.total} accent={data.equity.total >= 0 ? "#059669" : "#dc2626"} />

          <Spacer />

          {/* ── معادلة التوازن ── */}
          <NetRow
            label="= إجمالي الخصوم + حقوق الملكية"
            value={data.total_liabilities_equity}
            isPositive={data.balanced}
          />

        </tbody>
      </table>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function BalanceSheetReport() {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";

  const { data: raw, isLoading, error } = useQuery<BalanceSheetData>({
    queryKey: ["balance-sheet"],
    queryFn: () => authFetch(`${api}/reports/balance-sheet`).then(r => r.json()),
    staleTime: 60_000,
  });

  const data: BalanceSheetData = { ...EMPTY_BS, ...raw };

  const txtSub  = isLight ? "#6b7280" : "rgba(255,255,255,0.40)";
  const txtMain = isLight ? "#111827" : "#ffffff";

  function handlePrint() {
    const printData: BalanceSheetPrintData = {
      assets:      data.assets,
      liabilities: data.liabilities,
      equity:      data.equity,
      total_liabilities_equity: data.total_liabilities_equity,
      balanced:    data.balanced,
      as_of:       data.as_of,
    };
    printBalanceSheet(printData);
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20" style={{ color: txtSub, fontFamily: "'Tajawal','Cairo',sans-serif" }}>
      <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full ml-3" />
      جاري تحميل الميزانية العمومية…
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center py-20 text-red-400 gap-2" style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}>
      <AlertTriangle className="w-5 h-5" />
      فشل تحميل البيانات — تحقق من الاتصال
    </div>
  );

  return (
    <div className="space-y-5" style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5" style={{ color: "#d97706" }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: txtMain }}>الميزانية العمومية</h2>
            <p style={{ fontSize: 11, color: txtSub, marginTop: 1 }}>
              المركز المالي في: {new Date(data.as_of).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <BalanceBadge balanced={data.balanced} />
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all"
            style={{ background: "#d97706", color: "#fff" }}
          >
            <TrendingUp className="w-4 h-4" />
            طباعة PDF
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BsKPICard
          label="إجمالي الأصول"
          hint="النقدية + الذمم + المخزون"
          value={data.assets.total}
          variant="amber"
        />
        <BsKPICard
          label="إجمالي الخصوم"
          hint="ذمم الموردين الدائنة"
          value={data.liabilities.total}
          variant="red"
        />
        <BsKPICard
          label="حقوق الملكية"
          hint="رأس المال + الأرباح المحتجزة"
          value={data.equity.total}
          variant={data.equity.total >= 0 ? "green" : "red"}
        />
      </div>

      {/* ── Accounting Statement ── */}
      <BalanceSheetStatement data={data} />

      {/* ── P&L Breakdown (for transparency) ── */}
      <div className="rpt-panel rounded-2xl p-4" style={{ border: `1px solid ${isLight ? "#e5e7eb" : "rgba(255,255,255,0.07)"}` }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: txtSub, marginBottom: 10, letterSpacing: "0.06em" }}>
          تفاصيل حساب الأرباح المحتجزة
        </p>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: "إجمالي الإيراد", val: data.pl_detail.total_revenue, clr: "#059669" },
            { label: "تكلفة البضاعة", val: data.pl_detail.total_cogs,    clr: "#dc2626" },
            { label: "المصروفات",      val: data.pl_detail.total_expenses, clr: "#dc2626" },
          ].map(({ label, val, clr }) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: txtSub, marginBottom: 3 }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: clr, fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(val)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Validation Warning ── */}
      {data.validation.status === "WARNING" && (
        <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#d97706" }}>تنبيه محاسبي</p>
            <p style={{ fontSize: 11, color: "#d97706", opacity: 0.8, marginTop: 2 }}>{data.validation.validation_message}</p>
          </div>
        </div>
      )}

    </div>
  );
}
