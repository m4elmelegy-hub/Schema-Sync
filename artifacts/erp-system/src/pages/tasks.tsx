import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import {
  ShoppingCart, TruckIcon, Wallet, TrendingUp,
  HandCoins, ArrowDownToLine, ArrowLeftRight,
  RotateCcw, Users, Package, ArrowLeft,
  Layers, BarChart3
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface QuickStats {
  total_sales_today: number;
  total_expenses_today: number;
  total_income_today: number;
  net_profit: number;
  total_customer_debts: number;
  total_supplier_debts: number;
}

interface ActionCard {
  title: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  href: string;
  stat?: { label: string; value: string; color: string };
}

export default function Tasks() {
  const [, setLocation] = useLocation();

  const { data: stats } = useQuery<QuickStats>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => fetch(api("/api/dashboard/stats")).then(r => r.json()),
  });

  const { data: safes = [] } = useQuery<{ id: number; name: string; balance: number }[]>({
    queryKey: ["/api/settings/safes"],
    queryFn: () => fetch(api("/api/settings/safes")).then(r => r.json()),
  });

  const totalSafeBalance = safes.reduce((s, safe) => s + Number(safe.balance), 0);

  const mainActions: ActionCard[] = [
    {
      title: "فاتورة مبيعات",
      subtitle: "تسجيل عملية بيع جديدة",
      icon: ShoppingCart,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/15",
      border: "border-emerald-500/20 hover:border-emerald-500/40",
      href: "/sales",
      stat: stats ? { label: "مبيعات اليوم", value: formatCurrency(stats.total_sales_today), color: "text-emerald-400" } : undefined,
    },
    {
      title: "فاتورة مشتريات",
      subtitle: "تسجيل عملية شراء من مورد",
      icon: TruckIcon,
      color: "text-amber-400",
      bg: "bg-amber-500/10 hover:bg-amber-500/15",
      border: "border-amber-500/20 hover:border-amber-500/40",
      href: "/purchases",
      stat: stats ? { label: "رصيد الموردين", value: formatCurrency(stats.total_supplier_debts), color: "text-amber-400" } : undefined,
    },
    {
      title: "مصروف",
      subtitle: "تسجيل مصروف من الخزينة",
      icon: Wallet,
      color: "text-red-400",
      bg: "bg-red-500/10 hover:bg-red-500/15",
      border: "border-red-500/20 hover:border-red-500/40",
      href: "/expenses",
      stat: stats ? { label: "مصروفات اليوم", value: formatCurrency(stats.total_expenses_today), color: "text-red-400" } : undefined,
    },
    {
      title: "إيراد",
      subtitle: "تسجيل إيراد للخزينة",
      icon: TrendingUp,
      color: "text-teal-400",
      bg: "bg-teal-500/10 hover:bg-teal-500/15",
      border: "border-teal-500/20 hover:border-teal-500/40",
      href: "/income",
      stat: stats ? { label: "إيرادات اليوم", value: formatCurrency(stats.total_income_today), color: "text-teal-400" } : undefined,
    },
    {
      title: "سند قبض",
      subtitle: "استلام دفعة من عميل",
      icon: HandCoins,
      color: "text-violet-400",
      bg: "bg-violet-500/10 hover:bg-violet-500/15",
      border: "border-violet-500/20 hover:border-violet-500/40",
      href: "/receipt-vouchers",
      stat: stats ? { label: "ديون العملاء", value: formatCurrency(stats.total_customer_debts), color: "text-violet-400" } : undefined,
    },
    {
      title: "سند توريد",
      subtitle: "دفع دفعة لمورد",
      icon: ArrowDownToLine,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10 hover:bg-indigo-500/15",
      border: "border-indigo-500/20 hover:border-indigo-500/40",
      href: "/deposit-vouchers",
    },
    {
      title: "تحويل خزائن",
      subtitle: "نقل رصيد بين الخزائن",
      icon: ArrowLeftRight,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10 hover:bg-cyan-500/15",
      border: "border-cyan-500/20 hover:border-cyan-500/40",
      href: "/safe-transfers",
      stat: { label: "رصيد الخزائن", value: formatCurrency(totalSafeBalance), color: "text-cyan-400" },
    },
    {
      title: "مرتجعات",
      subtitle: "تسجيل مرتجع بيع أو شراء",
      icon: RotateCcw,
      color: "text-orange-400",
      bg: "bg-orange-500/10 hover:bg-orange-500/15",
      border: "border-orange-500/20 hover:border-orange-500/40",
      href: "/sales",
    },
  ];

  const quickLinks = [
    { title: "العملاء", icon: Users, href: "/customers", color: "text-blue-400" },
    { title: "الموردون", icon: TruckIcon, href: "/suppliers", color: "text-amber-400" },
    { title: "المنتجات", icon: Package, href: "/settings", color: "text-emerald-400" },
    { title: "الحركات المالية", icon: Layers, href: "/financial-transactions", color: "text-violet-400" },
    { title: "التقارير", icon: BarChart3, href: "/reports", color: "text-teal-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">المهام السريعة</h1>
        <p className="text-white/40 text-sm mt-1">تنفيذ العمليات المالية من مكان واحد</p>
      </div>

      {/* Today summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-panel rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5">
            <p className="text-white/40 text-xs mb-1">مبيعات اليوم</p>
            <p className="text-emerald-400 font-black text-lg">{formatCurrency(stats.total_sales_today)}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-red-500/20 bg-red-500/5">
            <p className="text-white/40 text-xs mb-1">مصروفات اليوم</p>
            <p className="text-red-400 font-black text-lg">{formatCurrency(stats.total_expenses_today)}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-teal-500/20 bg-teal-500/5">
            <p className="text-white/40 text-xs mb-1">إيرادات اليوم</p>
            <p className="text-teal-400 font-black text-lg">{formatCurrency(stats.total_income_today)}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5">
            <p className="text-white/40 text-xs mb-1">صافي الربح</p>
            <p className={`font-black text-lg ${stats.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(stats.net_profit)}
            </p>
          </div>
        </div>
      )}

      {/* Main actions grid */}
      <div>
        <h2 className="text-sm font-bold text-white/50 mb-3 uppercase tracking-widest">العمليات الرئيسية</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {mainActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.href + action.title}
                onClick={() => setLocation(action.href)}
                className={`glass-panel rounded-2xl p-4 text-right border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group ${action.bg} ${action.border}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${action.bg} border ${action.border}`}>
                    <Icon className={`w-5 h-5 ${action.color}`} />
                  </div>
                  <ArrowLeft className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors mt-1 rotate-180" />
                </div>
                <p className={`font-black text-base ${action.color}`}>{action.title}</p>
                <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{action.subtitle}</p>
                {action.stat && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-white/30 text-xs">{action.stat.label}</p>
                    <p className={`font-bold text-sm mt-0.5 ${action.stat.color}`}>{action.stat.value}</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-bold text-white/50 mb-3 uppercase tracking-widest">روابط سريعة</h2>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(link => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => setLocation(link.href)}
                className="flex items-center gap-2 px-4 py-2.5 glass-panel rounded-2xl border border-white/10 hover:border-white/20 transition-all text-sm font-medium text-white/70 hover:text-white"
              >
                <Icon className={`w-4 h-4 ${link.color}`} />
                {link.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
