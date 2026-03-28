import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { 
  LayoutDashboard, Users, Receipt, FileText,
  CreditCard, Settings, BookOpen, BookMarked,
  Activity, ClipboardList, LogOut, UserCircle, TrendingUp, Package,
} from "lucide-react";

interface LayoutProps { children: ReactNode; }

const navItems = [
  { name: "لوحة القيادة",   href: "/",                     icon: LayoutDashboard },
  { name: "المهام السريعة",  href: "/tasks",                icon: ClipboardList },
  { name: "المبيعات",        href: "/sales",                icon: Receipt },
  { name: "المشتريات",       href: "/purchases",            icon: CreditCard },
  { name: "المنتجات",        href: "/products",             icon: Package },
  { name: "العملاء",         href: "/customers",            icon: Users },
  { name: "الأرباح",         href: "/profits",              icon: TrendingUp },
  { name: "الحركات المالية", href: "/financial-transactions", icon: Activity },
  { name: "دليل الحسابات",   href: "/accounts",             icon: BookOpen },
  { name: "القيود اليومية",  href: "/journal-entries",      icon: BookMarked },
  { name: "التقارير",        href: "/reports",              icon: FileText },
  { name: "الإعدادات",       href: "/settings",             icon: Settings },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير", manager: "مشرف", cashier: "كاشير", salesperson: "مندوب",
};

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { settings } = useAppSettings();

  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  const pageTitle = navItems.find(i => i.href === location)?.name
    || (location === "/expenses" ? "المصروفات"
      : location === "/income" ? "الإيرادات"
      : location === "/receipt-vouchers" ? "سندات القبض"
      : location === "/deposit-vouchers" ? "سندات التوريد"
      : location === "/payment-vouchers" ? "سندات التوريد"
      : location === "/safe-transfers" ? "تحويل الخزائن"
      : "مرحباً بك");

  return (
    <div className="min-h-screen bg-background relative flex" dir="rtl">
      <div 
        className="fixed inset-0 z-0 opacity-40 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-mesh.png)` }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-br from-black/80 via-background/90 to-black/90 pointer-events-none" />

      {/* Sidebar */}
      <aside className="relative z-10 w-60 glass-panel border-r-0 border-l m-4 rounded-3xl overflow-hidden flex-col hidden lg:flex">
        {/* Logo */}
        <div className="p-4 flex flex-col items-center gap-2 border-b border-white/10 bg-black/30">
          <img src={logoSrc} alt={settings.companyName} className="w-12 h-12 object-contain rounded-2xl"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="text-center">
            <h1 className="text-sm font-black text-amber-400 tracking-widest">{settings.companyName}</h1>
            <p className="text-xs text-white/30 mt-0.5">{settings.companySlogan}</p>
          </div>
        </div>

        {/* Logged-in user */}
        {user && (
          <div className="mx-3 mt-3 p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <UserCircle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">{user.name}</p>
              <p className="text-white/40 text-xs">{ROLE_LABELS[user.role] || user.role}</p>
            </div>
            <button onClick={logout} title="تسجيل الخروج"
              className="p-1.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto mt-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block group">
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-300 relative
                  ${isActive ? 'text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
                  {isActive && (
                    <motion.div layoutId="active-nav"
                      className="absolute inset-0 bg-amber-500/15 border border-amber-500/30 rounded-2xl -z-10"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon className={`erp-nav-icon shrink-0 ${isActive ? 'text-amber-400' : 'group-hover:text-white transition-colors'}`} />
                  <span className="font-medium text-sm">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5 text-center">
          <p className="text-xs text-white/20">{settings.companyName} ERP v2.0</p>
        </div>
      </aside>

      {/* Mobile Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-white/10 rounded-t-3xl p-2 flex justify-around">
        {[navItems[0], navItems[2], navItems[3], navItems[4], navItems[10]].map((item) => (
          <Link key={item.href} href={item.href} className={`p-3 rounded-xl ${location === item.href ? 'bg-amber-500/20 text-amber-400' : 'text-white/50'}`}>
            <item.icon className="erp-nav-icon" />
          </Link>
        ))}
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col p-4 lg:p-6 overflow-hidden mb-20 lg:mb-0 max-h-screen">
        <header className="glass-panel rounded-3xl p-4 flex justify-between items-center mb-4 shrink-0 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full" />
            <h2 className="text-lg lg:text-xl font-bold text-white tracking-wide">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-white/50 hidden sm:block">
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            {user && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5">
                <UserCircle className="w-4 h-4 text-amber-400" />
                <span className="text-white text-sm font-medium">{user.name}</span>
                <button onClick={logout} className="text-white/30 hover:text-red-400 transition-colors pr-1">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-2">
          {children}
        </div>
      </main>
    </div>
  );
}
