import { useEffect, useState } from "react";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { COLOR_MAP, type PermGroup } from "./_constants";

/* ─── Field Label ─── */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: "var(--erp-text-3)" }}>
      {children}
    </label>
  );
}

/* ─── Input ─── */
export function SInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all ${props.className ?? ""}`}
    />
  );
}

/* ─── Select ─── */
export function SSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all appearance-none cursor-pointer ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
}

/* ─── Buttons ─── */
export function PrimaryBtn({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
        bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-sm
        transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]
        active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed ${className}`}
    >{children}</button>
  );
}

export function DangerBtn({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
        bg-red-600 hover:bg-red-700 text-white font-bold text-sm
        transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >{children}</button>
  );
}

export function GhostBtn({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...p}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
        border border-white/15 text-white/60 hover:text-white hover:border-white/30
        font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 ${className}`}
    >{children}</button>
  );
}

/* ─── Modal Shell ─── */
export function Modal({
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

/* ─── Page Header ─── */
export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
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

/* ─── Section Card ─── */
export function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/8 p-5 ${className}`}
      style={{ background: "var(--erp-bg-card)" }}
    >
      {children}
    </div>
  );
}

/* ─── Card Skeleton ─── */
export function CardSkeleton() {
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

/* ─── Empty State ─── */
export function EmptyState({ icon: Icon, title, sub }: { icon: React.FC<{ className?: string }>; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-white/20" />
      </div>
      <p className="text-white/40 font-semibold">{title}</p>
      {sub && <p className="text-white/20 text-sm mt-1">{sub}</p>}
    </div>
  );
}

/* ─── Permission Toggle ─── */
export function PermToggle({ active, color }: { active: boolean; color: string }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.amber;
  return (
    <div style={{
      position: "relative", width: 36, height: 20, borderRadius: 99, flexShrink: 0,
      background: active ? c.toggleOn : "rgba(255,255,255,0.12)",
      transition: "background 0.2s ease",
    }}>
      <span style={{
        position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%",
        background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        transition: "left 0.2s ease, right 0.2s ease",
        ...(active ? { right: 2, left: "auto" } : { left: 2, right: "auto" }),
      }} />
    </div>
  );
}

/* ─── Permission Group Card ─── */
export function PermissionGroupCard({
  group, permissions, onChange,
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
          >
            {allOn ? "إلغاء الكل" : "تحديد الكل"}
          </button>
          {open
            ? <ChevronDown className="w-4 h-4" style={{ color: "var(--erp-text-4)" }} />
            : <ChevronRight className="w-4 h-4" style={{ color: "var(--erp-text-4)" }} />
          }
        </div>
      </div>
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
                style={{ background: active ? "rgba(255,255,255,0.04)" : "transparent" }}
              >
                <span className="text-xs leading-snug" style={{
                  color: active ? "var(--erp-text-1)" : "var(--erp-text-3)",
                  fontWeight: active ? 600 : 400,
                }}>
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

/* ─── Section Title Row ─── */
export function SectionTitle({ icon: Icon, title, sub }: { icon: React.FC<{ className?: string }>; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-amber-400" />
      </div>
      <div>
        <p className="font-bold text-white text-sm">{title}</p>
        {sub && <p className="text-white/35 text-xs">{sub}</p>}
      </div>
    </div>
  );
}
