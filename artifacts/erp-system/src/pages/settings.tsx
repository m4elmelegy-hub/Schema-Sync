import { useState, useRef, useCallback, useEffect } from "react";
import { safeArray } from "@/lib/safe-data";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useGetSettingsUsers, useCreateSettingsUser, useUpdateSettingsUser, useDeleteSettingsUser,
  useGetSettingsSafes, useGetSettingsWarehouses,
  useResetDatabase,
  useGetProducts, useGetCustomers,
} from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { formatCurrency, formatDate, formatCurrencyPreview } from "@/lib/format";
import {
  useAppSettings, CURRENCIES, FONTS,
  type CurrencyCode, type FontFamily, type NumberFormat, type LightVariant,
} from "@/contexts/app-settings";
import {
  Users, AlertTriangle, Plus, Trash2, Edit2, X, Check,
  ArrowLeftRight, Eye, EyeOff, Save, DollarSign, Database,
  Upload, Download, RefreshCcw, Building2, Loader2, CheckCircle2,
  HardDrive, History, BookOpen, Package, UserCircle, Truck, Banknote,
  ChevronDown, ChevronRight, Shield, Store, CaseSensitive, AlignLeft, Sun,
  Layers, RotateCcw, Search, Lock, LockOpen, ClipboardList, Calendar,
  AlertOctagon, CheckCircle, XCircle, Info,
} from "lucide-react";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

type Tab = "users" | "currency" | "backup" | "data" | "opening-balance" | "financial-lock";

const TAB_SECTIONS: { section: string; tabs: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] }[] = [
  {
    section: "الإدارة",
    tabs: [
      { id: "users", label: "المستخدمون", icon: Users },
    ],
  },
  {
    section: "المالية",
    tabs: [
      { id: "opening-balance", label: "أول المدة",         icon: BookOpen },
      { id: "financial-lock",  label: "إغلاق الفترات",    icon: Lock },
    ],
  },
  {
    section: "التخصيص",
    tabs: [
      { id: "currency",   label: "إعدادات المتجر", icon: Store },
    ],
  },
  {
    section: "النظام",
    tabs: [
      { id: "backup", label: "نسخ احتياطي", icon: HardDrive },
      { id: "data",   label: "البيانات",    icon: Database },
    ],
  },
];

const ROLES: Record<string, { label: string; badge: string; avatarBg: string; avatarText: string }> = {
  admin:       { label: "مدير النظام", badge: "text-red-400 bg-red-500/15 border-red-500/30",          avatarBg: "bg-red-500/20",    avatarText: "text-red-300" },
  manager:     { label: "مشرف",        badge: "text-purple-400 bg-purple-500/15 border-purple-500/30",  avatarBg: "bg-purple-500/20", avatarText: "text-purple-300" },
  cashier:     { label: "كاشير",       badge: "text-blue-400 bg-blue-500/15 border-blue-500/30",        avatarBg: "bg-blue-500/20",   avatarText: "text-blue-300" },
  salesperson: { label: "مندوب",       badge: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", avatarBg: "bg-emerald-500/20", avatarText: "text-emerald-300" },
};

interface PermEntry { key: string; label: string }
interface PermGroup  { key: string; label: string; color: string; permissions: PermEntry[] }

const PERMISSION_GROUPS: PermGroup[] = [
  {
    key: "sales", label: "المبيعات", color: "amber",
    permissions: [
      { key: "can_view_sales",   label: "عرض قائمة المبيعات" },
      { key: "can_create_sale",  label: "إنشاء فاتورة بيع" },
      { key: "can_cash_sale",    label: "بيع نقدي" },
      { key: "can_partial_sale", label: "بيع جزئي" },
      { key: "can_credit_sale",  label: "بيع آجل" },
      { key: "can_return_sale",  label: "إرجاع مبيعات" },
      { key: "can_cancel_sale",  label: "إلغاء فاتورة بيع" },
      { key: "can_edit_price",   label: "تعديل الأسعار" },
    ],
  },
  {
    key: "inventory", label: "المخزون والمشتريات", color: "blue",
    permissions: [
      { key: "can_view_products",    label: "عرض الأصناف" },
      { key: "can_manage_products",  label: "إدارة الأصناف (إضافة/تعديل/حذف)" },
      { key: "can_view_inventory",   label: "عرض المخزون" },
      { key: "can_adjust_inventory", label: "تسوية المخزون" },
      { key: "can_view_purchases",   label: "عرض قائمة المشتريات" },
      { key: "can_create_purchase",  label: "إنشاء فاتورة شراء" },
      { key: "can_cancel_purchase",  label: "إلغاء فاتورة شراء" },
    ],
  },
  {
    key: "customers", label: "العملاء", color: "emerald",
    permissions: [
      { key: "can_view_customers",   label: "عرض العملاء" },
      { key: "can_manage_customers", label: "إدارة العملاء (إضافة/تعديل/حذف)" },
    ],
  },
  {
    key: "finance", label: "المالية والخزينة", color: "violet",
    permissions: [
      { key: "can_view_treasury",       label: "عرض صفحة الخزينة" },
      { key: "can_view_expenses",       label: "عرض المصروفات" },
      { key: "can_add_expense",         label: "إضافة مصروف" },
      { key: "can_add_receipt_voucher", label: "سند قبض" },
      { key: "can_add_payment_voucher", label: "سند دفع" },
      { key: "can_close_shift",         label: "إقفال الخزنة / إنهاء الوردية" },
    ],
  },
  {
    key: "reports", label: "التقارير", color: "cyan",
    permissions: [
      { key: "can_view_reports", label: "عرض التقارير" },
    ],
  },
  {
    key: "system", label: "النظام", color: "red",
    permissions: [
      { key: "can_manage_users", label: "إدارة المستخدمين" },
    ],
  },
];

const PERMISSION_TEMPLATES: Record<string, Record<string, boolean>> = {
  admin: {
    can_view_sales:          true,
    can_create_sale:         true,  can_cash_sale:           true,
    can_partial_sale:        true,  can_credit_sale:         true,
    can_return_sale:         true,  can_cancel_sale:         true,
    can_edit_price:          true,
    can_view_purchases:      true,
    can_create_purchase:     true,  can_cancel_purchase:     true,
    can_view_products:       true,  can_manage_products:     true,
    can_view_inventory:      true,  can_adjust_inventory:    true,
    can_view_customers:      true,  can_manage_customers:    true,
    can_view_treasury:       true,
    can_view_expenses:       true,  can_add_expense:         true,
    can_add_receipt_voucher: true,  can_add_payment_voucher: true,
    can_close_shift:         true,
    can_view_reports:        true,
    can_manage_users:        true,
  },
  manager: {
    can_view_sales:          true,
    can_create_sale:         true,  can_cash_sale:           true,
    can_partial_sale:        true,  can_credit_sale:         true,
    can_return_sale:         true,  can_cancel_sale:         true,
    can_edit_price:          true,
    can_view_purchases:      true,
    can_create_purchase:     true,  can_cancel_purchase:     true,
    can_view_products:       true,  can_manage_products:     true,
    can_view_inventory:      true,  can_adjust_inventory:    true,
    can_view_customers:      true,  can_manage_customers:    true,
    can_view_treasury:       true,
    can_view_expenses:       true,  can_add_expense:         true,
    can_add_receipt_voucher: true,  can_add_payment_voucher: true,
    can_close_shift:         true,
    can_view_reports:        true,
    can_manage_users:        false,
  },
  salesperson: {
    can_view_sales:          true,
    can_create_sale:         true,  can_cash_sale:           true,
    can_partial_sale:        true,  can_credit_sale:         true,
    can_return_sale:         false, can_cancel_sale:         false,
    can_edit_price:          false,
    can_view_purchases:      false,
    can_create_purchase:     false, can_cancel_purchase:     false,
    can_view_products:       true,  can_manage_products:     false,
    can_view_inventory:      false, can_adjust_inventory:    false,
    can_view_customers:      true,  can_manage_customers:    false,
    can_view_treasury:       true,
    can_view_expenses:       false, can_add_expense:         false,
    can_add_receipt_voucher: false, can_add_payment_voucher: false,
    can_close_shift:         false,
    can_view_reports:        false,
    can_manage_users:        false,
  },
  cashier: {
    can_view_sales:          true,
    can_create_sale:         true,  can_cash_sale:           true,
    can_partial_sale:        false, can_credit_sale:         false,
    can_return_sale:         false, can_cancel_sale:         false,
    can_edit_price:          false,
    can_view_purchases:      false,
    can_create_purchase:     false, can_cancel_purchase:     false,
    can_view_products:       true,  can_manage_products:     false,
    can_view_inventory:      false, can_adjust_inventory:    false,
    can_view_customers:      true,  can_manage_customers:    false,
    can_view_treasury:       true,
    can_view_expenses:       true,  can_add_expense:         true,
    can_add_receipt_voucher: false, can_add_payment_voucher: false,
    can_close_shift:         true,
    can_view_reports:        false,
    can_manage_users:        false,
  },
};

const TEMPLATE_LABELS: { value: string; label: string }[] = [
  { value: "admin",       label: "مدير النظام — كل الصلاحيات" },
  { value: "manager",     label: "مشرف — كل الصلاحيات" },
  { value: "salesperson", label: "مندوب مبيعات — إنشاء فواتير فقط" },
  { value: "cashier",     label: "كاشير — إنشاء فواتير فقط" },
];

/* ─── Shared UI atoms ─── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--erp-text-3)" }}>{children}</label>;
}

function SInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all ${props.className ?? ""}`}
    />
  );
}

function SSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all appearance-none cursor-pointer ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
}

function PrimaryBtn({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
        bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-sm
        transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]
        active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed ${className}`}
    >{children}</button>
  );
}

function DangerBtn({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
        bg-red-600 hover:bg-red-700 text-white font-bold text-sm
        transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >{children}</button>
  );
}

function GhostBtn({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
        border border-white/15 text-white/60 hover:text-white hover:border-white/30
        font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 ${className}`}
    >{children}</button>
  );
}

/* ─── Modal Shell ─── */
function Modal({
  children, onClose, title, icon: Icon, maxWidth = "max-w-lg",
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  icon?: React.FC<{ className?: string }>;
  maxWidth?: string;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className={`rounded-2xl w-full ${maxWidth} border border-white/10 shadow-2xl flex flex-col`}
        style={{ background: "var(--erp-bg-card)", maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Icon className="w-4 h-4 text-amber-400" />
              </div>
            )}
            <h3 className="font-bold text-white text-base">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Page header ─── */
function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-lg font-black text-white">{title}</h2>
        {sub && <p className="text-white/40 text-sm mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─── Skeleton loader ─── */
function CardSkeleton() {
  return (
    <div className="border border-white/5 rounded-2xl p-5 animate-pulse space-y-3" style={{ background: "var(--erp-bg-card)" }}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/5 rounded w-2/3" />
          <div className="h-2.5 bg-white/5 rounded w-1/3" />
        </div>
      </div>
      <div className="h-2 bg-white/5 rounded" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PERMISSION GROUP CARD — toggle-switch based (Hybrid Modern)
   ══════════════════════════════════════════════════════════════════ */
const COLOR_MAP: Record<string, { header: string; badge: string; toggleOn: string }> = {
  amber:  { header: "border-amber-500/20",   badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",   toggleOn: "#f59e0b" },
  blue:   { header: "border-blue-500/20",    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",     toggleOn: "#3b82f6" },
  emerald:{ header: "border-emerald-500/20", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", toggleOn: "#10b981" },
  violet: { header: "border-violet-500/20",  badge: "bg-violet-500/15 text-violet-300 border-violet-500/30", toggleOn: "#8b5cf6" },
  cyan:   { header: "border-cyan-500/20",    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",     toggleOn: "#06b6d4" },
  red:    { header: "border-red-500/20",     badge: "bg-red-500/15 text-red-300 border-red-500/30",       toggleOn: "#ef4444" },
};

function PermToggle({ active, color }: { active: boolean; color: string }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.amber;
  return (
    <div
      style={{
        position: "relative",
        width: 36, height: 20, borderRadius: 99, flexShrink: 0,
        background: active ? c.toggleOn : "rgba(255,255,255,0.12)",
        transition: "background 0.2s ease",
      }}
    >
      <span style={{
        position: "absolute",
        top: 2, width: 16, height: 16, borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        transition: "left 0.2s ease, right 0.2s ease",
        ...(active ? { right: 2, left: "auto" } : { left: 2, right: "auto" }),
      }} />
    </div>
  );
}

function PermissionGroupCard({
  group,
  permissions,
  onChange,
}: {
  group: PermGroup;
  permissions: Record<string, boolean>;
  onChange: (key: string, val: boolean) => void;
}) {
  const [open, setOpen] = useState(true);

  const keys    = group.permissions.map(p => p.key);
  const onCount = keys.filter(k => permissions[k]).length;
  const allOn   = onCount === keys.length;

  const c = COLOR_MAP[group.color] ?? COLOR_MAP.amber;

  return (
    <div className={`rounded-xl border overflow-hidden ${c.header}`} style={{ background: "var(--erp-bg-card)" }}>
      {/* ── Section Header ── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none"
        style={{ borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none" }}
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-white text-sm">{group.label}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>
            {onCount} / {keys.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); keys.forEach(k => onChange(k, !allOn)); }}
            className="text-[11px] font-semibold transition-colors"
            style={{ color: "var(--erp-text-3)" }}
            title={allOn ? "إلغاء الكل" : "تحديد الكل"}
          >
            {allOn ? "إلغاء الكل" : "تحديد الكل"}
          </button>
          {open
            ? <ChevronDown className="w-4 h-4" style={{ color: "var(--erp-text-4)" }} />
            : <ChevronRight className="w-4 h-4" style={{ color: "var(--erp-text-4)" }} />
          }
        </div>
      </div>

      {/* ── Permission Rows — 2-column grid ── */}
      {open && (
        <div className="grid grid-cols-2 gap-px p-1">
          {group.permissions.map(p => {
            const active = !!permissions[p.key];
            return (
              <div
                key={p.key}
                role="button"
                tabIndex={0}
                onClick={() => onChange(p.key, !active)}
                onKeyDown={e => (e.key === "Enter" || e.key === " ") && onChange(p.key, !active)}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: active ? "rgba(255,255,255,0.04)" : "transparent",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? "rgba(255,255,255,0.04)" : "transparent"; }}
              >
                <span
                  className="text-xs leading-snug"
                  style={{
                    color: active ? "var(--erp-text-1)" : "var(--erp-text-3)",
                    fontWeight: active ? 600 : 400,
                    transition: "color 0.15s",
                  }}
                >
                  {p.label}
                </span>
                <PermToggle active={active} color={group.color} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SETTINGS ROOT
   ══════════════════════════════════════════════════════════════════ */
export default function Settings() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="flex gap-5" style={{ minHeight: 600 }}>
      {/* ── Sidebar ── */}
      <aside className="w-52 shrink-0">
        <div className="rounded-2xl overflow-hidden border border-white/5" style={{ background: "var(--erp-bg-card)" }}>
          <div className="px-4 pt-4 pb-3 border-b border-white/5">
            <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest">لوحة الإعدادات</p>
          </div>
          <nav className="p-2 space-y-0.5">
            {TAB_SECTIONS.flatMap(({ tabs }) => tabs).map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[13px] font-semibold transition-all border-r-[3px] ${
                    active
                      ? "bg-amber-500/10 text-amber-400 border-amber-500"
                      : "text-white/40 hover:text-white hover:bg-white/5 border-transparent"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 min-w-0">
        {tab === "users"           && <UsersTab />}
        {tab === "opening-balance" && <OpeningBalanceTab />}
        {tab === "financial-lock"  && <FinancialLockTab />}
        {tab === "currency"        && <CurrencyTab />}
        {tab === "backup"          && <BackupImportTab />}
        {tab === "data"            && <DataTab />}
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   USERS TAB
   ══════════════════════════════════════════════════════════════════ */
function getInitials(name: string) {
  const p = name.trim().split(" ");
  if (p.length >= 2) return p[0][0] + p[1][0];
  return name.slice(0, 2);
}

function UsersTab() {
  const { data: usersRaw, isLoading } = useGetSettingsUsers();
  const users = safeArray(usersRaw);
  const { data: warehousesRaw } = useGetSettingsWarehouses();
  const warehouses = safeArray(warehousesRaw);
  const { data: safesRaw } = useGetSettingsSafes();
  const safes = safeArray(safesRaw);
  const createUser = useCreateSettingsUser();
  const updateUser = useUpdateSettingsUser();
  const deleteUser = useDeleteSettingsUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [showPin, setShowPin]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [permSearch, setPermSearch] = useState("");
  const [form, setForm] = useState({
    name: "", username: "", pin: "0000", role: "cashier", permissions: {} as Record<string, boolean>,
    warehouse_id: "" as string, safe_id: "" as string, active: true,
  });

  const resetForm = () => {
    setForm({ name: "", username: "", pin: "0000", role: "cashier", permissions: {}, warehouse_id: "", safe_id: "", active: true });
    setEditId(null); setShowForm(false); setShowPin(false); setPermSearch("");
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.username.trim()) {
      toast({ title: "الاسم واسم المستخدم مطلوبان", variant: "destructive" }); return;
    }
    if ((form.role === "cashier" || form.role === "salesperson") && !form.warehouse_id) {
      toast({ title: "اختر المخزن أولاً", variant: "destructive" }); return;
    }
    if ((form.role === "cashier" || form.role === "salesperson") && !form.safe_id) {
      toast({ title: "اختر الخزنة أولاً", variant: "destructive" }); return;
    }
    const perms = JSON.stringify(form.permissions);
    const payload = {
      name: form.name, username: form.username, pin: form.pin,
      role: form.role, permissions: perms,
      warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null,
      safe_id: form.safe_id ? Number(form.safe_id) : null,
      active: form.active,
    };
    if (editId) {
      updateUser.mutate({ id: editId, body: payload }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم تعديل المستخدم" }); resetForm(); },
        onError: (e: any) => toast({ title: e?.message || "فشل التعديل", variant: "destructive" }),
      });
    } else {
      createUser.mutate(payload as any, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم إضافة المستخدم" }); resetForm(); },
        onError: (e: any) => toast({ title: e?.message || "فشل الإضافة", variant: "destructive" }),
      });
    }
  };

  const handleEdit = (u: any) => {
    let perms: Record<string, boolean> = {};
    try { perms = JSON.parse(u.permissions || "{}"); } catch {}
    setForm({
      name: u.name, username: u.username, pin: u.pin || "0000", role: u.role, permissions: perms,
      warehouse_id: u.warehouse_id ? String(u.warehouse_id) : "",
      safe_id: u.safe_id ? String(u.safe_id) : "",
      active: u.active !== false,
    });
    setEditId(u.id); setShowForm(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteUser.mutate(deleteTarget.id, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم حذف المستخدم" }); setDeleteTarget(null); },
      onError: () => toast({ title: "فشل الحذف", variant: "destructive" }),
    });
  };

  const pinStrength = (pin: string) => {
    if (pin.length < 4) return { w: "25%", color: "bg-red-500",    label: "ضعيف" };
    if (pin.length < 5) return { w: "50%", color: "bg-amber-500",  label: "مقبول" };
    if (pin.length < 6) return { w: "75%", color: "bg-blue-500",   label: "جيد" };
    return                     { w: "100%",color: "bg-emerald-500", label: "قوي" };
  };
  const ps = pinStrength(form.pin);

  return (
    <div>
      <PageHeader
        title="إدارة المستخدمين"
        sub="التحكم في حسابات المستخدمين وصلاحياتهم"
        action={
          <PrimaryBtn onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> إضافة مستخدم
          </PrimaryBtn>
        }
      />

      {/* User Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/40 font-semibold">لا يوجد مستخدمون</p>
          <p className="text-white/20 text-sm mt-1">أضف أول مستخدم للنظام</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u: any) => {
            const role = ROLES[u.role] ?? ROLES.cashier;
            return (
              <div
                key={u.id}
                className="group bg-[#111827] border border-white/5 hover:border-amber-500/20 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
              >
                {/* Avatar + name */}
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${role.avatarBg} flex items-center justify-center shrink-0`}>
                    <span className={`font-black text-lg ${role.avatarText}`}>{getInitials(u.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{u.name}</p>
                    <p className="text-white/40 text-xs font-mono mt-0.5">@{u.username}</p>
                  </div>
                </div>

                {/* Role badge + status */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${role.badge}`}>
                    {role.label}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                    u.active
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {u.active ? "نشط" : "موقوف"}
                  </span>
                  {(() => {
                    let perms: Record<string, boolean> = {};
                    try { perms = JSON.parse(u.permissions || "{}"); } catch {}
                    const count = Object.values(perms).filter(Boolean).length;
                    return count > 0 ? (
                      <span className="px-2 py-1 rounded-lg text-[11px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20">
                        ⚙ {count} مخصصة
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-white/5">
                  <button
                    onClick={() => handleEdit(u)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> تعديل
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {showForm && (
        <Modal
          title={editId ? "تعديل مستخدم" : "إضافة مستخدم جديد"}
          icon={Users}
          onClose={resetForm}
          maxWidth="max-w-xl"
        >
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>الاسم الكامل</FieldLabel>
                <SInput placeholder="أحمد محمد" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>اسم المستخدم</FieldLabel>
                <SInput placeholder="ahmed" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>رقم سري (PIN)</FieldLabel>
                <div className="relative">
                  <SInput
                    type={showPin ? "text" : "password"}
                    placeholder="0000" maxLength={6}
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
                  />
                  <button className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors" onClick={() => setShowPin(s => !s)}>
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${ps.color}`} style={{ width: ps.w }} />
                  </div>
                  <p className="text-[11px] text-white/30">قوة الرقم السري: <span className="text-white/60 font-semibold">{ps.label}</span></p>
                </div>
              </div>
              <div>
                <FieldLabel>الدور</FieldLabel>
                <SSelect value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="admin">مدير النظام</option>
                  <option value="manager">مشرف</option>
                  <option value="cashier">كاشير</option>
                  <option value="salesperson">مندوب مبيعات</option>
                </SSelect>
              </div>
              <div>
                <FieldLabel>
                  المخزن {(form.role === "cashier" || form.role === "salesperson") && <span className="text-red-400 mr-0.5">*</span>}
                </FieldLabel>
                <SSelect value={form.warehouse_id} onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}>
                  <option value="">اختر المخزن</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </SSelect>
              </div>
              <div>
                <FieldLabel>
                  الخزنة {(form.role === "cashier" || form.role === "salesperson") && <span className="text-red-400 mr-0.5">*</span>}
                </FieldLabel>
                <SSelect value={form.safe_id} onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
                  <option value="">اختر الخزنة</option>
                  {safes.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </SSelect>
              </div>
            </div>

            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div>
                <p className="text-white/80 text-sm font-semibold">المستخدم نشط</p>
                <p className="text-white/35 text-[11px]">{form.active ? "يمكنه تسجيل الدخول" : "لا يمكنه تسجيل الدخول"}</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${form.active ? "bg-emerald-500" : "bg-white/15"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${form.active ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              {/* ── قالب الصلاحيات ── */}
              <div>
                <FieldLabel>نوع المستخدم</FieldLabel>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SSelect
                      value=""
                      onChange={e => {
                        const tpl = PERMISSION_TEMPLATES[e.target.value];
                        if (tpl) setForm(f => ({ ...f, permissions: { ...tpl } }));
                      }}
                    >
                      <option value="" disabled>اختر قالباً لملء الصلاحيات تلقائياً...</option>
                      {TEMPLATE_LABELS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </SSelect>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const tpl = PERMISSION_TEMPLATES[form.role];
                      if (tpl) setForm(f => ({ ...f, permissions: { ...tpl } }));
                    }}
                    title="إعادة تعيين للصلاحيات الافتراضية بناءً على الدور"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 transition-all text-xs whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    إعادة تعيين
                  </button>
                </div>
                <p className="text-[10px] text-white/25 mt-1.5">يملأ مربعات الصلاحيات تلقائياً — يمكنك التعديل بعدها يدوياً</p>
              </div>

              {/* ── الصلاحيات المجمّعة ── */}
              <div>
                <FieldLabel>الصلاحيات</FieldLabel>

                {/* Search permissions */}
                <div className="relative mb-3">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--erp-text-4)" }} />
                  <SInput
                    placeholder="ابحث في الصلاحيات..."
                    value={permSearch}
                    onChange={e => setPermSearch(e.target.value)}
                    className="pr-9 text-xs"
                  />
                </div>

                {/* Permission groups */}
                {(() => {
                  const filtered = permSearch.trim()
                    ? PERMISSION_GROUPS.map(g => ({
                        ...g,
                        permissions: g.permissions.filter(p => p.label.includes(permSearch.trim())),
                      })).filter(g => g.permissions.length > 0)
                    : PERMISSION_GROUPS;
                  return filtered.length === 0 ? (
                    <p className="text-center py-4 text-xs" style={{ color: "var(--erp-text-4)" }}>لا توجد صلاحيات مطابقة</p>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map(group => (
                        <PermissionGroupCard
                          key={group.key}
                          group={group}
                          permissions={form.permissions}
                          onChange={(key, val) =>
                            setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: val } }))
                          }
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-white/8 shrink-0">
            <PrimaryBtn onClick={handleSubmit} className="flex-1" disabled={createUser.isPending || updateUser.isPending}>
              {(createUser.isPending || updateUser.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editId ? "حفظ التعديلات" : "إضافة المستخدم"}
            </PrimaryBtn>
            <GhostBtn onClick={resetForm} className="flex-1">إلغاء</GhostBtn>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <Modal title="تأكيد الحذف" icon={Trash2} onClose={() => setDeleteTarget(null)}>
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-white font-bold">هل تريد حذف هذا المستخدم؟</p>
              <p className="text-white/40 text-sm mt-1">سيتم حذف <span className="text-white font-semibold">{deleteTarget.name}</span> نهائياً</p>
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-white/8">
            <DangerBtn onClick={confirmDelete} className="flex-1" disabled={deleteUser.isPending}>
              {deleteUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              تأكيد الحذف
            </DangerBtn>
            <GhostBtn onClick={() => setDeleteTarget(null)} className="flex-1">إلغاء</GhostBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   CURRENCY TAB  (card selectors)
   ══════════════════════════════════════════════════════════════════ */
const CURRENCY_OPTIONS: { code: CurrencyCode; flag: string; label: string; symbol: string }[] = [
  { code: "EGP", flag: "🇪🇬", label: "جنيه مصري",    symbol: "ج.م" },
  { code: "SAR", flag: "🇸🇦", label: "ريال سعودي",   symbol: "ر.س" },
  { code: "AED", flag: "🇦🇪", label: "درهم إماراتي", symbol: "د.إ" },
  { code: "USD", flag: "🇺🇸", label: "دولار أمريكي", symbol: "$"   },
  { code: "KWD", flag: "🇰🇼", label: "دينار كويتي",  symbol: "د.ك" },
  { code: "BHD", flag: "🇧🇭", label: "دينار بحريني", symbol: "د.ب" },
];

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; preview: string; example: string }[] = [
  { value: "western",      label: "أرقام غربية",       preview: "1,234.56",   example: "1 2 3 … 9" },
  { value: "arabic-indic", label: "أرقام عربية-هندية", preview: "١٬٢٣٤٫٥٦", example: "١ ٢ ٣ … ٩" },
];

const FONT_WEIGHT_OPTIONS = [
  { value: 400, label: "عادي",   labelEn: "Regular", icon: "A" },
  { value: 500, label: "متوسط",  labelEn: "Medium",  icon: "A" },
  { value: 700, label: "عريض",   labelEn: "Bold",    icon: "A" },
] as const;

const STORE_FONT_OPTIONS: { key: FontFamily; label: string; preview: string }[] = [
  { key: "Cairo",   label: "القاهرة",  preview: "أبجد هوز — Cairo"   },
  { key: "Tajawal", label: "تجوال",    preview: "أبجد هوز — Tajawal" },
  { key: "Inter",   label: "Inter",    preview: "ABCD efgh — Inter"  },
];

function StoreSettingSection({ icon: Icon, title, children }: { icon: React.FC<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/5 rounded-2xl overflow-hidden" style={{ background: "var(--erp-bg-card)" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5">
        <Icon className="w-4 h-4 text-amber-400" />
        <p className="text-white/70 text-xs font-bold uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function CurrencyTab() {
  const { settings, update } = useAppSettings();
  const { toast } = useToast();
  const [localCurrency,    setLocalCurrency]    = useState<CurrencyCode>(settings.currency);
  const [localNumFmt,      setLocalNumFmt]      = useState<NumberFormat>(settings.numberFormat ?? "western");
  const [localFontFamily,  setLocalFontFamily]  = useState<FontFamily>(settings.fontFamily);
  const [localFontWeight,    setLocalFontWeight]    = useState<number>(settings.fontWeightNormal ?? 400);
  const [localLightVariant, setLocalLightVariant] = useState<LightVariant>(settings.lightVariant ?? "soft");
  const [saved,              setSaved]              = useState(false);

  const isLightMode = settings.theme === "light";
  const previewAmounts = [100, 1234.56, 50000, 999999];

  const handleSave = () => {
    update({
      currency: localCurrency,
      numberFormat: localNumFmt,
      fontFamily: localFontFamily,
      fontWeightNormal: localFontWeight,
      lightVariant: localLightVariant,
    });
    setSaved(true);
    toast({ title: "تم حفظ الإعدادات ✓", description: "تم تطبيق إعدادات المتجر على كامل النظام" });
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="إعدادات المتجر" sub="تخصيص العملة والأرقام والخطوط المستخدمة في النظام" />

      {/* ── قسم العملة ── */}
      <StoreSettingSection icon={DollarSign} title="إعدادات العملة">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CURRENCY_OPTIONS.map(o => {
            const active = localCurrency === o.code;
            return (
              <button
                key={o.code}
                onClick={() => setLocalCurrency(o.code)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-right transition-all hover:-translate-y-0.5 ${
                  active
                    ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                    : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}
              >
                <span className="text-2xl">{o.flag}</span>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${active ? "text-amber-400" : "text-white/80"}`}>{o.label}</p>
                  <p className="text-white/30 text-xs mt-0.5">{o.code} · {o.symbol}</p>
                </div>
                {active && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </StoreSettingSection>

      {/* ── قسم الأرقام ── */}
      <StoreSettingSection icon={CaseSensitive} title="إعدادات الأرقام">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {NUMBER_FORMAT_OPTIONS.map(o => {
            const active = localNumFmt === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setLocalNumFmt(o.value)}
                className={`flex items-center gap-4 p-4 rounded-xl border text-right transition-all ${
                  active
                    ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                    : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}
              >
                <div className="flex-1">
                  <p className={`font-bold text-sm ${active ? "text-amber-400" : "text-white/80"}`}>{o.label}</p>
                  <p className="text-white/30 text-xs mt-0.5">{o.example}</p>
                </div>
                <span className={`text-lg font-black ${active ? "text-amber-400" : "text-white/30"}`}>{o.preview}</span>
                {active && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Live Preview */}
        <div className="mt-4 bg-[#0D1424] rounded-xl p-4 border border-white/5">
          <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mb-3">معاينة مباشرة</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {previewAmounts.map(n => (
              <div key={n} className="bg-[#111827] rounded-lg p-2.5 text-center border border-white/5">
                <p className="text-amber-400 font-black text-sm">{formatCurrencyPreview(n, localCurrency, localNumFmt)}</p>
              </div>
            ))}
          </div>
        </div>
      </StoreSettingSection>

      {/* ── قسم الخطوط ── */}
      <StoreSettingSection icon={AlignLeft} title="إعدادات الخطوط">
        {/* Font Family */}
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-3">نوع الخط</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {STORE_FONT_OPTIONS.map(f => {
            const active = localFontFamily === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setLocalFontFamily(f.key)}
                className={`flex flex-col gap-1.5 p-4 rounded-xl border text-right transition-all ${
                  active
                    ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                    : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className={`font-bold text-sm ${active ? "text-amber-400" : "text-white/80"}`}>{f.label}</p>
                  {active && <Check className="w-4 h-4 text-amber-400" />}
                </div>
                <p
                  className="text-white/40 text-xs"
                  style={{ fontFamily: `'${f.key}', sans-serif` }}
                >
                  {f.preview}
                </p>
              </button>
            );
          })}
        </div>

        {/* Font Weight */}
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-3">وزن الخط</p>
        <div className="grid grid-cols-3 gap-3">
          {FONT_WEIGHT_OPTIONS.map(w => {
            const active = localFontWeight === w.value;
            return (
              <button
                key={w.value}
                onClick={() => setLocalFontWeight(w.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                  active
                    ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                    : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}
              >
                <span
                  className={`text-2xl ${active ? "text-amber-400" : "text-white/50"}`}
                  style={{
                    fontFamily: `'${localFontFamily}', sans-serif`,
                    fontWeight: w.value,
                  }}
                >
                  أ
                </span>
                <div className="text-center">
                  <p className={`font-bold text-xs ${active ? "text-amber-400" : "text-white/70"}`}>{w.label}</p>
                  <p className="text-white/25 text-[10px]">{w.labelEn} · {w.value}</p>
                </div>
                {active && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </button>
            );
          })}
        </div>
      </StoreSettingSection>

      {/* ── قسم مظهر الواجهة ── */}
      <StoreSettingSection icon={Sun} title="مظهر الواجهة الفاتحة">
        {!isLightMode ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[#1A2235] border border-white/5 text-center">
            <Sun className="w-4 h-4 text-white/20 shrink-0" />
            <p className="text-white/30 text-sm">
              فعّل الوضع الفاتح أولاً من زر تبديل الثيم في الشريط العلوي لتفعيل هذا الخيار
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Soft */}
            <button
              onClick={() => { setLocalLightVariant("soft"); update({ lightVariant: "soft" }); }}
              className={`relative flex flex-col gap-3 p-4 rounded-2xl border-2 text-right transition-all overflow-hidden ${
                localLightVariant === "soft"
                  ? "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                  : "border-gray-200 hover:border-amber-300"
              }`}
              style={{ background: "#FAFAFA" }}
            >
              {localLightVariant === "soft" && (
                <span className="absolute top-3 left-3 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </span>
              )}
              {/* Mini UI preview */}
              <div className="w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ background: "#FFFFFF" }}>
                <div className="h-5 flex items-center gap-1.5 px-2" style={{ background: "#F5F5F5", borderBottom: "1px solid #E5E7EB" }}>
                  <div className="w-8 h-1.5 rounded-full" style={{ background: "#E5E7EB" }} />
                  <div className="w-12 h-1.5 rounded-full" style={{ background: "#E5E7EB" }} />
                </div>
                <div className="p-2 flex gap-1.5">
                  <div className="flex-1 h-7 rounded-lg" style={{ background: "#F5F5F5", border: "1px solid #E5E7EB" }} />
                  <div className="flex-1 h-7 rounded-lg" style={{ background: "#F5F5F5", border: "1px solid #E5E7EB" }} />
                </div>
                <div className="px-2 pb-2">
                  <div className="h-12 rounded-lg" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }} />
                </div>
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">ناعم — Soft</p>
                <p className="text-gray-400 text-xs mt-0.5">خلفية كريمية هادئة، حدود خفيفة، ظلال ناعمة</p>
              </div>
            </button>

            {/* High Contrast */}
            <button
              onClick={() => { setLocalLightVariant("high-contrast"); update({ lightVariant: "high-contrast" }); }}
              className={`relative flex flex-col gap-3 p-4 rounded-2xl border-2 text-right transition-all overflow-hidden ${
                localLightVariant === "high-contrast"
                  ? "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                  : "border-gray-300 hover:border-amber-300"
              }`}
              style={{ background: "#FFFFFF" }}
            >
              {localLightVariant === "high-contrast" && (
                <span className="absolute top-3 left-3 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </span>
              )}
              {/* Mini UI preview */}
              <div className="w-full rounded-xl overflow-hidden border border-gray-400 shadow-md" style={{ background: "#FFFFFF" }}>
                <div className="h-5 flex items-center gap-1.5 px-2" style={{ background: "#E8EBF0", borderBottom: "1px solid #9CA3AF" }}>
                  <div className="w-8 h-1.5 rounded-full" style={{ background: "#6B7280" }} />
                  <div className="w-12 h-1.5 rounded-full" style={{ background: "#9CA3AF" }} />
                </div>
                <div className="p-2 flex gap-1.5">
                  <div className="flex-1 h-7 rounded-lg" style={{ background: "#FFFFFF", border: "1.5px solid #6B7280" }} />
                  <div className="flex-1 h-7 rounded-lg" style={{ background: "#FFFFFF", border: "1.5px solid #6B7280" }} />
                </div>
                <div className="px-2 pb-2">
                  <div className="h-12 rounded-lg" style={{ background: "#EDF2F7", border: "1.5px solid #9CA3AF" }} />
                </div>
              </div>
              <div>
                <p className="font-bold text-gray-800 text-sm">تباين عالٍ — High Contrast</p>
                <p className="text-gray-400 text-xs mt-0.5">خلفية بيضاء نقية، حدود داكنة، نصوص أكثر وضوحاً</p>
              </div>
            </button>
          </div>
        )}
      </StoreSettingSection>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
        style={{
          background: saved ? "rgba(52,211,153,0.9)" : "linear-gradient(to right, #F59E0B, #D97706)",
          color: "#000",
          boxShadow: saved ? "0 4px 20px rgba(52,211,153,0.3)" : "0 4px 20px rgba(245,158,11,0.25)",
        }}
      >
        {saved ? <><CheckCircle2 className="w-4 h-4" /> تم الحفظ</> : <><Save className="w-4 h-4" /> حفظ الإعدادات</>}
      </button>
      <p className="text-white/25 text-xs text-center">سيتم تطبيق التغييرات فوراً على جميع الشاشات والتقارير والفواتير</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BACKUP & IMPORT TAB
   ══════════════════════════════════════════════════════════════════ */
const BACKUP_MODULES_LIST = [
  { key: "sales",     icon: "🛍️", label: "المبيعات",         sub: "الفواتير، العملاء، المرتجعات",       url: "/api/sales" },
  { key: "purchases", icon: "🛒", label: "المشتريات",         sub: "فواتير المشتريات، المرتجعات",         url: "/api/purchases" },
  { key: "products",  icon: "📦", label: "المخزن",            sub: "الأصناف، الكميات، الحركات",          url: "/api/products" },
  { key: "treasury",  icon: "💰", label: "الخزينة",           sub: "الإيرادات، المصروفات، السندات",      url: "/api/financial-transactions" },
  { key: "customers", icon: "👥", label: "العملاء",            sub: "الأرصدة والبيانات",                  url: "/api/customers" },
  { key: "settings",  icon: "⚙️", label: "الإعدادات",         sub: "العملة والتفضيلات",                  url: null },
  { key: "reports",   icon: "📊", label: "التقارير المحفوظة", sub: "الإحصائيات والبيانات التاريخية",     url: null },
] as const;

const ACTIVITY_KEY  = "halal_erp_activity_log";
const LAST_BK_KEY   = "halal_erp_last_backup";
const SCHEDULE_KEY2 = "halal_erp_schedule";

interface ActivityEntry {
  id: string; date: string; type: "backup" | "import-products" | "import-purchases";
  file: string; status: string; user: string;
}

function loadActivityLog(): ActivityEntry[] {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"); } catch { return []; }
}
function pushActivity(e: Omit<ActivityEntry, "id">) {
  const log = loadActivityLog();
  log.unshift({ ...e, id: `${Date.now()}` });
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log.slice(0, 50))); } catch {}
}

interface PurchaseRow {
  idx: number; sku: string; name: string; quantity: string; unitPrice: string;
  supplier: string; invoiceNo: string; date: string; tax: string; discount: string;
  productId: number | null; errors: string[];
}

function BackupImportTab() {
  const { toast } = useToast();
  const [importSubTab, setImportSubTab] = useState<"products" | "purchases">("products");

  const [bkModules,  setBkModules]  = useState<Set<string>>(new Set(BACKUP_MODULES_LIST.map(m => m.key)));
  const [bkLoading,  setBkLoading]  = useState(false);
  const [bkProgress, setBkProgress] = useState(0);
  const [bkResult,   setBkResult]   = useState<{ name: string; size: string; count: number } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(() => localStorage.getItem(LAST_BK_KEY));
  const [schedule,   setSchedule]   = useState(() => localStorage.getItem(SCHEDULE_KEY2) || "none");

  const [prodImporting, setProdImporting] = useState(false);
  const [prodExporting, setProdExporting] = useState(false);
  const [prodResult,    setProdResult]    = useState<{ success: number; failed: number } | null>(null);
  const prodFileRef = useRef<HTMLInputElement>(null);

  const [purRows,       setPurRows]       = useState<PurchaseRow[]>([]);
  const [purParsed,     setPurParsed]     = useState(false);
  const [purLoading,    setPurLoading]    = useState(false);
  const [purConfirming, setPurConfirming] = useState(false);
  const [purResult,     setPurResult]     = useState<string | null>(null);
  const [purSupplier,   setPurSupplier]   = useState("");
  const [purPayType,    setPurPayType]    = useState<"cash" | "credit">("cash");
  const purFileRef = useRef<HTMLInputElement>(null);

  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() => loadActivityLog());
  const refreshLog = () => setActivityLog(loadActivityLog());

  const [fullBkLoading,  setFullBkLoading]  = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult,  setRestoreResult]  = useState<{ counts: Record<string, number>; meta: { file_version: string; file_date: string | null; is_legacy: boolean } } | null>(null);
  const [restoreError,   setRestoreError]   = useState<string | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  const [restoreModal,        setRestoreModal]        = useState(false);
  const [restoreConfirmText,  setRestoreConfirmText]  = useState("");
  const [restoreUnderstood,   setRestoreUnderstood]   = useState(false);
  const [pendingRestore,      setPendingRestore]      = useState<{
    fileName: string; parsed: unknown;
    version: string | null; date: string | null; tableCount: number;
  } | null>(null);

  type BackupRecord = { id: number; filename: string; size: number; trigger: string; created_at: string };
  const [backupList,        setBackupList]        = useState<BackupRecord[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [serverSchedule,    setServerSchedule]    = useState("none");
  const [serverDestination, setServerDestination] = useState("local");
  const [lastScheduled,     setLastScheduled]     = useState<string | null>(null);
  const [schedSaving,       setSchedSaving]       = useState(false);
  const [deletingBackup,    setDeletingBackup]    = useState<number | null>(null);
  const [serverBkLoading,   setServerBkLoading]   = useState(false);

  const loadBackupSettings = useCallback(async () => {
    try {
      const r = await authFetch(api("/api/backups/settings"));
      if (r.ok) {
        const d = await r.json() as { schedule: string; destination: string; last_scheduled: string | null };
        setServerSchedule(d.schedule ?? "none");
        setServerDestination(d.destination ?? "local");
        setLastScheduled(d.last_scheduled ?? null);
      }
    } catch {}
  }, []);

  const loadBackupList = useCallback(async () => {
    setBackupListLoading(true);
    try {
      const r = await authFetch(api("/api/backups"));
      if (r.ok) setBackupList(await r.json() as BackupRecord[]);
    } catch {} finally {
      setBackupListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackupSettings();
    void loadBackupList();
  }, [loadBackupSettings, loadBackupList]);

  const handleSaveSchedule = async (sched: string, dest: string) => {
    setSchedSaving(true);
    try {
      const r = await authFetch(api("/api/backups/settings"), {
        method: "PUT",
        body: JSON.stringify({ schedule: sched, destination: dest }),
      });
      if (r.ok) {
        setServerSchedule(sched);
        setServerDestination(dest);
        toast({ title: "✅ تم حفظ إعدادات الجدولة" });
      }
    } catch {} finally { setSchedSaving(false); }
  };

  const handleDeleteBackup = async (id: number) => {
    setDeletingBackup(id);
    try {
      const r = await authFetch(api(`/api/backups/${id}`), { method: "DELETE" });
      if (r.ok) {
        setBackupList(prev => prev.filter(b => b.id !== id));
        toast({ title: "تم حذف النسخة الاحتياطية" });
      }
    } catch {} finally { setDeletingBackup(null); }
  };

  const handleDownloadBackupById = async (id: number, filename: string) => {
    try {
      const r = await authFetch(api(`/api/backups/${id}/download`));
      if (!r.ok) { toast({ title: "فشل تنزيل الملف", variant: "destructive" }); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { toast({ title: "خطأ في التنزيل", variant: "destructive" }); }
  };

  const handleServerManualBackup = async () => {
    setServerBkLoading(true);
    try {
      const r = await authFetch(api("/api/backups"), { method: "POST" });
      if (r.ok) {
        toast({ title: "✅ تم حفظ النسخة الاحتياطية على الخادم" });
        void loadBackupList();
        void loadBackupSettings();
      } else {
        const d = await r.json().catch(() => ({ error: "فشل" })) as { error?: string };
        toast({ title: d.error ?? "فشل إنشاء النسخة", variant: "destructive" });
      }
    } catch { toast({ title: "خطأ في الاتصال", variant: "destructive" }); } finally { setServerBkLoading(false); }
  };

  function getNextBackupTime(sched: string, lastRun: string | null): string | null {
    if (!lastRun || sched === "none") return null;
    const last = new Date(lastRun);
    const hours = sched === "daily" ? 24 : sched === "weekly" ? 24 * 7 : 24 * 30;
    return new Date(last.getTime() + hours * 3600 * 1000).toLocaleString("ar-EG");
  }

  function formatBackupTrigger(trigger: string): string {
    const map: Record<string, string> = {
      login: "تسجيل دخول", logout: "تسجيل خروج",
      sale_post: "ترحيل مبيعات", purchase_post: "ترحيل مشتريات",
      scheduled: "جدولة تلقائية", manual: "يدوي",
    };
    return map[trigger] ?? trigger;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  const toggleModule = (key: string) => setBkModules(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
  });
  const toggleAllModules = () =>
    setBkModules(bkModules.size === BACKUP_MODULES_LIST.length ? new Set() : new Set(BACKUP_MODULES_LIST.map(m => m.key)));

  const handleBackup = async () => {
    if (bkModules.size === 0) { toast({ title: "اختر وحدة واحدة على الأقل", variant: "destructive" }); return; }
    setBkLoading(true); setBkProgress(5); setBkResult(null);
    try {
      const selected = BACKUP_MODULES_LIST.filter(m => bkModules.has(m.key));
      const bundle: Record<string, unknown> = {
        version: "1.0", created_at: new Date().toISOString(), app: "Halal Tech ERP",
        modules: selected.map(m => m.label),
      };
      const step = Math.floor(75 / selected.length);
      for (const mod of selected) {
        setBkProgress(p => Math.min(p + step, 85));
        if (mod.url) {
          try {
            const res = await authFetch(api(mod.url));
            bundle[mod.key] = res.ok ? await res.json() : [];
          } catch { bundle[mod.key] = []; }
        } else if (mod.key === "settings") {
          try { bundle[mod.key] = JSON.parse(localStorage.getItem("halal_erp_settings") || "{}"); } catch { bundle[mod.key] = {}; }
        } else { bundle[mod.key] = null; }
      }
      setBkProgress(90);
      const json  = JSON.stringify(bundle, null, 2);
      const blob  = new Blob([json], { type: "application/json" });
      const dt    = new Date().toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
      const fname = `backup_${dt}.json`;
      const link  = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = fname; link.click();
      URL.revokeObjectURL(link.href);
      const sizekb = (blob.size / 1024).toFixed(1);
      setBkResult({ name: fname, size: `${sizekb} KB`, count: selected.length });
      setBkProgress(100);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BK_KEY, now); setLastBackup(now);
      pushActivity({ date: now, type: "backup", file: fname, status: `✅ ${selected.length} وحدات`, user: "Admin" });
      refreshLog();
      toast({ title: `✅ تم إنشاء النسخة الاحتياطية — ${fname}` });
    } catch { toast({ title: "فشل إنشاء النسخة الاحتياطية", variant: "destructive" }); }
    finally { setBkLoading(false); setTimeout(() => setBkProgress(0), 1500); }
  };

  const lastBackupLabel = () => {
    if (!lastBackup) return "لم يتم إنشاء نسخة بعد";
    const days = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000);
    if (days === 0) return "اليوم";
    if (days === 1) return "منذ يوم واحد";
    if (days < 30)  return `منذ ${days} أيام`;
    return new Date(lastBackup).toLocaleDateString("ar-EG");
  };

  const handleFullBackup = async () => {
    setFullBkLoading(true);
    try {
      const res = await authFetch(api("/api/system/backup"), { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd   = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const fname = match ? match[1] : `halal-tech-backup_${new Date().toISOString().slice(0, 10)}.json`;
      const link  = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = fname; link.click();
      URL.revokeObjectURL(link.href);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BK_KEY, now); setLastBackup(now);
      pushActivity({ date: now, type: "backup", file: fname, status: "✅ نسخة كاملة", user: "Admin" });
      refreshLog();
      toast({ title: `✅ تم تنزيل النسخة الكاملة — ${fname}` });
    } catch (e) {
      toast({ title: "فشل إنشاء النسخة الكاملة", description: String(e), variant: "destructive" });
    } finally { setFullBkLoading(false); }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = "";
    if (!file.name.endsWith(".json")) {
      toast({ title: "يجب اختيار ملف JSON", variant: "destructive" }); return;
    }
    try {
      const text   = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const version    = typeof parsed.version === "string" ? parsed.version : null;
      const date       = typeof parsed.created_at === "string" ? parsed.created_at : null;
      const dataSection = (parsed.data ?? parsed.tables ?? parsed) as Record<string, unknown>;
      const tableCount  = Object.values(dataSection).filter(Array.isArray).length;
      setPendingRestore({ fileName: file.name, parsed, version, date, tableCount });
      setRestoreConfirmText(""); setRestoreUnderstood(false);
      setRestoreModal(true);
    } catch {
      toast({ title: "ملف JSON غير صالح", variant: "destructive" });
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoreModal(false);
    setRestoreLoading(true); setRestoreResult(null); setRestoreError(null);
    try {
      const res = await authFetch(api("/api/system/restore"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingRestore.parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل الاستعادة");
      setRestoreResult({ counts: data.counts ?? {}, meta: data.meta ?? { file_version: "legacy", file_date: null, is_legacy: true } });
      pushActivity({ date: new Date().toISOString(), type: "backup", file: pendingRestore.fileName, status: "✅ استعادة ناجحة", user: "Admin" });
      refreshLog();
      toast({ title: "✅ تمت استعادة النسخة الاحتياطية بنجاح" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRestoreError(msg);
      toast({ title: "فشل الاستعادة", description: msg, variant: "destructive" });
    } finally { setRestoreLoading(false); setPendingRestore(null); }
  };

  const handleProductsExport = async () => {
    setProdExporting(true);
    try {
      const res = await authFetch(api("/api/products"));
      const prods = await res.json();
      const rows = prods.map((p: any) => ({
        "اسم الصنف": p.name, "كود الصنف (SKU)": p.sku || "", "التصنيف": p.category || "",
        "الكمية": Number(p.quantity), "سعر التكلفة": Number(p.cost_price),
        "سعر البيع": Number(p.sale_price), "حد التنبيه": p.low_stock_threshold || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
      XLSX.writeFile(wb, `halal-tech-products-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: `تم تصدير ${prods.length} صنف بنجاح` });
    } catch { toast({ title: "فشل التصدير", variant: "destructive" }); }
    finally { setProdExporting(false); }
  };

  const handleProductsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setProdImporting(true); setProdResult(null);
    try {
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];
      let success = 0, failed = 0;
      for (const row of rows) {
        const name = row["اسم الصنف"] || row["name"] || row["Name"];
        if (!name) { failed++; continue; }
        try {
          const res = await authFetch(api("/api/products"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: String(name), sku: String(row["كود الصنف (SKU)"] || row["sku"] || ""),
              category: String(row["التصنيف"] || row["category"] || ""),
              quantity: Number(row["الكمية"] || row["quantity"] || 0),
              cost_price: Number(row["سعر التكلفة"] || row["cost_price"] || 0),
              sale_price: Number(row["سعر البيع"] || row["sale_price"] || 0),
              low_stock_threshold: row["حد التنبيه"] ? Number(row["حد التنبيه"]) : undefined,
            }),
          });
          if (res.ok) success++; else failed++;
        } catch { failed++; }
      }
      setProdResult({ success, failed });
      const now = new Date().toISOString();
      pushActivity({ date: now, type: "import-products", file: file.name, status: `✅ ${success} صنف${failed > 0 ? ` — ⚠️ ${failed} خطأ` : ""}`, user: "Admin" });
      refreshLog();
      toast({ title: `تم الاستيراد: ${success} صنف ✓، ${failed} فشل` });
    } catch { toast({ title: "فشل قراءة الملف", variant: "destructive" }); }
    finally { setProdImporting(false); if (prodFileRef.current) prodFileRef.current.value = ""; }
  };

  const downloadProductsTemplate = () => {
    const rows = [
      { "اسم الصنف": "شاشة LCD", "كود الصنف (SKU)": "SCR001", "التصنيف": "قطع غيار", "الكمية": 10, "سعر التكلفة": 150, "سعر البيع": 200, "حد التنبيه": 5 },
      { "اسم الصنف": "بطارية أيفون", "كود الصنف (SKU)": "BAT002", "التصنيف": "بطاريات", "الكمية": 20, "سعر التكلفة": 80, "سعر البيع": 120, "حد التنبيه": 3 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const instRows = [
      { "الحقل": "اسم الصنف",         "الوصف": "اسم المنتج (إلزامي)",           "مثال": "شاشة LCD" },
      { "الحقل": "كود الصنف (SKU)",   "الوصف": "رمز تعريف فريد",                "مثال": "SCR001" },
      { "الحقل": "التصنيف",           "الوصف": "فئة المنتج",                     "مثال": "قطع غيار" },
      { "الحقل": "الكمية",            "الوصف": "الكمية في المخزن",               "مثال": "10" },
      { "الحقل": "سعر التكلفة",       "الوصف": "سعر الشراء",                     "مثال": "150" },
      { "الحقل": "سعر البيع",         "الوصف": "سعر البيع للعميل",               "مثال": "200" },
      { "الحقل": "حد التنبيه",        "الوصف": "كمية التنبيه للنفاد",             "مثال": "5" },
    ];
    const wsInst = XLSX.utils.json_to_sheet(instRows);
    wsInst["!cols"] = [{ wch: 20 }, { wch: 35 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
    XLSX.utils.book_append_sheet(wb, wsInst, "التعليمات");
    XLSX.writeFile(wb, "template-products.xlsx");
  };

  const handlePurchaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPurLoading(true); setPurParsed(false); setPurRows([]); setPurResult(null);
    try {
      const prodRes  = await authFetch(api("/api/products"));
      const products: any[] = prodRes.ok ? await prodRes.json() : [];
      const skuMap   = new Map<string, { id: number; name: string }>();
      for (const p of products) {
        if (p.sku) skuMap.set(String(p.sku).trim().toUpperCase(), { id: p.id, name: p.name });
      }
      const data    = await file.arrayBuffer();
      const wb      = XLSX.read(data);
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws) as any[];
      const parsed: PurchaseRow[] = rawRows.map((row, idx) => {
        const sku       = String(row["كود الصنف (SKU)"] || row["sku"] || "").trim();
        const name      = String(row["اسم الصنف"]       || row["name"]       || "");
        const quantity  = String(row["الكمية"]           || row["quantity"]   || "");
        const unitPrice = String(row["سعر الشراء"]       || row["unit_price"] || "");
        const supplier  = String(row["المورد"]           || row["supplier"]   || "");
        const invoiceNo = String(row["رقم الفاتورة"]     || row["invoice_no"] || "");
        const date      = String(row["تاريخ الفاتورة"]   || row["date"]       || "");
        const tax       = String(row["الضريبة%"]         || row["tax"]        || "0");
        const discount  = String(row["الخصم%"]           || row["discount"]   || "0");
        const errors: string[] = [];
        if (!sku)                                                              errors.push("كود الصنف مفقود");
        else if (!skuMap.has(sku.toUpperCase()))                              errors.push(`كود غير موجود: ${sku}`);
        if (!quantity  || isNaN(Number(quantity))  || Number(quantity) <= 0)  errors.push("الكمية غير صالحة");
        if (!unitPrice || isNaN(Number(unitPrice)) || Number(unitPrice) <= 0) errors.push("السعر غير صالح");
        const resolved = skuMap.get(sku.toUpperCase());
        return { idx, sku, name: name || resolved?.name || "", quantity, unitPrice, supplier, invoiceNo, date, tax, discount, productId: resolved?.id ?? null, errors };
      });
      setPurRows(parsed); setPurParsed(true);
      if (parsed.length > 0 && parsed[0].supplier) setPurSupplier(parsed[0].supplier);
    } catch { toast({ title: "فشل قراءة ملف المشتريات", variant: "destructive" }); }
    finally { setPurLoading(false); if (purFileRef.current) purFileRef.current.value = ""; }
  };

  const updatePurRow = (idx: number, field: "quantity" | "unitPrice", value: string) => {
    setPurRows(prev => prev.map(r => {
      if (r.idx !== idx) return r;
      const u = { ...r, [field]: value };
      const errors: string[] = [];
      if (!u.sku)                                                               errors.push("كود الصنف مفقود");
      else if (!u.productId)                                                    errors.push("كود غير موجود");
      if (!u.quantity  || isNaN(Number(u.quantity))  || Number(u.quantity) <= 0)  errors.push("الكمية غير صالحة");
      if (!u.unitPrice || isNaN(Number(u.unitPrice)) || Number(u.unitPrice) <= 0) errors.push("السعر غير صالح");
      u.errors = errors;
      return u;
    }));
  };

  const validRows  = purRows.filter(r => r.errors.length === 0);
  const errorRows  = purRows.filter(r => r.errors.length > 0);

  const handlePurchaseConfirm = async () => {
    if (validRows.length === 0) { toast({ title: "لا توجد صفوف صالحة للاستيراد", variant: "destructive" }); return; }
    setPurConfirming(true);
    try {
      const items = validRows.map(r => {
        const qty          = Number(r.quantity);
        const price        = Number(r.unitPrice);
        const discountFrac = Number(r.discount || 0) / 100;
        const taxFrac      = Number(r.tax      || 0) / 100;
        const unitNet      = price * (1 - discountFrac);
        const totalPrice   = qty * unitNet * (1 + taxFrac);
        return { product_id: r.productId!, product_name: r.name, quantity: qty, unit_price: unitNet, total_price: totalPrice };
      });
      const total = items.reduce((s, i) => s + i.total_price, 0);
      const body  = {
        payment_type: purPayType, total_amount: total,
        paid_amount: purPayType === "credit" ? 0 : total,
        items, supplier_name: purSupplier || undefined,
        notes: `استيراد من Excel — ${validRows.length} صنف`,
      };
      const res  = await authFetch(api("/api/purchases"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الاستيراد");
      const msg = `تم إنشاء فاتورة مشتريات ${data.invoice_no} وتحديث المخزن بـ ${validRows.length} صنف ✓`;
      setPurResult(msg);
      const now = new Date().toISOString();
      pushActivity({ date: now, type: "import-purchases", file: "Excel", status: `✅ ${validRows.length} صنف — ${data.invoice_no}`, user: "Admin" });
      refreshLog();
      toast({ title: msg });
    } catch (err: any) { toast({ title: err.message || "فشل الاستيراد", variant: "destructive" }); }
    finally { setPurConfirming(false); }
  };

  const downloadPurchaseTemplate = () => {
    const rows = [
      { "كود الصنف (SKU)": "SCR001", "اسم الصنف": "شاشة LCD", "الكمية": 10, "سعر الشراء": 150, "المورد": "مورد الشاشات", "تاريخ الفاتورة": "2024-01-15", "رقم الفاتورة": "INV-001", "الضريبة%": 14, "الخصم%": 0 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "فاتورة المشتريات");
    XLSX.writeFile(wb, "template-purchase-invoice.xlsx");
  };

  const canConfirmRestore = restoreConfirmText === "RESTORE" && restoreUnderstood;

  return (
    <div className="space-y-6">
      <PageHeader title="النسخ الاحتياطية والاستيراد" sub="احتفظ ببيانات نظامك واستورد البيانات بأمان" />

      {/* ══════════════════════════════════════════════════════════
          RESTORE CONFIRMATION MODAL
          ══════════════════════════════════════════════════════════ */}
      {restoreModal && pendingRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setRestoreModal(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-[#0F1623] border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="font-bold text-red-400 text-sm">تأكيد الاستعادة</p>
                  <p className="text-white/30 text-xs">هذا الإجراء لا يمكن التراجع عنه</p>
                </div>
              </div>
              <button
                onClick={() => setRestoreModal(false)}
                className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Warning banner */}
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1">
                <p className="text-red-300 font-bold text-sm text-center">
                  ⚠️ سيتم حذف كل البيانات الحالية واستبدالها بالنسخة الاحتياطية
                </p>
                <p className="text-white/40 text-xs text-center">المستخدمون والإعدادات الأساسية تبقى كما هي</p>
              </div>

              {/* File info */}
              <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-2">
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest">معلومات الملف</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-white/30 mb-0.5">اسم الملف</p>
                    <p className="text-white font-bold truncate">{pendingRestore.fileName}</p>
                  </div>
                  <div>
                    <p className="text-white/30 mb-0.5">الإصدار</p>
                    <p className="text-white font-bold">{pendingRestore.version ?? "legacy"}</p>
                  </div>
                  {pendingRestore.date && (
                    <div className="col-span-2">
                      <p className="text-white/30 mb-0.5">تاريخ الإنشاء</p>
                      <p className="text-white font-bold">{new Date(pendingRestore.date).toLocaleString("ar-EG")}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-white/30 mb-0.5">عدد الجداول</p>
                    <p className="text-white font-bold">{pendingRestore.tableCount} جدول</p>
                  </div>
                </div>
              </div>

              {/* Type RESTORE */}
              <div className="space-y-2">
                <label className="block text-white/60 text-sm">
                  اكتب <span className="text-red-400 font-black tracking-widest">RESTORE</span> للمتابعة:
                </label>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={e => setRestoreConfirmText(e.target.value)}
                  placeholder="RESTORE"
                  autoComplete="off"
                  spellCheck={false}
                  className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-sm font-bold text-center tracking-widest outline-none transition-all placeholder:text-white/15 placeholder:font-normal placeholder:tracking-normal ${
                    restoreConfirmText === "RESTORE"
                      ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/5"
                      : restoreConfirmText.length > 0
                        ? "border-red-500/40 text-white"
                        : "border-white/10 text-white"
                  }`}
                />
                {restoreConfirmText.length > 0 && restoreConfirmText !== "RESTORE" && (
                  <p className="text-red-400/70 text-xs text-center">يجب كتابة RESTORE بالأحرف الكبيرة</p>
                )}
                {restoreConfirmText === "RESTORE" && (
                  <p className="text-emerald-400/70 text-xs text-center flex items-center justify-center gap-1">
                    <Check className="w-3 h-3" /> صحيح
                  </p>
                )}
              </div>

              {/* Understood checkbox */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div
                  onClick={() => setRestoreUnderstood(v => !v)}
                  className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${
                    restoreUnderstood
                      ? "bg-red-500 border-red-500"
                      : "bg-transparent border-white/20 group-hover:border-white/40"
                  }`}
                >
                  {restoreUnderstood && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-white/60 text-sm leading-relaxed select-none">
                  فهمت أن <span className="text-red-400 font-bold">جميع البيانات الحالية سيتم حذفها</span> واستبدالها بمحتوى الملف المحدد
                </span>
              </label>

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setRestoreModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-all text-sm font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConfirmRestore}
                  disabled={!canConfirmRestore}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    canConfirmRestore
                      ? "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/25"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  استعادة النسخة الاحتياطية
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BACKUP ── */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">النسخ الاحتياطية</p>
              <p className="text-white/30 text-xs">آخر نسخة: {lastBackupLabel()}</p>
            </div>
          </div>
          <button onClick={toggleAllModules} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            {bkModules.size === BACKUP_MODULES_LIST.length ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Toggle cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BACKUP_MODULES_LIST.map(m => {
              const active = bkModules.has(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleModule(m.key)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${
                    active
                      ? "bg-blue-500/10 border-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.1)]"
                      : "bg-[#1A2235] border-[#2D3748] hover:border-blue-500/20"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xl transition-colors ${active ? "bg-blue-500/20" : "bg-white/5"}`}>
                    {active ? <Check className="w-4 h-4 text-blue-400" /> : m.icon}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${active ? "text-blue-300" : "text-white/70"}`}>{m.label}</p>
                    <p className="text-white/25 text-xs">{m.sub}</p>
                  </div>
                  {!active && <span className="text-xl">{m.icon}</span>}
                </button>
              );
            })}
          </div>

          {/* Schedule pills */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/3 border border-white/5">
            <span className="text-white/35 text-xs">جدولة تلقائية:</span>
            {[{ v: "none", l: "بدون" }, { v: "daily", l: "يومياً" }, { v: "weekly", l: "أسبوعياً" }, { v: "monthly", l: "شهرياً" }].map(s => (
              <button key={s.v}
                onClick={() => { setSchedule(s.v); localStorage.setItem(SCHEDULE_KEY2, s.v); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                  schedule === s.v
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                    : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/60"
                }`}>
                {s.l}
              </button>
            ))}
          </div>

          {/* Progress */}
          {bkLoading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-white/40">
                <span>جاري إنشاء النسخة الاحتياطية...</span>
                <span>{bkProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all duration-300" style={{ width: `${bkProgress}%` }} />
              </div>
            </div>
          )}

          {/* Success */}
          {bkResult && !bkLoading && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 font-bold text-sm">تم إنشاء النسخة الاحتياطية بنجاح</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="text-white/30 text-xs mb-0.5">الملف</p><p className="text-white text-xs font-bold truncate">{bkResult.name.slice(0, 20)}…</p></div>
                <div><p className="text-white/30 text-xs mb-0.5">الحجم</p><p className="text-white text-sm font-bold">{bkResult.size}</p></div>
                <div><p className="text-white/30 text-xs mb-0.5">الوحدات</p><p className="text-white text-sm font-bold">{bkResult.count}</p></div>
              </div>
            </div>
          )}

          <PrimaryBtn onClick={handleBackup} disabled={bkLoading || bkModules.size === 0} className="w-full">
            {bkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            {bkLoading ? `جاري الإنشاء... ${bkProgress}%` : `إنشاء نسخة احتياطية (${bkModules.size} وحدات)`}
          </PrimaryBtn>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          AUTO BACKUP SETTINGS
          ══════════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-sky-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <RefreshCcw className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">النسخ التلقائي</p>
              <p className="text-white/30 text-xs">جدولة وإعدادات الحفظ التلقائي على الخادم</p>
            </div>
          </div>
          {schedSaving && <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />}
        </div>
        <div className="p-5 space-y-4">

          {/* Trigger info */}
          <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/15 text-sky-300/70 text-xs leading-relaxed space-y-1">
            <p className="font-semibold text-sky-300">يتم إنشاء نسخة احتياطية تلقائياً عند:</p>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {[["تسجيل الدخول", "login"], ["ترحيل فاتورة مبيعات", "sale_post"], ["ترحيل فاتورة مشتريات", "purchase_post"], ["الجدولة التلقائية", "scheduled"]].map(([label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule selector */}
          <div className="space-y-2">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">الجدولة المنتظمة</p>
            <div className="flex flex-wrap gap-2">
              {[{ v: "none", l: "بدون" }, { v: "daily", l: "يومياً" }, { v: "weekly", l: "أسبوعياً" }, { v: "monthly", l: "شهرياً" }].map(s => (
                <button key={s.v}
                  onClick={() => void handleSaveSchedule(s.v, serverDestination)}
                  disabled={schedSaving}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    serverSchedule === s.v
                      ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                      : "border-white/10 text-white/40 hover:border-sky-500/25 hover:text-sky-300/60"
                  }`}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          {/* Destination selector */}
          <div className="space-y-2">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">وجهة الحفظ</p>
            <div className="flex gap-2">
              {[{ v: "local", l: "خادم محلي", icon: "🖥️" }, { v: "server", l: "مجلد الخادم", icon: "📁" }].map(d => (
                <button key={d.v}
                  onClick={() => void handleSaveSchedule(serverSchedule, d.v)}
                  disabled={schedSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    serverDestination === d.v
                      ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                      : "border-white/10 text-white/40 hover:border-sky-500/25 hover:text-sky-300/60"
                  }`}>
                  <span>{d.icon}</span>{d.l}
                </button>
              ))}
            </div>
          </div>

          {/* Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/3 border border-white/5 space-y-1">
              <p className="text-white/30 text-xs">آخر نسخة تلقائية</p>
              <p className="text-white text-sm font-bold truncate">
                {lastScheduled ? new Date(lastScheduled).toLocaleString("ar-EG") : "—"}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/3 border border-white/5 space-y-1">
              <p className="text-white/30 text-xs">النسخة القادمة المتوقعة</p>
              <p className="text-sky-300 text-sm font-bold truncate">
                {getNextBackupTime(serverSchedule, lastScheduled) ?? (serverSchedule === "none" ? "معطّل" : "قريباً")}
              </p>
            </div>
          </div>

          {/* Manual server backup button */}
          <button
            onClick={() => void handleServerManualBackup()}
            disabled={serverBkLoading}
            className="w-full py-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 hover:border-sky-500/50 text-sky-300 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {serverBkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {serverBkLoading ? "جاري الحفظ..." : "حفظ نسخة الآن على الخادم"}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SERVER BACKUP HISTORY
          ══════════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center">
              <History className="w-4 h-4 text-white/50" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">سجل النسخ الاحتياطية</p>
              <p className="text-white/30 text-xs">
                {backupList.length > 0 ? `${backupList.length} نسخة محفوظة على الخادم (الحد الأقصى 20)` : "لا توجد نسخ محفوظة بعد"}
              </p>
            </div>
          </div>
          <button
            onClick={() => void loadBackupList()}
            disabled={backupListLoading}
            className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors"
            title="تحديث"
          >
            <RefreshCcw className={`w-4 h-4 ${backupListLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="p-3">
          {backupListLoading && backupList.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-white/30 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري التحميل...</span>
            </div>
          ) : backupList.length === 0 ? (
            <div className="text-center py-8 text-white/25 text-sm">
              لا توجد نسخ احتياطية محفوظة على الخادم حتى الآن
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {backupList.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-3 py-3 px-2 rounded-xl hover:bg-white/3 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <HardDrive className="w-3.5 h-3.5 text-white/40" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-mono truncate max-w-[200px]" title={b.filename}>{b.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-white/30 text-[10px]">{new Date(b.created_at).toLocaleString("ar-EG")}</span>
                        <span className="text-white/20 text-[10px]">•</span>
                        <span className="text-white/30 text-[10px]">{formatBytes(b.size)}</span>
                        <span className="text-white/20 text-[10px]">•</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                          b.trigger === "login" ? "bg-blue-500/15 text-blue-400" :
                          b.trigger === "sale_post" || b.trigger === "purchase_post" ? "bg-emerald-500/15 text-emerald-400" :
                          b.trigger === "scheduled" ? "bg-sky-500/15 text-sky-400" :
                          "bg-white/8 text-white/40"
                        }`}>{formatBackupTrigger(b.trigger)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => void handleDownloadBackupById(b.id, b.filename)}
                      className="p-2 rounded-lg text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                      title="تنزيل"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => void handleDeleteBackup(b.id)}
                      disabled={deletingBackup === b.id}
                      className="p-2 rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="حذف"
                    >
                      {deletingBackup === b.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── FULL SERVER BACKUP ── */}
      <div className="bg-[#111827] border border-emerald-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">نسخة احتياطية كاملة من الخادم</p>
            <p className="text-white/30 text-xs">تصدير جميع الجداول مباشرة من قاعدة البيانات — بما في ذلك القيود اليومية والحسابات</p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-300/70 text-xs leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>تشمل هذه النسخة: العملاء، الموردين، المنتجات، المبيعات، المشتريات، المصروفات، الخزائن، القيود المحاسبية، التنبيهات، وجميع الحركات</span>
          </div>
          <PrimaryBtn onClick={handleFullBackup} disabled={fullBkLoading} className="w-full" style={{ background: "linear-gradient(to right, #10b981, #059669)" }}>
            {fullBkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {fullBkLoading ? "جاري التصدير..." : "تنزيل نسخة احتياطية كاملة (JSON)"}
          </PrimaryBtn>
        </div>
      </div>

      {/* ── RESTORE ── */}
      <div className="bg-[#111827] border border-violet-500/20 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Upload className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">استعادة نسخة احتياطية</p>
            <p className="text-white/30 text-xs">ارفع ملف JSON وسيتم استعادة جميع البيانات داخل معاملة آمنة</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-amber-300/70 text-xs leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>تحذير: ستُحذف البيانات الحالية واستبدالها ببيانات الملف. المستخدمون والإعدادات تبقى كما هي. العملية لا يمكن التراجع عنها.</span>
          </div>

          <input ref={restoreFileRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFile} />

          {restoreLoading && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
              <p className="text-violet-300 text-sm">جاري الاستعادة داخل معاملة آمنة...</p>
            </div>
          )}

          {restoreResult && !restoreLoading && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-bold text-sm">تمت الاستعادة بنجاح</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    v{restoreResult.meta.file_version}
                  </span>
                  {restoreResult.meta.is_legacy && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold">legacy</span>
                  )}
                </div>
              </div>
              {restoreResult.meta.file_date && (
                <p className="text-white/30 text-xs">
                  تاريخ الملف: {new Date(restoreResult.meta.file_date).toLocaleString("ar-EG")}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {Object.entries(restoreResult.counts).filter(([,v]) => (v as number) > 0).slice(0, 9).map(([k, v]) => (
                  <div key={k} className="bg-white/5 rounded-lg p-2">
                    <p className="text-white/40 text-[10px]">{k}</p>
                    <p className="text-white font-bold">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {restoreError && !restoreLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <X className="w-4 h-4 shrink-0" /> {restoreError}
            </div>
          )}

          <button
            onClick={() => restoreFileRef.current?.click()}
            disabled={restoreLoading}
            className="w-full py-3 rounded-xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/60 text-violet-400 hover:text-violet-300 transition-all flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4" />
            اختر ملف النسخة الاحتياطية (.json)
          </button>
        </div>
      </div>

      {/* ── IMPORT ── */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">الاستيراد</p>
              <p className="text-white/30 text-xs">استيراد الأصناف وفواتير المشتريات من ملفات Excel</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[{ id: "products" as const, label: "📦 استيراد الأصناف" }, { id: "purchases" as const, label: "🛒 استيراد فاتورة مشتريات" }].map(t => (
              <button key={t.id} onClick={() => setImportSubTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  importSubTab === t.id
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                    : "border-white/8 text-white/35 hover:text-white/60 hover:border-white/15"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {importSubTab === "products" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <div>
                  <p className="text-emerald-400 font-bold text-sm">تصدير الأصناف الحالية</p>
                  <p className="text-white/30 text-xs">تحميل جميع الأصناف كملف Excel</p>
                </div>
                <button onClick={handleProductsExport} disabled={prodExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold text-xs transition-all disabled:opacity-40">
                  {prodExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {prodExporting ? "جاري التصدير..." : "تصدير Excel"}
                </button>
              </div>
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
                <div>
                  <p className="text-amber-400 font-bold text-sm">استيراد أصناف جديدة</p>
                  <p className="text-white/30 text-xs">رفع ملف Excel لإضافة الأصناف دفعةً واحدة</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => prodFileRef.current?.click()} disabled={prodImporting}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl text-amber-400 font-bold text-xs transition-all disabled:opacity-40">
                    {prodImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {prodImporting ? "جاري الاستيراد..." : "رفع ملف Excel"}
                  </button>
                  <button onClick={downloadProductsTemplate}
                    className="flex items-center gap-2 px-4 py-2 glass-panel border border-white/10 hover:border-white/20 rounded-xl text-white/50 hover:text-white text-xs transition-all">
                    <Download className="w-3.5 h-3.5" /> تحميل نموذج فارغ
                  </button>
                </div>
                <input ref={prodFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleProductsImport} />
                {prodResult && (
                  <div className={`p-3 rounded-xl border text-xs ${prodResult.failed === 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 inline ml-2" />
                    تم استيراد <strong>{prodResult.success}</strong> صنف
                    {prodResult.failed > 0 && <span className="text-red-400"> — فشل {prodResult.failed}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {importSubTab === "purchases" && (
            <div className="space-y-4">
              {!purParsed ? (
                <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-3">
                  <div>
                    <p className="text-violet-400 font-bold text-sm">استيراد فاتورة مشتريات</p>
                    <p className="text-white/30 text-xs">رفع ملف Excel يحتوي على بنود الفاتورة لإنشائها تلقائياً</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => purFileRef.current?.click()} disabled={purLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl text-violet-400 font-bold text-xs transition-all disabled:opacity-40">
                      {purLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {purLoading ? "جاري القراءة والتحقق..." : "رفع ملف Excel"}
                    </button>
                    <button onClick={downloadPurchaseTemplate}
                      className="flex items-center gap-2 px-4 py-2 glass-panel border border-white/10 hover:border-white/20 rounded-xl text-white/50 hover:text-white text-xs transition-all">
                      <Download className="w-3.5 h-3.5" /> تحميل نموذج فارغ
                    </button>
                  </div>
                  <input ref={purFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handlePurchaseFile} />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8">
                    <div className="flex gap-4">
                      <span className="text-emerald-400 text-sm font-bold">{validRows.length} صنف صحيح ✓</span>
                      {errorRows.length > 0 && <span className="text-red-400 text-sm font-bold">{errorRows.length} صنف به أخطاء ✗</span>}
                    </div>
                    <button onClick={() => { setPurParsed(false); setPurRows([]); setPurResult(null); }}
                      className="text-xs text-white/40 hover:text-white transition-colors">إلغاء</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>العميل (اختياري)</FieldLabel>
                      <SInput placeholder="اسم العميل" value={purSupplier} onChange={e => setPurSupplier(e.target.value)} />
                    </div>
                    <div>
                      <FieldLabel>طريقة الدفع</FieldLabel>
                      <SSelect value={purPayType} onChange={e => setPurPayType(e.target.value as "cash" | "credit")}>
                        <option value="cash">نقدي</option>
                        <option value="credit">آجل</option>
                      </SSelect>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/8">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="bg-white/3 border-b border-white/8">
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">SKU</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">الصنف</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">الكمية</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">السعر</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">الإجمالي</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purRows.map(r => {
                          const hasError = r.errors.length > 0;
                          const total    = (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
                          return (
                            <tr key={r.idx} className={`border-b border-white/4 ${hasError ? "bg-red-500/5" : "hover:bg-white/2"}`}>
                              <td className="px-3 py-2 text-white/50 font-mono">{r.sku || "—"}</td>
                              <td className="px-3 py-2 text-white/70 max-w-[100px] truncate">{r.name || "—"}</td>
                              <td className="px-3 py-2">
                                <input type="number" value={r.quantity}
                                  onChange={e => updatePurRow(r.idx, "quantity", e.target.value)}
                                  className={`w-16 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none focus:ring-1 focus:ring-amber-500/30 ${!r.quantity || Number(r.quantity) <= 0 ? "border-red-500/50" : "border-white/10"}`} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" value={r.unitPrice}
                                  onChange={e => updatePurRow(r.idx, "unitPrice", e.target.value)}
                                  className={`w-20 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none focus:ring-1 focus:ring-amber-500/30 ${!r.unitPrice || Number(r.unitPrice) <= 0 ? "border-red-500/50" : "border-white/10"}`} />
                              </td>
                              <td className="px-3 py-2 text-white/55 font-mono">{isNaN(total) ? "—" : total.toFixed(2)}</td>
                              <td className="px-3 py-2">
                                {hasError
                                  ? <span className="text-red-400 text-xs" title={r.errors.join(" | ")}>✗ {r.errors[0]}</span>
                                  : <span className="text-emerald-400 text-xs">✓ صالح</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {validRows.length > 0 && (
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/3 border border-white/8">
                      <span className="text-white/50 text-sm">إجمالي الفاتورة</span>
                      <span className="text-amber-400 font-black text-lg">
                        {validRows.reduce((s, r) => s + (Number(r.quantity)||0) * (Number(r.unitPrice)||0), 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {purResult && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                      <CheckCircle2 className="w-4 h-4 inline ml-2" />{purResult}
                    </div>
                  )}
                  <button onClick={handlePurchaseConfirm} disabled={purConfirming || validRows.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl text-violet-400 font-bold text-sm transition-all disabled:opacity-40">
                    {purConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {purConfirming ? "جاري إنشاء الفاتورة وتحديث المخزن..." : `تأكيد استيراد ${validRows.length} صنف وإنشاء فاتورة مشتريات`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Activity Log ── */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
              <History className="w-4 h-4 text-white/40" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">سجل العمليات</p>
              <p className="text-white/30 text-xs">آخر {activityLog.length} عملية</p>
            </div>
          </div>
          {activityLog.length > 0 && (
            <button onClick={() => { localStorage.removeItem(ACTIVITY_KEY); setActivityLog([]); }}
              className="text-xs text-white/25 hover:text-red-400 transition-colors">مسح السجل</button>
          )}
        </div>
        <div className="overflow-x-auto">
          {activityLog.length === 0 ? (
            <div className="p-8 text-center text-white/20 text-sm">لا توجد عمليات مسجلة بعد</div>
          ) : (
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/2">
                  <th className="px-4 py-3 text-right text-white/30 font-medium">التاريخ</th>
                  <th className="px-4 py-3 text-right text-white/30 font-medium">النوع</th>
                  <th className="px-4 py-3 text-right text-white/30 font-medium">الملف</th>
                  <th className="px-4 py-3 text-right text-white/30 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {activityLog.map(e => (
                  <tr key={e.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 text-white/40 font-mono">
                      {new Date(e.date).toLocaleDateString("ar-EG")} {new Date(e.date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                        e.type === "backup" ? "bg-blue-500/15 text-blue-400" :
                        e.type === "import-products" ? "bg-amber-500/15 text-amber-400" :
                        "bg-violet-500/15 text-violet-400"
                      }`}>
                        {e.type === "backup" ? "نسخ احتياطي" : e.type === "import-products" ? "استيراد أصناف" : "استيراد مشتريات"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/40 font-mono max-w-[120px] truncate">{e.file}</td>
                    <td className="px-4 py-3 text-white/55">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DATA MANAGEMENT TAB  (danger zone with countdown)
   ══════════════════════════════════════════════════════════════════ */
const DATA_GROUPS = [
  { key: "sales",            label: "المبيعات",        sub: "فواتير البيع والمدفوعات" },
  { key: "purchases",        label: "المشتريات",        sub: "فواتير الشراء وتكاليفها" },
  { key: "expenses",         label: "المصروفات",        sub: "جميع سجلات المصروفات" },
  { key: "income",           label: "الإيرادات",        sub: "جميع سجلات الإيرادات" },
  { key: "receipt_vouchers", label: "سندات القبض",      sub: "مدفوعات العملاء" },
  { key: "deposit_vouchers", label: "سندات التوريد",    sub: "توريدات العملاء النقدية" },
  { key: "transactions",     label: "الحركات المالية",  sub: "السجل المركزي للمعاملات" },
  { key: "products",         label: "الأصناف",          sub: "بيانات المنتجات والمخزون" },
  { key: "customers",        label: "العملاء",          sub: "بيانات العملاء وأرصدتهم" },
];

function DataTab() {
  const { toast } = useToast();
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [confirmText,  setConfirmText]  = useState("");
  const [loading,      setLoading]      = useState(false);
  const [countdown,    setCountdown]    = useState(5);
  const [canDelete,    setCanDelete]    = useState(false);

  const readyToDelete = confirmText === "تأكيد الحذف" && selected.size > 0;

  useEffect(() => {
    if (!readyToDelete) { setCanDelete(false); setCountdown(5); return; }
    setCountdown(5); setCanDelete(false);
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(iv); setCanDelete(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [readyToDelete]);

  const toggle = (key: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
    setConfirmText(""); setCanDelete(false);
  };
  const toggleAll = () => {
    if (selected.size === DATA_GROUPS.length) setSelected(new Set());
    else setSelected(new Set(DATA_GROUPS.map(g => g.key)));
    setConfirmText(""); setCanDelete(false);
  };

  const handleClear = async () => {
    if (!canDelete) return;
    setLoading(true);
    try {
      const res = await authFetch(api("/api/admin/clear"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `✅ تم مسح: ${Array.from(selected).length} جدول بنجاح` });
      setSelected(new Set()); setConfirmText("");
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "فشل المسح", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="إدارة البيانات" sub="مسح جداول محددة من قاعدة البيانات" />

      {/* ── Danger Banner ── */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-red-400 font-bold text-sm">منطقة خطر — العمليات في هذه الصفحة لا يمكن التراجع عنها</p>
          <p className="text-red-400/60 text-xs mt-0.5">تأكد من عمل نسخة احتياطية قبل حذف أي بيانات</p>
        </div>
      </div>

      {/* ── Selective Delete ── */}
      <div className="bg-[#111827] border border-red-500/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-white/70 text-sm font-semibold">
            الحذف الانتقائي
            {selected.size > 0 && (
              <span className="mr-2 px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-xs font-bold">
                {selected.size} محدد
              </span>
            )}
          </p>
          <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            {selected.size === DATA_GROUPS.length ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DATA_GROUPS.map(g => {
            const active = selected.has(g.key);
            return (
              <button
                key={g.key}
                onClick={() => toggle(g.key)}
                className={`p-3 rounded-xl text-right border transition-all ${
                  active
                    ? "bg-red-500/15 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.1)]"
                    : "bg-[#1A2235] border-[#2D3748] hover:border-red-500/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${active ? "text-red-300" : "text-white/70"}`}>{g.label}</span>
                  {active
                    ? <Check className="w-3.5 h-3.5 text-red-400" />
                    : <div className="w-3.5 h-3.5 rounded border border-white/15" />
                  }
                </div>
                <p className="text-white/25 text-xs">{g.sub}</p>
              </button>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div className="space-y-3 pt-2 border-t border-red-500/10">
            <div>
              <label className="text-white/50 text-sm font-medium block mb-2">
                اكتب <span className="text-red-400 font-black">"تأكيد الحذف"</span> لتفعيل الحذف:
              </label>
              <SInput
                placeholder="تأكيد الحذف"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="border-red-500/20 focus:border-red-500"
              />
            </div>
            {readyToDelete && !canDelete && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                <p className="text-red-400 text-sm">يمكنك الحذف بعد <span className="font-black">{countdown}</span> ثانية...</p>
              </div>
            )}
            <DangerBtn
              onClick={handleClear}
              disabled={loading || !canDelete}
              className="w-full"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {loading ? "جاري المسح..." : canDelete ? `مسح ${selected.size} جدول نهائياً` : `انتظر ${countdown}s`}
            </DangerBtn>
          </div>
        )}
      </div>

      {/* ── Full Reset ── */}
      <FullResetSection />
    </div>
  );
}

function FullResetSection() {
  const resetDb = useResetDatabase();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded,     setExpanded]     = useState(false);
  const [confirmText,  setConfirmText]  = useState("");
  const [done,         setDone]         = useState(false);
  const [countdown,    setCountdown]    = useState(10);
  const [canReset,     setCanReset]     = useState(false);

  const readyToReset = confirmText === "تأكيد الحذف الكامل";

  useEffect(() => {
    if (!readyToReset) { setCanReset(false); setCountdown(10); return; }
    setCountdown(10); setCanReset(false);
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(iv); setCanReset(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [readyToReset]);

  return (
    <div className="bg-[#111827] rounded-2xl overflow-hidden border border-red-500/30">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
            <RefreshCcw className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-right">
            <p className="font-bold text-red-400 text-sm">تصفير قاعدة البيانات الكاملة</p>
            <p className="text-white/30 text-xs">مسح كامل — اضغط للتوسعة</p>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-white/30" /> : <ChevronRight className="w-4 h-4 text-white/30" />}
      </button>

      {expanded && (
        <div className="border-t border-red-500/20 p-5 space-y-4">
          {/* What gets deleted */}
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/15 space-y-2">
            <p className="text-red-400 font-bold text-xs uppercase tracking-wide mb-2">ما سيتم مسحه:</p>
            {["جميع فواتير البيع والمشتريات", "جميع الحركات المالية", "المصروفات والإيرادات", "السندات والتحويلات", "سجل المخزون"].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-red-300/70">
                <X className="w-3 h-3 text-red-500 shrink-0" /> {item}
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-red-500/10">
              <p className="text-white/40 text-xs">يتم الاحتفاظ بـ: المنتجات، العملاء، الإعدادات</p>
            </div>
          </div>

          {done && <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm"><CheckCircle2 className="w-4 h-4" /> تم التصفير بنجاح</div>}

          <div>
            <label className="text-white/50 text-sm font-medium block mb-2">
              اكتب <span className="text-red-400 font-black">"تأكيد الحذف الكامل"</span> لتفعيل التصفير:
            </label>
            <SInput
              placeholder="تأكيد الحذف الكامل"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="border-red-500/20 focus:border-red-500"
            />
          </div>

          {readyToReset && !canReset && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
              <p className="text-red-400 text-sm">يمكنك التصفير بعد <span className="font-black">{countdown}</span> ثانية...</p>
            </div>
          )}

          <DangerBtn
            disabled={!canReset || resetDb.isPending}
            className="w-full"
            onClick={() => resetDb.mutate({ confirm: "تأكيد الحذف" }, {
              onSuccess: () => { queryClient.clear(); setDone(true); setConfirmText(""); toast({ title: "✅ تم التصفير" }); },
              onError: () => toast({ title: "فشل التصفير", variant: "destructive" }),
            })}
          >
            {resetDb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            {resetDb.isPending ? "جاري التصفير..." : canReset ? "مسح قاعدة البيانات نهائياً" : `انتظر ${countdown}s`}
          </DangerBtn>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   OPENING BALANCE TAB  (unchanged logic, improved UI)
   ══════════════════════════════════════════════════════════════════ */
type OBSubTab = "treasury" | "products" | "customers" | "suppliers";

const OB_SUB_TABS: { id: OBSubTab; label: string; icon: string }[] = [
  { id: "treasury",  label: "الخزائن",   icon: "🏛️" },
  { id: "products",  label: "المنتجات",  icon: "📦" },
  { id: "customers", label: "العملاء",   icon: "👥" },
  { id: "suppliers", label: "عملاء (يُشترى منهم)",  icon: "🚚" },
];

interface OBEntry {
  id: number; amount?: number; quantity?: number; unit_cost?: number; description?: string;
  customer_name?: string; safe_name?: string; product_name?: string; date?: string; created_at: string;
  notes?: string;
}

function useOBData(path: string) {
  const [data, setData]     = useState<OBEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${BASE}/api${path}`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [path]);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

function OBEntryTable({ entries, loading, columns }: {
  entries: OBEntry[];
  loading: boolean;
  columns: { label: string; render: (e: OBEntry) => React.ReactNode }[];
}) {
  if (loading) return (
    <div className="p-8 text-center text-white/40 text-sm">
      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />جاري التحميل...
    </div>
  );
  if (entries.length === 0) return (
    <div className="p-8 text-center text-white/25 text-sm">لا توجد قيود مسجلة</div>
  );
  return (
    <table className="w-full text-right text-sm">
      <thead className="bg-white/3 border-b border-white/8">
        <tr>
          {columns.map(c => (
            <th key={c.label} className="p-3 text-white/40 text-xs font-medium">{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map(e => (
          <tr key={e.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
            {columns.map(c => (
              <td key={c.label} className="p-3 text-white/70 text-sm">{c.render(e)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Treasury sub-tab ── */
function OBTreasuryTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/treasury");
  const { data: safesRaw } = useGetSettingsSafes();
  const safes = safeArray(safesRaw);
  const { toast } = useToast();
  const [form, setForm]   = useState({ safe_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.safe_id || !form.amount) { toast({ title: "الخزينة والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/opening-balance/treasury`, {
        method: "POST",
        body: JSON.stringify({ safe_id: parseInt(form.safe_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: "✅ تم تسجيل رصيد أول المدة للخزينة" });
      setForm(f => ({ ...f, safe_id: "", amount: "", notes: "" }));
      reload();
    } catch { toast({ title: "خطأ في الاتصال", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2"><Banknote className="w-4 h-4" /> إضافة رصيد افتتاحي للخزينة</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <FieldLabel>الخزينة</FieldLabel>
            <SSelect value={form.safe_id} onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
              <option value="">— اختر الخزينة —</option>
              {(safes as any[]).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} (رصيد: {Number(s.balance).toLocaleString("ar-EG")} ج.م)</option>
              ))}
            </SSelect>
          </div>
          <div>
            <FieldLabel>المبلغ الافتتاحي (ج.م)</FieldLabel>
            <SInput type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <PrimaryBtn onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </PrimaryBtn>
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">القيود المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "الخزينة",  render: e => <span className="font-bold text-amber-400">{e.safe_name}</span> },
          { label: "المبلغ",   render: e => <span className="text-emerald-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ",  render: e => <span className="text-white/40 text-xs">{e.date}</span> },
          { label: "البيان",   render: e => <span className="text-white/30 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Products sub-tab ── */
function OBProductsTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/product");
  const { data: productsRaw } = useGetProducts();
  const products = safeArray(productsRaw);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm]     = useState({ product_id: "", quantity: "", cost_price: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredProductIds = new Set(entries.map(e => e.id));
  const filteredProducts = (products as any[]).filter((p: any) =>
    !registeredProductIds.has(p.id) && (p.name.includes(search) || (p.sku ?? "").includes(search))
  );

  const handleSelectProduct = (p: any) => { setForm(f => ({ ...f, product_id: String(p.id), cost_price: String(Number(p.cost_price)) })); setSearch(p.name); };
  const selectedProduct = (products as any[]).find((p: any) => String(p.id) === form.product_id);

  const handleSubmit = async () => {
    if (!form.product_id || !form.quantity || !form.cost_price) { toast({ title: "المنتج والكمية والتكلفة مطلوبة", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/inventory/opening-balance`, {
        method: "POST",
        body: JSON.stringify({ product_id: parseInt(form.product_id), quantity: parseFloat(form.quantity), cost_price: parseFloat(form.cost_price), date: form.date, notes: form.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedProduct?.name ?? "المنتج"}` });
      setForm(f => ({ ...f, product_id: "", quantity: "", cost_price: "", notes: "" })); setSearch(""); reload();
    } catch { toast({ title: "خطأ في الاتصال", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2"><Package className="w-4 h-4" /> إضافة رصيد مخزن افتتاحي</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="relative">
            <FieldLabel>البحث عن منتج</FieldLabel>
            <SInput placeholder="ابحث بالاسم أو الكود..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, product_id: "" })); }} />
            {search && !form.product_id && filteredProducts.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-[#111827] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-2xl">
                {filteredProducts.slice(0, 12).map((p: any) => (
                  <button key={p.id} onClick={() => handleSelectProduct(p)}
                    className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-white/35 font-mono shrink-0">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedProduct && <p className="mt-1 text-emerald-400 text-xs">✓ {selectedProduct.name} — رصيد حالي: {Number(selectedProduct.quantity)} وحدة</p>}
          </div>
          <div>
            <FieldLabel>الكمية الافتتاحية</FieldLabel>
            <SInput type="number" min="0.001" step="any" placeholder="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تكلفة الوحدة (ج.م)</FieldLabel>
            <SInput type="number" min="0" step="0.01" placeholder="0.00" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <PrimaryBtn onClick={handleSubmit} disabled={saving || !form.product_id} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              تسجيل
            </PrimaryBtn>
          </div>
        </div>
        {form.product_id && form.quantity && form.cost_price && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-xs">
              سيُضاف <strong>{parseFloat(form.quantity)||0}</strong> وحدة بتكلفة <strong>{parseFloat(form.cost_price)||0} ج.م</strong>
              {selectedProduct ? ` للمنتج "${selectedProduct.name}"` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">أرصدة المنتجات المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "المنتج",       render: e => <span className="font-bold text-white">{e.product_name}</span> },
          { label: "الكمية",       render: e => <span className="text-blue-400 font-mono">{Number(e.quantity).toLocaleString("ar-EG")}</span> },
          { label: "تكلفة الوحدة", render: e => <span className="text-amber-400 font-mono">{Number(e.unit_cost).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ",      render: e => <span className="text-white/40 text-xs">{e.date}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Customers sub-tab ── */
function OBCustomersTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/customer");
  const { data: customersRaw } = useGetCustomers();
  const customers = safeArray(customersRaw);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm]     = useState({ customer_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredIds = new Set(entries.map(e => e.id));
  const filteredCustomers = (customers as any[]).filter((c: any) => !registeredIds.has(c.id) && c.name.includes(search));
  const selectedCustomer  = (customers as any[]).find((c: any) => String(c.id) === form.customer_id);
  const handleSelect = (c: any) => { setForm(f => ({ ...f, customer_id: String(c.id) })); setSearch(c.name); };

  const handleSubmit = async () => {
    if (!form.customer_id || !form.amount) { toast({ title: "العميل والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/opening-balance/customer`, {
        method: "POST",
        body: JSON.stringify({ customer_id: parseInt(form.customer_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedCustomer?.name ?? "العميل"}` });
      setForm(f => ({ ...f, customer_id: "", amount: "", notes: "" })); setSearch(""); reload();
    } catch { toast({ title: "خطأ في الاتصال", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2"><UserCircle className="w-4 h-4" /> إضافة رصيد افتتاحي لعميل</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <FieldLabel>العميل</FieldLabel>
            <SInput placeholder="ابحث عن عميل..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, customer_id: "" })); }} />
            {search && !form.customer_id && filteredCustomers.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-[#111827] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-2xl">
                {filteredCustomers.slice(0, 10).map((c: any) => (
                  <button key={c.id} onClick={() => handleSelect(c)}
                    className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0">{c.name}</button>
                ))}
              </div>
            )}
            {selectedCustomer && <p className="mt-1 text-emerald-400 text-xs">✓ {selectedCustomer.name}</p>}
          </div>
          <div>
            <FieldLabel>مبلغ الدين الافتتاحي (ج.م)</FieldLabel>
            <SInput type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <PrimaryBtn onClick={handleSubmit} disabled={saving || !form.customer_id}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </PrimaryBtn>
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">أرصدة العملاء المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "العميل",  render: e => <span className="font-bold text-white">{e.customer_name}</span> },
          { label: "المبلغ",  render: e => <span className="text-red-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/40 text-xs">{e.date}</span> },
          { label: "البيان",  render: e => <span className="text-white/30 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Suppliers sub-tab ── */
function OBSuppliersTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/supplier");
  const { data: allCustomersRaw } = useGetCustomers();
  const allCustomers = safeArray(allCustomersRaw);
  const suppliers = allCustomers.filter(c => c.is_supplier);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm]     = useState({ supplier_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredIds = new Set(entries.map(e => e.id));
  const filteredSuppliers = suppliers.filter(s => !registeredIds.has(s.id) && s.name.includes(search));
  const selectedSupplier  = suppliers.find(s => String(s.id) === form.supplier_id);
  const handleSelect = (s: { id: number; name: string }) => { setForm(f => ({ ...f, supplier_id: String(s.id) })); setSearch(s.name); };

  const handleSubmit = async () => {
    if (!form.supplier_id || !form.amount) { toast({ title: "العميل والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/opening-balance/supplier`, {
        method: "POST",
        body: JSON.stringify({ supplier_id: parseInt(form.supplier_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedSupplier?.name ?? "العميل"}` });
      setForm(f => ({ ...f, supplier_id: "", amount: "", notes: "" })); setSearch(""); reload();
    } catch { toast({ title: "خطأ في الاتصال", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> إضافة رصيد افتتاحي لعميل (يُشترى منه)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <FieldLabel>العميل</FieldLabel>
            <SInput placeholder="ابحث عن عميل..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, supplier_id: "" })); }} />
            {search && !form.supplier_id && filteredSuppliers.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-[#111827] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-2xl">
                {filteredSuppliers.slice(0, 10).map((s: any) => (
                  <button key={s.id} onClick={() => handleSelect(s)}
                    className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0">{s.name}</button>
                ))}
              </div>
            )}
            {selectedSupplier && <p className="mt-1 text-emerald-400 text-xs">✓ {selectedSupplier.name}</p>}
          </div>
          <div>
            <FieldLabel>مبلغ الرصيد المستحق (ج.م)</FieldLabel>
            <SInput type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <PrimaryBtn onClick={handleSubmit} disabled={saving || !form.supplier_id}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </PrimaryBtn>
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">أرصدة العملاء المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "العميل",  render: e => <span className="font-bold text-white">{e.description?.split("—")[1]?.trim() ?? `عميل #${e.id}`}</span> },
          { label: "المبلغ",  render: e => <span className="text-orange-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/40 text-xs">{e.date}</span> },
          { label: "البيان",  render: e => <span className="text-white/30 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Main OpeningBalanceTab ── */
function OpeningBalanceTab() {
  const [subTab, setSubTab] = useState<OBSubTab>("treasury");

  return (
    <div className="space-y-5">
      <PageHeader title="أول المدة" sub="قيود الأرصدة الافتتاحية عند بدء استخدام النظام" />

      {/* Amber info banner */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
        <BookOpen className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-400 font-bold text-sm">قيود أول المدة</p>
          <p className="text-amber-300/60 text-xs mt-0.5 leading-relaxed">
            سجّل هنا الأرصدة الافتتاحية عند بدء استخدام النظام لأول مرة.
            قيود الخزائن والعملاء تُضاف للأرصدة الحالية مباشرة.
            قيود المنتجات تُسجَّل مرة واحدة فقط لكل منتج وتُحسب التكلفة المرجّحة تلقائياً.
          </p>
        </div>
      </div>

      {/* Pill sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {OB_SUB_TABS.map(t => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                active
                  ? "bg-amber-500/15 border-amber-500/50 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  : "bg-[#1A2235] border-[#2D3748] text-white/40 hover:text-white hover:border-amber-500/20"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {subTab === "treasury"  && <OBTreasuryTab />}
      {subTab === "products"  && <OBProductsTab />}
      {subTab === "customers" && <OBCustomersTab />}
      {subTab === "suppliers" && <OBSuppliersTab />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FINANCIAL LOCK TAB — إغلاق الفترات المالية
═══════════════════════════════════════════════════════════════════ */

interface PeriodStatus {
  closing_date: string | null;
  locked_by:    string | null;
  locked_at:    string | null;
  lock_mode:    string;
  is_locked:    boolean;
}

interface AuditLogEntry {
  id:          number;
  action:      string;
  record_type: string;
  record_id:   number;
  old_value:   object | null;
  new_value:   object | null;
  user_id:     number | null;
  username:    string | null;
  created_at:  string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  lock_period:        { label: "إغلاق فترة",    color: "text-red-400 bg-red-500/10 border-red-500/20" },
  unlock_period:      { label: "فتح فترة",      color: "text-green-400 bg-green-500/10 border-green-500/20" },
  lock_blocked:       { label: "محاولة مرفوضة", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  reversal_created:   { label: "سند عكسي",      color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  correction_created: { label: "سند تصحيحي",    color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  create:             { label: "إنشاء",         color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  update:             { label: "تعديل",         color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  delete:             { label: "حذف",           color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

function FinancialLockTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [lockDate,         setLockDate]         = useState("");
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockReason,     setUnlockReason]     = useState("");
  const [showAuditLog,     setShowAuditLog]     = useState(false);
  const [savingLock,       setSavingLock]       = useState(false);
  const [savingUnlock,     setSavingUnlock]     = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<PeriodStatus>({
    queryKey: ["period-status"],
    queryFn: () => authFetch(api("/api/settings/period")).then(async r => { if (!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime: 10_000,
  });

  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ["financial-audit-logs"],
    queryFn: () => authFetch(api("/api/settings/audit-logs?limit=100")).then(async r => { if (!r.ok) throw new Error(`API Error: ${r.status}`); return r.json(); }),
    staleTime: 30_000,
    enabled: showAuditLog,
  });

  async function handleLock() {
    if (!lockDate) { toast({ title: "اختر تاريخ الإغلاق أولاً", variant: "destructive" }); return; }
    setSavingLock(true);
    try {
      const r = await authFetch(api("/api/settings/period"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_date: lockDate, lock_mode: "manual" }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "فشل الإغلاق"); }
      toast({ title: "تم إغلاق الفترة المالية", description: `مغلق حتى ${lockDate}` });
      setLockDate("");
      qc.invalidateQueries({ queryKey: ["period-status"] });
      qc.invalidateQueries({ queryKey: ["financial-audit-logs"] });
    } catch (e: any) {
      toast({ title: e.message ?? "خطأ", variant: "destructive" });
    } finally { setSavingLock(false); }
  }

  async function handleUnlock() {
    if (!unlockReason.trim() || unlockReason.trim().length < 3) {
      toast({ title: "أدخل سبب فتح الفترة (3 أحرف على الأقل)", variant: "destructive" }); return;
    }
    setSavingUnlock(true);
    try {
      const r = await authFetch(api("/api/settings/period"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_date: null, unlock_reason: unlockReason }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "فشل فتح الفترة"); }
      toast({ title: "تم فتح الفترة المالية", description: "يمكن الآن تعديل السجلات" });
      setShowUnlockDialog(false);
      setUnlockReason("");
      qc.invalidateQueries({ queryKey: ["period-status"] });
      qc.invalidateQueries({ queryKey: ["financial-audit-logs"] });
    } catch (e: any) {
      toast({ title: e.message ?? "خطأ", variant: "destructive" });
    } finally { setSavingUnlock(false); }
  }

  const locked = status?.is_locked ?? false;

  return (
    <div className="space-y-5">
      <PageHeader title="إغلاق الفترات المالية" sub="تحكم في إغلاق الفترات المحاسبية وسجل التدقيق" />

      {/* ── Status Card ── */}
      <div className={`rounded-2xl border p-5 ${locked ? "bg-red-500/5 border-red-500/20" : "bg-green-500/5 border-green-500/20"}`}>
        {statusLoading ? (
          <div className="flex items-center gap-2 text-white/40"><Loader2 className="w-4 h-4 animate-spin" />جاري التحميل...</div>
        ) : (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {locked
                ? <Lock className="w-7 h-7 text-red-400" />
                : <LockOpen className="w-7 h-7 text-green-400" />
              }
              <div>
                <p className={`text-lg font-bold ${locked ? "text-red-400" : "text-green-400"}`}>
                  {locked ? "الفترة مغلقة" : "الفترة مفتوحة"}
                </p>
                {locked && status?.closing_date && (
                  <p className="text-white/50 text-sm mt-0.5">
                    مغلق حتى: <span className="text-white/80 font-semibold">{formatDate(status.closing_date)}</span>
                  </p>
                )}
                {locked && status?.locked_by && (
                  <p className="text-white/40 text-xs mt-1">
                    بواسطة: <span className="text-white/60">{status.locked_by}</span>
                    {status.locked_at && (
                      <> · <span className="text-white/40">{new Date(status.locked_at).toLocaleString("ar-EG")}</span></>
                    )}
                  </p>
                )}
                {!locked && (
                  <p className="text-green-400/60 text-xs mt-0.5">لا يوجد إغلاق مالي مفعَّل حالياً</p>
                )}
              </div>
            </div>

            {/* Badge */}
            <span className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${locked ? "text-red-400 bg-red-500/10 border-red-500/30" : "text-green-400 bg-green-500/10 border-green-500/30"}`}>
              {locked ? "🔒 مغلقة" : "🔓 مفتوحة"}
            </span>
          </div>
        )}
      </div>

      {/* ── Warning Box ── */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/8 border border-amber-500/20">
        <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-400 font-bold text-sm">تنبيه مهم</p>
          <p className="text-amber-300/60 text-xs mt-1 leading-relaxed">
            بعد إغلاق الفترة لا يمكن تعديل السجلات القديمة مباشرة.
            يتم التصحيح فقط من خلال قيود أو سندات عكسية في فترة مفتوحة.
            إلغاء الإغلاق يتطلب تقديم سبب ويُسجَّل في سجل التدقيق.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Lock Action ── */}
        <div className="rounded-2xl border border-white/10 p-5 space-y-4" style={{ background: "var(--erp-bg-card)" }}>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-400" />
            <p className="text-white font-bold text-sm">إغلاق فترة مالية</p>
          </div>
          <div className="space-y-2">
            <label className="text-white/40 text-xs font-semibold">إغلاق حتى تاريخ</label>
            <input
              type="date"
              value={lockDate}
              onChange={e => setLockDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-xl px-3 py-2.5 bg-[#1A2235] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <button
            onClick={handleLock}
            disabled={savingLock || !lockDate}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-semibold text-sm hover:bg-red-500/25 transition-all disabled:opacity-40"
          >
            {savingLock ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            تنفيذ الإغلاق
          </button>
          <p className="text-white/25 text-[10px]">
            سيُمنع تعديل أو حذف أي سجل تاريخه قبل أو يساوي هذا التاريخ.
          </p>
        </div>

        {/* ── Unlock Action ── */}
        <div className="rounded-2xl border border-white/10 p-5 space-y-4" style={{ background: "var(--erp-bg-card)" }}>
          <div className="flex items-center gap-2">
            <LockOpen className="w-4 h-4 text-green-400" />
            <p className="text-white font-bold text-sm">فتح الفترة المالية</p>
          </div>
          {locked ? (
            <>
              <p className="text-white/40 text-xs leading-relaxed">
                فتح الفترة يتطلب تقديم سبب واضح ويُسجَّل فوراً في سجل التدقيق.
                هذه العملية للمدير فقط.
              </p>
              <button
                onClick={() => setShowUnlockDialog(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/10 border border-green-500/25 text-green-400 font-semibold text-sm hover:bg-green-500/20 transition-all"
              >
                <LockOpen className="w-4 h-4" />
                فتح الفترة
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-white/25">
              <LockOpen className="w-8 h-8" />
              <p className="text-xs text-center">الفترة مفتوحة حالياً<br />لا يلزم أي إجراء</p>
            </div>
          )}
        </div>
      </div>

      {/* ── How Corrections Work ── */}
      <div className="rounded-2xl border border-white/8 p-5" style={{ background: "var(--erp-bg-card)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-blue-400" />
          <p className="text-white font-bold text-sm">كيف يتم التصحيح بعد الإغلاق؟</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: "🔄", title: "سند عكسي", desc: "لسند إيصال أو صرف مقفل — أنشئ سنداً معاكساً بنفس المبلغ مرتبطاً بالأصلي" },
            { icon: "📝", title: "فاتورة إرجاع", desc: "لفاتورة مبيعات مقفلة — استخدم فاتورة إرجاع ولا تعدّل الأصل مباشرة" },
            { icon: "↩️", title: "مصروف عكسي", desc: "لمصروف خاطئ — أنشئ مصروفاً سالباً ثم أنشئ المصروف الصحيح" },
          ].map(c => (
            <div key={c.title} className="rounded-xl p-3 bg-white/3 border border-white/6">
              <p className="text-lg mb-1">{c.icon}</p>
              <p className="text-white/80 font-semibold text-xs mb-1">{c.title}</p>
              <p className="text-white/35 text-[11px] leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Audit Log ── */}
      <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "var(--erp-bg-card)" }}>
        <button
          onClick={() => setShowAuditLog(p => !p)}
          className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-white/3 transition-all"
        >
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-amber-400" />
            <p className="text-white font-bold text-sm">سجل التدقيق المالي</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${showAuditLog ? "rotate-180" : ""}`} />
        </button>

        {showAuditLog && (
          <div className="border-t border-white/8">
            {logsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-white/40">
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري تحميل السجل...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-white/25">
                <ClipboardList className="w-8 h-8" />
                <p className="text-sm">لا توجد سجلات بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8">
                      {["الإجراء", "النوع", "المستخدم", "التوقيت", "التفاصيل"].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-white/30 text-xs font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, i) => {
                      const actionInfo = ACTION_LABELS[log.action] ?? { label: log.action, color: "text-white/40 bg-white/5 border-white/10" };
                      const detail = log.new_value
                        ? Object.entries(log.new_value as Record<string, unknown>)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")
                        : "—";
                      return (
                        <tr key={log.id} className={`border-b border-white/5 hover:bg-white/3 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${actionInfo.color}`}>
                              {actionInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/50 text-xs">{log.record_type}</td>
                          <td className="px-4 py-3 text-white/70 text-xs font-medium">{log.username ?? "—"}</td>
                          <td className="px-4 py-3 text-white/40 text-xs" dir="ltr">
                            {new Date(log.created_at).toLocaleString("ar-EG")}
                          </td>
                          <td className="px-4 py-3 text-white/35 text-[11px] max-w-[200px] truncate" title={detail}>{detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Unlock Dialog ── */}
      {showUnlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-5" style={{ background: "var(--erp-bg-card)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <LockOpen className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-bold">تأكيد فتح الفترة المالية</p>
                <p className="text-white/40 text-xs">هذه العملية تسجَّل في سجل التدقيق</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400/80 text-xs leading-relaxed">
              ⚠️ بعد فتح الفترة، يمكن تعديل السجلات القديمة مباشرة.
              تأكد من وجود سبب موثَّق قبل المتابعة.
            </div>

            <div className="space-y-2">
              <label className="text-white/50 text-xs font-semibold">سبب فتح الفترة *</label>
              <textarea
                value={unlockReason}
                onChange={e => setUnlockReason(e.target.value)}
                placeholder="اكتب سبباً واضحاً لفتح الفترة المالية..."
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 bg-[#1A2235] border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50 resize-none"
              />
              <p className="text-white/25 text-[10px]">{unlockReason.length} / 3 أحرف كحد أدنى</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowUnlockDialog(false); setUnlockReason(""); }}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm font-semibold hover:bg-white/5 transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleUnlock}
                disabled={savingUnlock || unlockReason.trim().length < 3}
                className="flex-1 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-500/25 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {savingUnlock ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockOpen className="w-4 h-4" />}
                تأكيد الفتح
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
