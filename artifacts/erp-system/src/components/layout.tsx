import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  Users, 
  Receipt, 
  Wallet, 
  FileText,
  CreditCard,
  TrendingUp,
  Settings,
  Truck,
  BookOpen,
  BookMarked,
  HandCoins,
  ArrowDownToLine,
  ArrowLeftRight,
  Activity,
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { name: "لوحة القيادة", href: "/", icon: LayoutDashboard },
  { name: "المبيعات", href: "/sales", icon: Receipt },
  { name: "المشتريات", href: "/purchases", icon: CreditCard },
  { name: "العملاء", href: "/customers", icon: Users },
  { name: "الموردون", href: "/suppliers", icon: Truck },
  { name: "المصروفات", href: "/expenses", icon: Wallet },
  { name: "الإيرادات", href: "/income", icon: TrendingUp },
  { name: "سندات القبض", href: "/receipt-vouchers", icon: HandCoins },
  { name: "سندات التوريد", href: "/deposit-vouchers", icon: ArrowDownToLine },
  { name: "تحويل الخزائن", href: "/safe-transfers", icon: ArrowLeftRight },
  { name: "الحركات المالية", href: "/financial-transactions", icon: Activity },
  { name: "دليل الحسابات", href: "/accounts", icon: BookOpen },
  { name: "القيود اليومية", href: "/journal-entries", icon: BookMarked },
  { name: "التقارير", href: "/reports", icon: FileText },
  { name: "الإعدادات", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background relative flex" dir="rtl">
      <div 
        className="fixed inset-0 z-0 opacity-40 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-mesh.png)` }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-br from-black/80 via-background/90 to-black/90 pointer-events-none" />

      {/* Sidebar */}
      <aside className="relative z-10 w-64 glass-panel border-r-0 border-l m-4 rounded-3xl overflow-hidden flex-col hidden lg:flex">
        <div className="p-4 flex flex-col items-center gap-2 border-b border-white/10 bg-black/30">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png`} 
            alt="Halal Tech" 
            className="w-16 h-16 object-contain rounded-2xl"
          />
          <div className="text-center">
            <h1 className="text-base font-black text-amber-400 tracking-widest">Halal Tech</h1>
            <p className="text-xs text-white/40 mt-0.5">الحلال = البركة</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block group">
                <div className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-300 relative
                  ${isActive ? 'text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}
                `}>
                  {isActive && (
                    <motion.div 
                      layoutId="active-nav" 
                      className="absolute inset-0 bg-amber-500/15 border border-amber-500/30 rounded-2xl -z-10"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'group-hover:text-white transition-colors'}`} />
                  <span className="font-medium text-sm">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5 text-center">
          <p className="text-xs text-white/20">نظام ERP الإداري v1.0</p>
        </div>
      </aside>

      {/* Mobile Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-white/10 rounded-t-3xl p-2 flex justify-around">
        {navItems.slice(0, 5).map((item) => (
          <Link key={item.href} href={item.href} className={`p-3 rounded-xl ${location === item.href ? 'bg-amber-500/20 text-amber-400' : 'text-white/50'}`}>
            <item.icon className="w-6 h-6" />
          </Link>
        ))}
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col p-4 lg:p-6 overflow-hidden mb-20 lg:mb-0 max-h-screen">
        <header className="glass-panel rounded-3xl p-4 flex justify-between items-center mb-4 shrink-0 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full" />
            <h2 className="text-lg lg:text-xl font-bold text-white tracking-wide">
              {navItems.find(i => i.href === location)?.name || "مرحباً بك"}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-white/50 hidden sm:block">
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-amber-500/30">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="logo" className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-2">
          {children}
        </div>
      </main>
    </div>
  );
}
