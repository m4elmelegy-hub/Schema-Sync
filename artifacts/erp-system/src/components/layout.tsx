import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS, canAccess, type UserRole } from "@/lib/rbac";
import { LogOut, ChevronLeft } from "lucide-react";
import { PageTransition } from "@/components/page-transition";

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

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { settings } = useAppSettings();
  const isDark = (settings.theme ?? "dark") === "dark";

  const role = (user?.role ?? "cashier") as UserRole;
  const visibleNav = NAV_ITEMS.filter(item => canAccess(role, item.href));
  const visiblePaths = new Set(visibleNav.map(i => i.href));

  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  const pageTitle = NAV_ITEMS.find(i => i.href === location)?.name
    || (location === "/expenses" ? "المصروفات"
      : location === "/income" ? "الإيرادات"
      : location === "/receipt-vouchers" ? "سندات القبض"
      : location === "/deposit-vouchers" ? "سندات التوريد"
      : location === "/payment-vouchers" ? "سندات الصرف"
      : location === "/safe-transfers" ? "تحويل الخزائن"
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
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-[0.02]"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }} />
      </div>

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside className="relative z-20 hidden lg:flex flex-col w-[230px] shrink-0 bg-white dark:bg-gradient-to-b dark:from-[#111827] dark:to-[#1f2937]"
        style={{
          height: "100vh",
          position: "sticky",
          top: 0,
          borderLeft: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.07)",
        }}>

        {/* Logo Area */}
        <div className="px-5 py-5 flex items-center gap-3"
          style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.06)" }}>
          <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #f59e0b20, #f59e0b10)", border: "1px solid rgba(245,158,11,0.20)" }}>
            <img src={logoSrc} alt={settings.companyName}
              className="w-8 h-8 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black truncate" style={{ color: isDark ? "#f59e0b" : "#b45309" }}>
              {settings.companyName}
            </h1>
            <p className="text-xs truncate" style={{ color: isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.40)" }}>
              {settings.companySlogan}
            </p>
          </div>
        </div>

        {/* User Card */}
        {user && (
          <div className="mx-3 mt-3 px-3 py-3 rounded-2xl flex items-center gap-2.5"
            style={{
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)",
            }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000" }}>
              {getInitials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)" }}>
                {user.name}
              </p>
              <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${ROLE_COLORS[user.role] || ROLE_COLORS.cashier}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
            <button onClick={logout} title="تسجيل الخروج"
              className="p-1.5 rounded-lg transition-all shrink-0"
              style={{ color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.30)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.10)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.30)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 mt-1">
          {visibleNav.map(item => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`nav-item ${isActive ? "active" : ""}`}>
                  <item.icon className="erp-nav-icon shrink-0"
                    style={{ color: isActive ? "#f59e0b" : "inherit", opacity: isActive ? 1 : 0.7 }} />
                  <span>{item.name}</span>
                  {isActive && (
                    <ChevronLeft className="w-3 h-3 mr-auto opacity-50" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.06)" }}>
          <p className="text-xs" style={{ color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.30)" }}>
            ERP v2.0
          </p>
          <div className="glow-dot" />
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-2 py-2"
        style={{
          background: isDark ? "hsla(225,25%,7%,0.95)" : "rgba(255,255,255,0.95)",
          borderTop: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.08)",
          backdropFilter: "blur(20px)",
        }}>
        {visibleNav.slice(0, 5).map(item => (
          <Link key={item.href} href={item.href}>
            <div className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${location === item.href ? "text-amber-400" : "text-white/40"}`}
              style={{ color: location === item.href ? "#f59e0b" : isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.40)" }}>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name.split(" ")[0]}</span>
            </div>
          </Link>
        ))}
      </nav>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="relative z-10 flex-1 flex flex-col min-h-screen overflow-hidden mb-16 lg:mb-0">

        {/* Top Header */}
        <header className="shrink-0 flex items-center justify-between px-6 py-3.5"
          style={{
            background: isDark ? "hsla(225,25%,6%,0.80)" : "rgba(255,255,255,0.70)",
            borderBottom: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.06)",
            backdropFilter: "blur(16px)",
          }}>
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(to bottom, #f59e0b, #d97706)" }} />
            <div>
              <h2 className="text-base font-bold" style={{ color: isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)", lineHeight: 1.2 }}>
                {pageTitle}
              </h2>
              <p className="text-xs hidden sm:block" style={{ color: isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.40)" }}>
                {today}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{
                  background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                  border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000" }}>
                  {getInitials(user.name)}
                </div>
                <span className="text-sm font-medium" style={{ color: isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.75)" }}>
                  {user.name}
                </span>
                <button onClick={logout}
                  style={{ color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.30)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.30)"; }}>
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
