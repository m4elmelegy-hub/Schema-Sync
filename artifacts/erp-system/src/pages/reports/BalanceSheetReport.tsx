import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Scale, Printer, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Users, Truck, Package,
} from "lucide-react";
import { api, authFetch, formatCurrency, useCountUp, todayStr } from "./shared";
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

interface DrillCustomer { id: number; name: string; balance: string; is_supplier: boolean; }
interface DrillProduct  { id: number; name: string; quantity: string; cost_price: string; }

const EMPTY_BS: BalanceSheetData = {
  assets:      { cash: 0, receivables: 0, inventory: 0, total: 0 },
  liabilities: { payables: 0, total: 0 },
  equity:      { opening_capital: 0, retained_earnings: 0, total: 0 },
  total_liabilities_equity: 0,
  pl_detail:   { total_revenue: 0, total_cogs: 0, total_expenses: 0 },
  balanced:    true,
  as_of:       new Date().toISOString().split("T")[0],
  validation:  { status: "OK" },
};

/* ── Theme helper hook ──────────────────────────────────────────────────── */
function useTheme() {
  const { settings } = useAppSettings();
  const isLight = (settings.theme ?? "dark") === "light";
  return {
    isLight,
    txtMain:  isLight ? "#111827"        : "#f8fafc",
    txtSub:   isLight ? "#6b7280"        : "rgba(255,255,255,0.40)",
    txtBody:  isLight ? "#374151"        : "rgba(255,255,255,0.80)",
    txtDim:   isLight ? "#9ca3af"        : "rgba(255,255,255,0.35)",
    bdColor:  isLight ? "#f3f4f6"        : "rgba(255,255,255,0.05)",
    panelBg:  isLight ? "#ffffff"        : "rgba(255,255,255,0.03)",
    panelBdr: isLight ? "#e5e7eb"        : "rgba(255,255,255,0.08)",
    hdrBg:    "#1e293b",
  };
}

/* ── KPI Card ──────────────────────────────────────────────────────────── */
function BsKPICard({ label, hint, value, variant }: {
  label: string; hint: string; value: number;
  variant: "green" | "red" | "amber";
}) {
  const { isLight } = useTheme();
  const animated    = useCountUp(value);
  const colors = {
    green: { clr: "#059669", bg: isLight ? "#f0fdf4" : "rgba(5,150,105,0.08)",  bdr: isLight ? "#bbf7d0" : "rgba(5,150,105,0.20)" },
    red:   { clr: "#dc2626", bg: isLight ? "#fef2f2" : "rgba(220,38,38,0.08)",  bdr: isLight ? "#fecaca" : "rgba(220,38,38,0.20)" },
    amber: { clr: "#d97706", bg: isLight ? "#fffbeb" : "rgba(245,158,11,0.08)", bdr: isLight ? "#fde68a" : "rgba(245,158,11,0.20)" },
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

/* ── Balance badge ─────────────────────────────────────────────────────── */
function BalanceBadge({ balanced, diff }: { balanced: boolean; diff: number }) {
  if (balanced) return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5"
      style={{ background: "rgba(5,150,105,0.10)", border: "1px solid rgba(5,150,105,0.25)" }}>
      <CheckCircle className="w-3.5 h-3.5" style={{ color: "#059669" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#059669" }}>الميزانية متوازنة ✓</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5"
      style={{ background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.25)" }}>
      <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>
        ⚠️ يوجد فرق: {Math.abs(diff).toFixed(2)} ج.م
      </span>
    </div>
  );
}

/* ── Statement helpers ─────────────────────────────────────────────────── */
function SectionHd({ label, hint, accent }: { label: string; hint?: string; accent?: string }) {
  const { hdrBg } = useTheme();
  return (
    <tr>
      <td colSpan={2} style={{
        background: accent ?? hdrBg, color: "#f8fafc",
        fontWeight: 700, fontSize: 11, letterSpacing: "0.06em",
        padding: "8px 16px", borderBottom: "none",
        borderRight: accent ? `3px solid rgba(255,255,255,0.3)` : "none",
      }}>
        {label}
        {hint && <span style={{ fontSize: 10, fontWeight: 400, marginRight: 8, color: "rgba(255,255,255,0.50)" }}>{hint}</span>}
      </td>
    </tr>
  );
}

function SubSectionHd({ label }: { label: string }) {
  const { isLight, panelBdr } = useTheme();
  return (
    <tr>
      <td colSpan={2} style={{
        background: isLight ? "#f8fafc" : "rgba(255,255,255,0.04)",
        color: isLight ? "#374151" : "rgba(255,255,255,0.60)",
        fontWeight: 700, fontSize: 10.5, letterSpacing: "0.05em",
        padding: "6px 20px", borderBottom: `1px solid ${panelBdr}`,
        textTransform: "uppercase",
      }}>
        {label}
      </td>
    </tr>
  );
}

function ChildRow({
  label, value, dim, clickable, expanded, onToggle, Icon,
}: {
  label: string; value: number; dim?: boolean;
  clickable?: boolean; expanded?: boolean;
  onToggle?: () => void; Icon?: React.ElementType;
}) {
  const { txtBody, txtDim, bdColor, isLight } = useTheme();
  const txtColor = dim ? txtDim : txtBody;
  const hoverBg  = isLight ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.03)";
  return (
    <tr
      onClick={clickable ? onToggle : undefined}
      style={{ cursor: clickable ? "pointer" : "default" }}
      className={clickable ? "transition-colors" : ""}
      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = hoverBg; }}
      onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = ""; }}
    >
      <td style={{ paddingRight: 36, paddingLeft: 16, paddingTop: 9, paddingBottom: 9, fontSize: 12.5, color: txtColor, borderBottom: `1px solid ${bdColor}` }}>
        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 opacity-50" />}
          {label}
          {clickable && (
            <span style={{ fontSize: 10, color: "#d97706", fontWeight: 700, marginRight: 4 }}>
              {expanded ? "▲ إخفاء" : "▼ تفاصيل"}
            </span>
          )}
        </span>
      </td>
      <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 13, color: dim ? txtDim : txtBody, paddingLeft: 20, paddingRight: 16, borderBottom: `1px solid ${bdColor}` }}>
        {Number(value).toFixed(2)}
      </td>
    </tr>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const clr = accent ?? "#d97706";
  return (
    <tr>
      <td style={{ fontWeight: 800, fontSize: 13.5, background: `${clr}18`, color: clr, borderTop: `2px solid ${clr}40`, borderBottom: `2px solid ${clr}40`, padding: "10px 16px" }}>
        {label}
      </td>
      <td style={{ textAlign: "left", fontWeight: 800, fontSize: 13.5, background: `${clr}18`, color: clr, borderTop: `2px solid ${clr}40`, borderBottom: `2px solid ${clr}40`, padding: "10px 16px", fontVariantNumeric: "tabular-nums" }}>
        {Number(value).toFixed(2)}
      </td>
    </tr>
  );
}

function NetRow({ label, value, balanced }: { label: string; value: number; balanced: boolean }) {
  const clr = balanced ? "#059669" : "#dc2626";
  const bg  = balanced ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)";
  return (
    <tr>
      <td style={{ fontWeight: 900, fontSize: 16, background: bg, color: clr, borderTop: `2px solid ${clr}`, padding: "13px 16px" }}>
        {label}
      </td>
      <td style={{ textAlign: "left", fontWeight: 900, fontSize: 16, background: bg, color: clr, borderTop: `2px solid ${clr}`, padding: "13px 16px", fontVariantNumeric: "tabular-nums" }}>
        {Number(value).toFixed(2)}
      </td>
    </tr>
  );
}

function Spacer() {
  const { isLight } = useTheme();
  return (
    <tr>
      <td colSpan={2} style={{ height: 1, background: isLight ? "#e5e7eb" : "rgba(255,255,255,0.07)", padding: 0 }} />
    </tr>
  );
}

/* ── Drill-down panel (injected as a table row) ─────────────────────────── */
function DrillRow({ children }: { children: React.ReactNode }) {
  const { isLight } = useTheme();
  return (
    <tr>
      <td colSpan={2} style={{ padding: "0 12px 12px", background: isLight ? "#fafafa" : "rgba(255,255,255,0.02)" }}>
        {children}
      </td>
    </tr>
  );
}

function CustomerDrill({ isSupplier }: { isSupplier: boolean }) {
  const { isLight, txtSub, bdColor } = useTheme();
  const { data, isLoading } = useQuery<DrillCustomer[]>({
    queryKey: ["drill-customers", isSupplier],
    queryFn: () => authFetch(`${api}/customers`).then(r => r.json()),
    staleTime: 60_000,
  });

  const filtered = (data ?? []).filter(c =>
    c.is_supplier === isSupplier && Number(c.balance) > 0.001
  ).sort((a, b) => Number(b.balance) - Number(a.balance));

  if (isLoading) return <p style={{ fontSize: 11, color: txtSub, padding: "8px 4px" }}>جاري التحميل…</p>;
  if (!filtered.length) return <p style={{ fontSize: 11, color: txtSub, padding: "8px 4px" }}>لا توجد أرصدة مفتوحة</p>;

  return (
    <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${bdColor}`, marginTop: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, fontFamily: "'Tajawal','Cairo',sans-serif" }}>
        <thead>
          <tr style={{ background: isLight ? "#f3f4f6" : "rgba(255,255,255,0.05)" }}>
            <th style={{ textAlign: "right", padding: "5px 10px", color: txtSub, fontWeight: 700 }}>الاسم</th>
            <th style={{ textAlign: "left",  padding: "5px 10px", color: txtSub, fontWeight: 700 }}>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.id} style={{ borderTop: `1px solid ${bdColor}` }}>
              <td style={{ padding: "5px 10px", color: isLight ? "#374151" : "rgba(255,255,255,0.75)" }}>{c.name}</td>
              <td style={{ padding: "5px 10px", textAlign: "left", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#d97706" }}>
                {Number(c.balance).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: isLight ? "#f9fafb" : "rgba(255,255,255,0.04)", borderTop: `2px solid ${bdColor}` }}>
            <td style={{ padding: "5px 10px", fontWeight: 700, fontSize: 11, color: txtSub }}>الإجمالي ({filtered.length} {isSupplier ? "مورد" : "عميل"})</td>
            <td style={{ padding: "5px 10px", textAlign: "left", fontVariantNumeric: "tabular-nums", fontWeight: 800, color: "#d97706" }}>
              {filtered.reduce((s, c) => s + Number(c.balance), 0).toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function InventoryDrill() {
  const { isLight, txtSub, bdColor } = useTheme();
  const { data, isLoading } = useQuery<DrillProduct[]>({
    queryKey: ["drill-products"],
    queryFn: () => authFetch(`${api}/products`).then(r => r.json()),
    staleTime: 60_000,
  });

  const filtered = (data ?? [])
    .filter(p => Number(p.quantity) > 0)
    .map(p => ({ ...p, value: Number(p.quantity) * Number(p.cost_price) }))
    .sort((a, b) => b.value - a.value);

  if (isLoading) return <p style={{ fontSize: 11, color: txtSub, padding: "8px 4px" }}>جاري التحميل…</p>;
  if (!filtered.length) return <p style={{ fontSize: 11, color: txtSub, padding: "8px 4px" }}>لا يوجد مخزون حالياً</p>;

  return (
    <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${bdColor}`, marginTop: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, fontFamily: "'Tajawal','Cairo',sans-serif" }}>
        <thead>
          <tr style={{ background: isLight ? "#f3f4f6" : "rgba(255,255,255,0.05)" }}>
            <th style={{ textAlign: "right", padding: "5px 10px", color: txtSub, fontWeight: 700 }}>المنتج</th>
            <th style={{ textAlign: "center", padding: "5px 10px", color: txtSub, fontWeight: 700 }}>الكمية</th>
            <th style={{ textAlign: "center", padding: "5px 10px", color: txtSub, fontWeight: 700 }}>سعر التكلفة</th>
            <th style={{ textAlign: "left",   padding: "5px 10px", color: txtSub, fontWeight: 700 }}>القيمة</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.id} style={{ borderTop: `1px solid ${bdColor}` }}>
              <td style={{ padding: "5px 10px", color: isLight ? "#374151" : "rgba(255,255,255,0.75)" }}>{p.name}</td>
              <td style={{ padding: "5px 10px", textAlign: "center", color: isLight ? "#374151" : "rgba(255,255,255,0.75)" }}>{Number(p.quantity).toFixed(0)}</td>
              <td style={{ padding: "5px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: isLight ? "#374151" : "rgba(255,255,255,0.75)" }}>{Number(p.cost_price).toFixed(2)}</td>
              <td style={{ padding: "5px 10px", textAlign: "left", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#059669" }}>
                {p.value.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: isLight ? "#f9fafb" : "rgba(255,255,255,0.04)", borderTop: `2px solid ${bdColor}` }}>
            <td colSpan={3} style={{ padding: "5px 10px", fontWeight: 700, fontSize: 11, color: txtSub }}>إجمالي قيمة المخزون ({filtered.length} منتج)</td>
            <td style={{ padding: "5px 10px", textAlign: "left", fontVariantNumeric: "tabular-nums", fontWeight: 800, color: "#059669" }}>
              {filtered.reduce((s, p) => s + p.value, 0).toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── Accounting Statement ───────────────────────────────────────────────── */
function BalanceSheetStatement({ data }: { data: BalanceSheetData }) {
  const { panelBg, panelBdr, txtSub } = useTheme();

  const [expandReceivables, setExpandReceivables] = useState(false);
  const [expandInventory,   setExpandInventory]   = useState(false);
  const [expandPayables,    setExpandPayables]     = useState(false);

  return (
    <div className="rpt-panel rounded-2xl overflow-hidden" style={{ border: `1px solid ${panelBdr}`, background: panelBg }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Tajawal','Cairo',sans-serif" }}>
        <colgroup>
          <col style={{ width: "68%" }} />
          <col style={{ width: "32%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 10, fontWeight: 700, color: txtSub, letterSpacing: "0.06em", borderBottom: `1px solid ${panelBdr}` }}>
              البيان
            </th>
            <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, fontWeight: 700, color: txtSub, letterSpacing: "0.06em", borderBottom: `1px solid ${panelBdr}` }}>
              المبلغ (ج.م)
            </th>
          </tr>
        </thead>
        <tbody>

          {/* ══════ الأصول ══════ */}
          <SectionHd label="الأصول" hint="Assets" />

          {/* الأصول المتداولة */}
          <SubSectionHd label="الأصول المتداولة — Current Assets" />
          <ChildRow label="النقدية — أرصدة الخزن الحالية" value={data.assets.cash} />
          <ChildRow
            label="ذمم العملاء المدينة"
            value={data.assets.receivables}
            clickable
            expanded={expandReceivables}
            onToggle={() => setExpandReceivables(v => !v)}
            Icon={Users}
          />
          {expandReceivables && (
            <DrillRow><CustomerDrill isSupplier={false} /></DrillRow>
          )}
          <ChildRow
            label="المخزون — الكمية × سعر التكلفة"
            value={data.assets.inventory}
            clickable
            expanded={expandInventory}
            onToggle={() => setExpandInventory(v => !v)}
            Icon={Package}
          />
          {expandInventory && (
            <DrillRow><InventoryDrill /></DrillRow>
          )}
          <TotalRow label="= إجمالي الأصول المتداولة" value={data.assets.total} accent="#d97706" />

          {/* الأصول غير المتداولة — فارغة في هذا النظام */}
          <SubSectionHd label="الأصول غير المتداولة — Fixed Assets" />
          <ChildRow label="أصول ثابتة — لا توجد في هذا النظام حالياً" value={0} dim />
          <TotalRow label="= إجمالي الأصول غير المتداولة" value={0} accent="#6b7280" />

          <TotalRow label="= إجمالي الأصول" value={data.assets.total} accent="#1e293b" />

          <Spacer />

          {/* ══════ الخصوم ══════ */}
          <SectionHd label="الخصوم" hint="Liabilities" />

          {/* الخصوم المتداولة */}
          <SubSectionHd label="الخصوم المتداولة — Current Liabilities" />
          <ChildRow
            label="ذمم الموردين الدائنة"
            value={data.liabilities.payables}
            clickable
            expanded={expandPayables}
            onToggle={() => setExpandPayables(v => !v)}
            Icon={Truck}
          />
          {expandPayables && (
            <DrillRow><CustomerDrill isSupplier={true} /></DrillRow>
          )}
          {data.liabilities.payables === 0 && (
            <ChildRow label="لا توجد ذمم موردين مستحقة" value={0} dim />
          )}
          <TotalRow label="= إجمالي الخصوم المتداولة" value={data.liabilities.payables} accent="#6b7280" />

          {/* الخصوم طويلة الأجل */}
          <SubSectionHd label="الخصوم طويلة الأجل — Long-term Liabilities" />
          <ChildRow label="التزامات طويلة الأجل — لا توجد حالياً" value={0} dim />
          <TotalRow label="= إجمالي الخصوم طويلة الأجل" value={0} accent="#6b7280" />

          <TotalRow label="= إجمالي الخصوم" value={data.liabilities.total} accent="#4b5563" />

          <Spacer />

          {/* ══════ حقوق الملكية ══════ */}
          <SectionHd label="حقوق الملكية" hint="Equity" />
          <ChildRow label="رأس المال المفتوح — الأرصدة الافتتاحية" value={data.equity.opening_capital} />
          <ChildRow
            label="الأرباح المحتجزة — صافي الربح الكلي (الإيراد − التكلفة − المصروفات)"
            value={data.equity.retained_earnings}
          />
          <TotalRow
            label="= إجمالي حقوق الملكية"
            value={data.equity.total}
            accent={data.equity.total >= 0 ? "#059669" : "#dc2626"}
          />

          <Spacer />

          {/* ══════ معادلة التوازن ══════ */}
          <NetRow
            label={`= إجمالي الخصوم + حقوق الملكية ${data.balanced ? "✓" : "⚠"}`}
            value={data.total_liabilities_equity}
            balanced={data.balanced}
          />

        </tbody>
      </table>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function BalanceSheetReport() {
  const { isLight, txtMain, txtSub, panelBdr } = useTheme();
  const [asOfDate, setAsOfDate] = useState(todayStr());

  const { data: raw, isLoading, error } = useQuery<BalanceSheetData>({
    queryKey: ["balance-sheet", asOfDate],
    queryFn: () => authFetch(`${api}/reports/balance-sheet`).then(r => r.json()),
    staleTime: 60_000,
  });

  const data: BalanceSheetData = { ...EMPTY_BS, ...raw };
  const diff = data.assets.total - data.total_liabilities_equity;

  function handlePrint() {
    const printData: BalanceSheetPrintData = {
      assets:      data.assets,
      liabilities: data.liabilities,
      equity:      data.equity,
      total_liabilities_equity: data.total_liabilities_equity,
      balanced:    data.balanced,
      as_of:       asOfDate,
    };
    printBalanceSheet(printData);
  }

  const asOfFormatted = new Date(asOfDate + "T00:00:00").toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });

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
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 shrink-0" style={{ color: "#d97706" }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: txtMain }}>الميزانية العمومية</h2>
            <p style={{ fontSize: 11, color: txtSub, marginTop: 2 }}>
              كما في تاريخ:&nbsp;
              <strong style={{ color: isLight ? "#374151" : "rgba(255,255,255,0.75)" }}>{asOfFormatted}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date picker */}
          <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: isLight ? "#f3f4f6" : "rgba(255,255,255,0.06)", border: `1px solid ${panelBdr}` }}>
            <span style={{ fontSize: 10, color: txtSub, fontWeight: 700 }}>كما في</span>
            <input
              type="date"
              value={asOfDate}
              max={todayStr()}
              onChange={e => setAsOfDate(e.target.value)}
              style={{
                background: "transparent", border: "none", outline: "none",
                color: txtMain, fontSize: 12, fontFamily: "'Tajawal','Cairo',sans-serif",
                direction: "ltr",
              }}
            />
          </div>

          <BalanceBadge balanced={data.balanced} diff={diff} />

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all hover:opacity-90"
            style={{ background: "#d97706", color: "#fff" }}
          >
            <Printer className="w-4 h-4" />
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

      {/* ── Unbalanced alert with exact difference ── */}
      {!data.balanced && (
        <div className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#dc2626" }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>
              الميزانية غير متوازنة — يوجد فرق: {Math.abs(diff).toFixed(2)} ج.م
            </p>
            <p style={{ fontSize: 11, color: "#dc2626", opacity: 0.75, marginTop: 3 }}>
              إجمالي الأصول ({data.assets.total.toFixed(2)}) ≠ الخصوم + حقوق الملكية ({data.total_liabilities_equity.toFixed(2)})
            </p>
          </div>
        </div>
      )}

      {/* ── Accounting Statement ── */}
      <BalanceSheetStatement data={data} />

      {/* ── P&L detail strip ── */}
      <div className="rpt-panel rounded-2xl p-4" style={{ border: `1px solid ${panelBdr}` }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: txtSub, marginBottom: 10, letterSpacing: "0.06em" }}>
          تفاصيل احتساب الأرباح المحتجزة
        </p>
        <div className="grid grid-cols-3 gap-4 text-center">
          {([
            { label: "إجمالي الإيراد",  val: data.pl_detail.total_revenue,  clr: "#059669" },
            { label: "(−) تكلفة البضاعة", val: data.pl_detail.total_cogs,    clr: "#dc2626" },
            { label: "(−) المصروفات",    val: data.pl_detail.total_expenses,  clr: "#dc2626" },
          ] as const).map(({ label, val, clr }) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: txtSub, marginBottom: 3 }}>{label}</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: clr, fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(val)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Accounting validation warning ── */}
      {data.validation.status === "WARNING" && (
        <div className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#d97706" }}>تنبيه محاسبي</p>
            <p style={{ fontSize: 11, color: "#d97706", opacity: 0.8, marginTop: 2 }}>
              {data.validation.validation_message}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
