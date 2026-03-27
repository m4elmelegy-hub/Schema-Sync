import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Truck, 
  Receipt, 
  Wallet, 
  FileText,
  CreditCard
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { name: "لوحة القيادة", href: "/", icon: LayoutDashboard },
  { name: "نقطة البيع", href: "/pos", icon: ShoppingCart },
  { name: "المنتجات", href: "/products", icon: Package },
  { name: "المبيعات", href: "/sales", icon: Receipt },
  { name: "المشتريات", href: "/purchases", icon: CreditCard },
  { name: "العملاء", href: "/customers", icon: Users },
  { name: "الموردون", href: "/suppliers", icon: Truck },
  { name: "المصروفات", href: "/expenses", icon: Wallet },
  { name: "الإيرادات", href: "/income", icon: Wallet },
  { name: "التقارير", href: "/reports", icon: FileText },
];

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background relative flex" dir="rtl">
      {/* Background Image */}
      <div 
        className="fixed inset-0 z-0 opacity-40 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-mesh.png)` }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-br from-black/80 via-background/90 to-black/90 pointer-events-none" />

      {/* Sidebar */}
      <aside className="relative z-10 w-72 glass-panel border-r-0 border-l m-4 rounded-3xl overflow-hidden flex flex-col hidden lg:flex">
        <div className="p-8 flex items-center gap-4 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-xl font-black text-black">E</span>
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-l from-white to-white/60">
            النظام الإداري
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block group">
                <div className={`
                  flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 relative
                  ${isActive ? 'text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}
                `}>
                  {isActive && (
                    <motion.div 
                      layoutId="active-nav" 
                      className="absolute inset-0 bg-primary/20 border border-primary/30 rounded-2xl -z-10"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'group-hover:text-white transition-colors'}`} />
                  <span className="font-medium text-lg">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Nav (simplified for brevity) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-white/10 rounded-t-3xl p-2 flex justify-around">
         {navItems.slice(0, 5).map((item) => (
           <Link key={item.href} href={item.href} className={`p-3 rounded-xl ${location === item.href ? 'bg-primary/20 text-primary' : 'text-white/50'}`}>
             <item.icon className="w-6 h-6" />
           </Link>
         ))}
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col p-4 lg:p-8 overflow-hidden mb-20 lg:mb-0 max-h-screen">
        <header className="glass-panel rounded-3xl p-4 lg:p-6 flex justify-between items-center mb-8 shrink-0">
          <h2 className="text-xl lg:text-2xl font-bold text-white tracking-wide">
            {navItems.find(i => i.href === location)?.name || "مرحباً بك"}
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-sm text-white/50 hidden sm:block">
              {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-white/70" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pr-2 pb-2">
          {children}
        </div>
      </main>
    </div>
  );
}
