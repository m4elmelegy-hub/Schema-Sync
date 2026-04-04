import { ReactNode, useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { useWarehouse } from "@/contexts/warehouse";
import { authFetch } from "@/lib/auth-fetch";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, canAccess, type UserRole } from "@/lib/rbac";
import { hasPermission } from "@/lib/permissions";
import { LogOut, ChevronLeft, Warehouse, Search, X } from "lucide-react";
import { PageTransition } from "@/components/page-transition";
import { AlertBell } from "@/components/alert-bell";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

const NAV_SECTIONS = [
  { label: "الرئيسية",   hrefs: ["/", "/tasks"] },
  { label: "التجارة",    hrefs: ["/sales", "/purchases", "/products", "/inventory", "/customers"] },
  { label: "المالية",    hrefs: ["/profits", "/income", "/expenses", "/financial-transactions", "/reports"] },
  { label: "المحاسبة",   hrefs: ["/accounts", "/journal-entries", "/receipt-vouchers", "/deposit-vouchers", "/payment-vouchers", "/safe-transfers"] },
  { label: "النظام",     hrefs: ["/settings"] },
];

interface LayoutProps { children: ReactNode; }

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير النظام",
  manager: "مشرف",
  cashier: "كاشير",
  salesperson: "مندوب مبيعات",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  cashier: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  salesperson: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

/* ── Topbar search component ────────────────────── */
function TopbarSearch({ navItems, isDark }: { navItems: typeof NAV_ITEMS; isDark: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const results = query.trim()
    ? navItems.filter(i =>
        i.name.includes(query.trim()) ||
        i.href.includes(query.trim().toLowerCase())
      ).slice(0, 6)
    : navItems.slice(0, 6);

  const handleSelect = useCallback((href: string) => {
    navigate(href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }, [navigate]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[activeIdx]) handleSelect(results[activeIdx].href);
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "240px" }}>
      <div className="erp-topbar-search">
        <Search style={{
          width: 14, height: 14, flexShrink: 0,
          color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.30)",
        }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="ابحث في الصفحات..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: "12.5px",
            fontFamily: "inherit",
            color: isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.75)",
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
              color: isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)" }}>
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="erp-search-dropdown">
          {results.map((item, i) => (
            <div
              key={item.href}
              className={`erp-search-item ${i === activeIdx ? "active" : ""}`}
              onMouseDown={() => handleSelect(item.href)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <item.icon style={{ width: 15, height: 15, opacity: 0.65, flexShrink: 0 }} />
              <span>{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { settings } = useAppSettings();
  const isDark = (settings.theme ?? "dark") === "dark";

  const { currentWarehouseId, setWarehouseId } = useWarehouse();

  const { data: warehouses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/warehouses"],
    queryFn: () => authFetch(api("/api/settings/warehouses")).then(r => {
      if (!r.ok) throw new Error("خطأ في جلب المخازن");
      return r.json();
    }),
    staleTime: 5 * 60_000,
  });

  const role = (user?.role ?? "cashier") as UserRole;
  const canSelectWarehouse = role === "admin" || role === "manager";

  useEffect(() => {
    if (!canSelectWarehouse && warehouses.length > 0) {
      const firstId = String(warehouses[0].id);
      if (currentWarehouseId !== firstId) {
        setWarehouseId(firstId);
      }
    }
  }, [warehouses, canSelectWarehouse, currentWarehouseId, setWarehouseId]);

  const visibleNav = NAV_ITEMS.filter(item => {
    if (!canAccess(role, item.href)) return false;
    if (item.href === "/inventory"        && !hasPermission(user, "can_view_inventory"))       return false;
    if (item.href === "/products"         && !hasPermission(user, "can_view_products"))        return false;
    if (item.href === "/customers"        && !hasPermission(user, "can_view_customers"))       return false;
    if (item.href === "/expenses"         && !hasPermission(user, "can_view_expenses"))        return false;
    if (item.href === "/reports"          && !hasPermission(user, "can_view_reports"))         return false;
    if (item.href === "/receipt-vouchers" && !hasPermission(user, "can_add_receipt_voucher"))  return false;
    if (item.href === "/payment-vouchers" && !hasPermission(user, "can_add_payment_voucher"))  return false;
    if (item.href === "/purchases"        && !hasPermission(user, "can_create_purchase"))      return false;
    return true;
  });

  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  const pageTitle = NAV_ITEMS.find(i => i.href === location)?.name
    || (location === "/expenses"          ? "المصروفات"
      : location === "/income"            ? "الإيرادات"
      : location === "/receipt-vouchers"  ? "سندات القبض"
      : location === "/deposit-vouchers"  ? "سندات التوريد"
      : location === "/payment-vouchers"  ? "سندات الصرف"
      : location === "/safe-transfers"    ? "تحويل الخزائن"
      : location === "/accounts"          ? "شجرة الحسابات"
      : location === "/journal-entries"   ? "القيود اليومية"
      : "مرحباً بك");

  const today = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="min-h-screen relative flex" dir="rtl"
      style={{ background: isDark ? "hsl(225,25%,5%)" : "var(--bg-base)" }}>

      {/* Ambient background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-[0.03]"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)" }} />
      </div>

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside
        className="relative z-20 hidden lg:flex flex-col shrink-0"
        style={{
          width: "232px",
          height: "100vh",
          position: "sticky",
          top: 0,
          background: isDark
            ? "linear-gradient(180deg, hsla(225,25%,7%,0.98) 0%, hsla(225,25%,6%,0.98) 100%)"
            : "rgba(255,255,255,0.98)",
          borderLeft: isDark ? "1px solid rgba(255,255,255,0.055)" : "1px solid rgba(0,0,0,0.08)",
          backdropFilter: "blur(24px)",
        }}>

        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-3"
          style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.055)" : "1px solid rgba(0,0,0,0.08)" }}>
          <div
            className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))",
              border: "1.5px solid rgba(245,158,11,0.25)",
            }}>
            <img src={logoSrc} alt={settings.companyName}
              className="w-7 h-7 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black truncate" style={{ color: isDark ? "#f59e0b" : "#b45309" }}>
              {settings.companyName}
            </h1>
            <p className="text-[10.5px] truncate" style={{ color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.38)" }}>
              {settings.companySlogan}
            </p>
          </div>
        </div>

        {/* User Card */}
        {user && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-2xl flex items-center gap-2.5"
            style={{
              background: isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.055)",
              border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.10)",
            }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000" }}>
              {getInitials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold truncate" style={{ color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)" }}>
                {user.name}
              </p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-semibold ${ROLE_COLORS[user.role] || ROLE_COLORS.cashier}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
            <button
              onClick={logout}
              title="تسجيل الخروج"
              className="erp-icon-btn"
              style={{ width: 28, height: 28, borderRadius: 8 }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = "#f87171";
                (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.12)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(248,113,113,0.20)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = "";
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.borderColor = "";
              }}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Warehouse Selector */}
        {warehouses.length > 0 && canSelectWarehouse && (
          <div className="mx-3 mt-2 px-3 py-2.5 rounded-xl"
            style={{
              background: isDark ? "rgba(245,158,11,0.06)" : "rgba(180,83,9,0.06)",
              border: isDark ? "1px solid rgba(245,158,11,0.14)" : "1px solid rgba(180,83,9,0.13)",
            }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Warehouse className="w-3 h-3" style={{ color: isDark ? "rgba(245,158,11,0.55)" : "rgba(180,83,9,0.55)" }} />
              <p className="text-[9.5px] font-bold uppercase tracking-wider"
                style={{ color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.35)" }}>
                المخزن الحالي
              </p>
            </div>
            <select
              value={currentWarehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              className="w-full bg-transparent text-[12.5px] font-semibold appearance-none outline-none cursor-pointer leading-tight"
              style={{ color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.80)" }}
            >
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
        <nav className="flex-1 overflow-y-auto px-3 pb-3 mt-2" style={{ scrollbarWidth: "none" }}>
          {NAV_SECTIONS.map((section, si) => {
            const sectionItems = visibleNav.filter(item => section.hrefs.includes(item.href));
            if (sectionItems.length === 0) return null;
            return (
              <div key={section.label}>
                <div className="erp-divider-label" style={{ marginTop: si === 0 ? 0 : 4 }}>
                  {section.label}
                </div>
                {sectionItems.map(item => {
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`nav-item ${isActive ? "active" : ""}`}
                        style={{
                          height: "38px",
                          borderRadius: "10px",
                          marginBottom: "2px",
                          padding: "0 12px",
                        }}
                      >
                        <item.icon
                          className="erp-nav-icon shrink-0"
                          style={{ color: isActive ? "#f59e0b" : "inherit", opacity: isActive ? 1 : 0.6 }}
                        />
                        <span style={{ fontSize: "13px" }}>{item.name}</span>
                        {isActive && (
                          <ChevronLeft className="w-3 h-3 mr-auto" style={{ opacity: 0.45 }} />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: isDark ? "1px solid rgba(255,255,255,0.055)" : "1px solid rgba(0,0,0,0.08)" }}>
          <p className="text-[10.5px]" style={{ color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.30)" }}>
            ERP v2.0
          </p>
          <div className="glow-dot" />
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-2 py-2"
        style={{
          background: isDark ? "hsla(225,25%,7%,0.96)" : "rgba(255,255,255,0.96)",
          borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.08)",
          backdropFilter: "blur(20px)",
        }}>
        {visibleNav.slice(0, 5).map(item => (
          <Link key={item.href} href={item.href}>
            <div
              className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
              style={{ color: location === item.href ? "#f59e0b" : isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.40)" }}>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name.split(" ")[0]}</span>
            </div>
          </Link>
        ))}
      </nav>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="relative z-10 flex-1 flex flex-col min-h-screen overflow-hidden mb-16 lg:mb-0">

        {/* ── Top Header ── */}
        <header
          className="shrink-0 flex items-center justify-between gap-3 px-5 py-3"
          style={{
            background: isDark ? "hsla(225,25%,6%,0.85)" : "rgba(255,255,255,0.75)",
            borderBottom: isDark ? "1px solid rgba(255,255,255,0.055)" : "1px solid rgba(0,0,0,0.09)",
            backdropFilter: "blur(20px)",
            minHeight: "56px",
          }}>

          {/* Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[3px] h-5 rounded-full shrink-0"
              style={{ background: "linear-gradient(to bottom, #f59e0b, #d97706)" }} />
            <div className="min-w-0">
              <h2 className="text-[14.5px] font-bold truncate"
                style={{ color: isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)", lineHeight: 1.2 }}>
                {pageTitle}
              </h2>
              <p className="text-[11px] hidden sm:block"
                style={{ color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.38)" }}>
                {today}
              </p>
            </div>
          </div>

          {/* Center — Search */}
          <div className="hidden md:flex flex-1 justify-center">
            <TopbarSearch navItems={visibleNav} isDark={isDark} />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            <AlertBell />
            <ThemeToggle />

            {user && (
              <div
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{
                  background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
                  border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.11)",
                }}>
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000" }}>
                  {getInitials(user.name)}
                </div>
                <span
                  className="text-[12.5px] font-semibold"
                  style={{ color: isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.75)" }}>
                  {user.name}
                </span>
                <button
                  onClick={logout}
                  className="erp-icon-btn"
                  style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = ""; }}>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <PageTransition>
            {children}
          </PageTransition>
        </div>
      </main>
    </div>
  );
}
