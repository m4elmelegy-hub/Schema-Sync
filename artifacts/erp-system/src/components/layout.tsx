import { ReactNode, useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { useWarehouse } from "@/contexts/warehouse";
import { authFetch } from "@/lib/auth-fetch";
import { safeArray } from "@/lib/safe-data";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, canAccess, type UserRole } from "@/lib/rbac";
import { hasPermission } from "@/lib/permissions";
import { LogOut, Warehouse, Search, X } from "lucide-react";
import { PageTransition } from "@/components/page-transition";
import { AlertBell } from "@/components/alert-bell";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ── Nav sections ───────────────────────────────── */
const NAV_SECTIONS = [
  { label: "الرئيسية",   hrefs: ["/", "/treasury"] },
  { label: "التجارة",    hrefs: ["/pos", "/sales", "/purchases", "/products", "/inventory", "/customers"] },
  { label: "المالية",    hrefs: ["/income", "/expenses", "/reports"] },
  { label: "المحاسبة",   hrefs: ["/accounts", "/journal-entries"] },
  { label: "النظام",     hrefs: ["/settings"] },
];

interface LayoutProps { children: ReactNode; }

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير", manager: "مشرف", cashier: "كاشير", salesperson: "مندوب",
};
const ROLE_DOT: Record<string, string> = {
  admin: "#f59e0b", manager: "#60a5fa", cashier: "#34d399", salesperson: "#a78bfa",
};

function getInitials(name: string) {
  const p = name.trim().split(" ");
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2);
}

/* ─────────────────────────────────────────────────
   TOPBAR SEARCH
   Keyboard: ↑↓ navigate, Enter confirm, Esc close
───────────────────────────────────────────────── */
function TopbarSearch({ navItems, isDark }: { navItems: typeof NAV_ITEMS; isDark: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = query.trim()
    ? navItems.filter(i => i.name.includes(query.trim()) || i.href.includes(query.toLowerCase())).slice(0, 7)
    : navItems.slice(0, 7);

  const go = useCallback((href: string) => {
    navigate(href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }, [navigate]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[idx]) go(results[idx].href);
    if (e.key === "Escape")    { setOpen(false); inputRef.current?.blur(); }
  };

  useEffect(() => setIdx(0), [query]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const iconColor = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
  const inputColor = isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.75)";

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "240px", flexShrink: 0 }}>
      <div className="erp-topbar-search">
        <Search style={{ width: 14, height: 14, color: iconColor, flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="ابحث في الصفحات..."
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontSize: "12.5px", fontFamily: "inherit", color: inputColor,
            caretColor: "#f59e0b",
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: iconColor, display: "flex" }}>
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="erp-search-dropdown">
          {results.map((item, i) => (
            <div
              key={item.href}
              className={`erp-search-item ${i === idx ? "active" : ""}`}
              onMouseDown={() => go(item.href)}
              onMouseEnter={() => setIdx(i)}>
              <item.icon style={{ width: 14, height: 14, opacity: 0.55, flexShrink: 0 }} />
              <span>{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   MAIN LAYOUT
───────────────────────────────────────────────── */
export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { settings } = useAppSettings();
  const isDark = (settings.theme ?? "dark") === "dark";

  const { currentWarehouseId, setWarehouseId } = useWarehouse();

  const { data: warehousesRaw } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/warehouses"],
    queryFn: () => authFetch(api("/api/settings/warehouses")).then(async r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return safeArray(j);
    }),
    staleTime: 5 * 60_000,
  });
  const warehouses = safeArray(warehousesRaw);

  const role = (user?.role ?? "cashier") as UserRole;
  const canSelectWarehouse = role === "admin" || role === "manager";

  useEffect(() => {
    if (!canSelectWarehouse && warehouses.length > 0) {
      const firstId = String(warehouses[0].id);
      if (currentWarehouseId !== firstId) setWarehouseId(firstId);
    }
  }, [warehouses, canSelectWarehouse, currentWarehouseId, setWarehouseId]);

  const visibleNav = NAV_ITEMS.filter(item => {
    if (!canAccess(role, item.href)) return false;
    if (item.href === "/inventory"        && !hasPermission(user, "can_view_inventory"))      return false;
    if (item.href === "/products"         && !hasPermission(user, "can_view_products"))       return false;
    if (item.href === "/customers"        && !hasPermission(user, "can_view_customers"))      return false;
    if (item.href === "/expenses"         && !hasPermission(user, "can_view_expenses"))       return false;
    if (item.href === "/reports"          && !hasPermission(user, "can_view_reports"))        return false;
    if (item.href === "/receipt-vouchers" && !hasPermission(user, "can_add_receipt_voucher")) return false;
    if (item.href === "/payment-vouchers" && !hasPermission(user, "can_add_payment_voucher")) return false;
    if (item.href === "/purchases"        && !hasPermission(user, "can_create_purchase"))     return false;
    return true;
  });

  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  const pageTitle = NAV_ITEMS.find(i => i.href === location)?.name
    || (location === "/inventory"         ? "المخزون"
      : location === "/expenses"          ? "المصروفات"
      : location === "/income"            ? "الإيرادات"
      : location === "/receipt-vouchers"  ? "سندات القبض"
      : location === "/deposit-vouchers"  ? "سندات التوريد"
      : location === "/payment-vouchers"  ? "سندات الصرف"
      : location === "/safe-transfers"    ? "تحويل الخزائن"
      : location === "/accounts"          ? "شجرة الحسابات"
      : location === "/journal-entries"   ? "القيود اليومية"
      : "مرحباً بك");

  /* ── Colors ── */
  const sidebarBg    = isDark ? "hsla(225,28%,6.5%,0.98)"     : "rgba(255,255,255,0.99)";
  const sidebarBdr   = isDark ? "1px solid rgba(255,255,255,0.055)" : "1px solid rgba(0,0,0,0.08)";
  const topbarBg     = isDark ? "hsla(225,25%,7%,0.88)"        : "rgba(255,255,255,0.90)";
  const topbarBdr    = isDark ? "1px solid rgba(255,255,255,0.06)"  : "1px solid rgba(0,0,0,0.08)";
  const textPrimary  = isDark ? "rgba(255,255,255,0.92)"        : "#0f172a";
  const textMuted    = isDark ? "rgba(255,255,255,0.30)"        : "rgba(0,0,0,0.36)";
  const chipBg       = isDark ? "rgba(255,255,255,0.05)"        : "rgba(0,0,0,0.05)";
  const chipBdr      = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.09)";

  return (
    <div className="min-h-screen flex" dir="rtl">

      {/* ══════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════ */}
      <aside
        className="hidden lg:flex flex-col shrink-0 z-20"
        style={{
          width: "228px",
          height: "100vh",
          position: "sticky",
          top: 0,
          background: sidebarBg,
          borderLeft: sidebarBdr,
          backdropFilter: "blur(24px)",
        }}>

        {/* Logo strip */}
        <div
          className="flex items-center gap-3 px-4"
          style={{ height: "56px", borderBottom: sidebarBdr, flexShrink: 0 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 34, height: 34, borderRadius: 10, overflow: "hidden",
              background: isDark ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.10)",
              border: "1.5px solid rgba(245,158,11,0.22)",
            }}>
            <img
              src={logoSrc}
              alt={settings.companyName}
              style={{ width: 26, height: 26, objectFit: "contain" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: isDark ? "#f59e0b" : "#b45309", lineHeight: 1.2 }} className="truncate">
              {settings.companyName}
            </p>
            <p style={{ fontSize: 10.5, color: textMuted, lineHeight: 1.2 }} className="truncate">
              {settings.companySlogan}
            </p>
          </div>
        </div>

        {/* User chip */}
        {user && (
          <div
            className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl px-3"
            style={{ height: 44, background: chipBg, border: chipBdr, flexShrink: 0 }}>
            {/* Avatar */}
            <div
              className="flex items-center justify-center shrink-0 text-xs font-black"
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
                color: "#000", fontSize: 11,
              }}>
              {getInitials(user.name)}
            </div>
            {/* Name + role */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: textPrimary, lineHeight: 1.2 }} className="truncate">
                {user.name}
              </p>
              <div className="flex items-center gap-1" style={{ marginTop: 2 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: ROLE_DOT[user.role] ?? "#94a3b8", flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: textMuted, fontWeight: 600 }}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </div>
            </div>
            {/* Logout */}
            <button
              onClick={logout}
              title="تسجيل الخروج"
              className="erp-icon-btn"
              style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", color: textMuted }}>
              <LogOut style={{ width: 13, height: 13 }} />
            </button>
          </div>
        )}

        {/* Warehouse selector */}
        {warehouses.length > 0 && canSelectWarehouse && (
          <div
            className="mx-3 mt-2 rounded-lg px-3"
            style={{
              flexShrink: 0, paddingTop: 8, paddingBottom: 8,
              background: isDark ? "rgba(245,158,11,0.05)" : "rgba(180,83,9,0.05)",
              border: isDark ? "1px solid rgba(245,158,11,0.12)" : "1px solid rgba(180,83,9,0.11)",
            }}>
            <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
              <Warehouse style={{ width: 11, height: 11, color: isDark ? "rgba(245,158,11,0.50)" : "rgba(180,83,9,0.50)" }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: textMuted }}>
                المخزن
              </span>
            </div>
            <select
              value={currentWarehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              style={{
                width: "100%", background: "transparent", border: "none", outline: "none",
                fontSize: 12.5, fontWeight: 600, color: textPrimary, cursor: "pointer",
                fontFamily: "inherit", appearance: "none",
              }}>
              <option value="" style={{ background: isDark ? "#111827" : "#fff" }}>كل المخازن</option>
              {warehouses.map(w => (
                <option key={w.id} value={String(w.id)} style={{ background: isDark ? "#111827" : "#fff" }}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 mt-1" style={{ scrollbarWidth: "none" }}>
          {NAV_SECTIONS.map((section, si) => {
            const items = visibleNav.filter(i => section.hrefs.includes(i.href));
            if (!items.length) return null;
            return (
              <div key={section.label}>
                <div
                  className="erp-divider-label"
                  style={{ paddingTop: si === 0 ? 10 : 16, paddingBottom: 4 }}>
                  {section.label}
                </div>
                {items.map(item => {
                  const active = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className={`nav-item ${active ? "active" : ""}`}>
                        <item.icon
                          style={{ width: 16, height: 16, flexShrink: 0, opacity: active ? 1 : 0.55,
                            color: active ? "#f59e0b" : "inherit" }}
                        />
                        <span style={{ flex: 1 }}>{item.name}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div
          className="flex items-center justify-between px-4"
          style={{ height: 40, borderTop: sidebarBdr, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: textMuted }}>ERP v2.0</span>
          <div className="glow-dot" />
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MOBILE BOTTOM NAV
      ══════════════════════════════════════════ */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-2"
        style={{
          height: 56,
          background: isDark ? "hsla(225,28%,7%,0.96)" : "rgba(255,255,255,0.96)",
          borderTop: topbarBdr,
          backdropFilter: "blur(20px)",
        }}>
        {visibleNav.slice(0, 5).map(item => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className="flex flex-col items-center gap-1 rounded-xl px-3 py-2"
                style={{
                  color: active ? "#f59e0b" : (isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.38)"),
                  background: active ? "rgba(245,158,11,0.08)" : "transparent",
                  transition: "color 0.15s ease, background 0.15s ease",
                }}>
                <item.icon style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>{item.name.split(" ")[0]}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* ══════════════════════════════════════════
          MAIN CONTENT COLUMN
      ══════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden pb-14 lg:pb-0" style={{ minWidth: 0 }}>

        {/* ── Topbar ── */}
        <header
          className="flex items-center gap-3 shrink-0"
          style={{
            height: "56px",
            padding: "0 20px",
            background: topbarBg,
            borderBottom: topbarBdr,
            backdropFilter: "blur(20px)",
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}>

          {/* Left: Page info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              style={{
                width: 3, height: 18, borderRadius: 99, flexShrink: 0,
                background: "linear-gradient(to bottom, #f59e0b, #d97706)",
              }}
            />
            <div style={{ minWidth: 0 }}>
              <h2
                style={{ fontSize: 14.5, fontWeight: 800, color: textPrimary, lineHeight: 1.2 }}
                className="truncate">
                {pageTitle}
              </h2>
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden md:flex justify-center" style={{ flexShrink: 0 }}>
            <TopbarSearch navItems={visibleNav} isDark={isDark} />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <AlertBell />
            <ThemeToggle />
            {user && (
              <>
                <div style={{ width: 1, height: 22, background: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)", flexShrink: 0 }} />
                <div
                  className="hidden md:flex items-center gap-2 rounded-xl px-2.5 py-1.5"
                  style={{ background: chipBg, border: chipBdr, cursor: "default", flexShrink: 0 }}
                >
                  <div
                    className="flex items-center justify-center shrink-0 font-black"
                    style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: "linear-gradient(135deg,#f59e0b,#d97706)",
                      color: "#000", fontSize: 10,
                    }}>
                    {getInitials(user.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: textPrimary, lineHeight: 1.2, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.name}
                    </p>
                    <div className="flex items-center gap-1" style={{ marginTop: 1 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: ROLE_DOT[user.role] ?? "#94a3b8", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: textMuted, fontWeight: 600 }}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "24px" }}>
          <PageTransition>
            {children}
          </PageTransition>
        </div>
      </main>
    </div>
  );
}
