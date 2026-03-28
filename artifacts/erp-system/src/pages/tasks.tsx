import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Activity, ShoppingCart, TruckIcon, Wallet, TrendingUp,
  HandCoins, ArrowDownToLine, ArrowLeftRight, Search,
  TrendingDown, Filter, Calendar
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface Transaction {
  id: number; type: string;
  reference_type: string | null; reference_id: number | null;
  safe_id: number | null; safe_name: string | null;
  customer_id: number | null; customer_name: string | null;
  supplier_id: number | null; supplier_name: string | null;
  amount: number; direction: string;
  description: string | null; date: string | null; created_at: string;
}

const TYPE_META: Record<string, { label: string; icon: React.FC<{ className?: string }>; color: string; bg: string }> = {
  sale_cash:        { label: "بيع نقدي",        icon: ShoppingCart,    color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  sale_credit:      { label: "بيع آجل",          icon: ShoppingCart,    color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20" },
  sale_partial:     { label: "بيع جزئي",         icon: ShoppingCart,    color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  expense:          { label: "مصروف",            icon: Wallet,          color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
  income:           { label: "إيراد",             icon: TrendingUp,      color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  receipt_voucher:  { label: "سند قبض",          icon: HandCoins,       color: "text-teal-400",    bg: "bg-teal-500/10 border-teal-500/20" },
  deposit_voucher:  { label: "سند توريد",         icon: ArrowDownToLine, color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20" },
  transfer_in:      { label: "تحويل وارد",        icon: ArrowLeftRight,  color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20" },
  transfer_out:     { label: "تحويل صادر",        icon: ArrowLeftRight,  color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
  voucher_receipt:  { label: "قبض خزينة",         icon: HandCoins,       color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20" },
  voucher_payment:  { label: "صرف خزينة",         icon: Wallet,          color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/20" },
  purchase:         { label: "مشتريات",           icon: TruckIcon,       color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
};

const DEFAULT_META = { label: "حركة", icon: Activity, color: "text-white/60", bg: "bg-white/5 border-white/10" };

const TYPE_GROUPS: Record<string, string[]> = {
  "all":       [],
  "sales":     ["sale_cash", "sale_credit", "sale_partial"],
  "expenses":  ["expense", "voucher_payment"],
  "income":    ["income", "voucher_receipt"],
  "vouchers":  ["receipt_voucher", "deposit_voucher"],
  "transfers": ["transfer_in", "transfer_out"],
};

const GROUP_LABELS: Record<string, string> = {
  all: "الكل",
  sales: "مبيعات",
  expenses: "مصروفات",
  income: "إيرادات",
  vouchers: "سندات",
  transfers: "تحويلات",
};

export default function Tasks() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/financial-transactions"],
    queryFn: () => fetch(api("/api/financial-transactions")).then(r => r.json()),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    let res = [...transactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (group !== "all" && TYPE_GROUPS[group].length > 0) {
      res = res.filter(t => TYPE_GROUPS[group].includes(t.type));
    }
    if (dateFilter) {
      res = res.filter(t => (t.date || t.created_at?.split("T")[0]) === dateFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(t =>
        t.description?.toLowerCase().includes(q) ||
        t.customer_name?.toLowerCase().includes(q) ||
        t.supplier_name?.toLowerCase().includes(q) ||
        t.safe_name?.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    }
    return res;
  }, [transactions, group, dateFilter, search]);

  const totalIn = filtered.filter(t => t.direction === "in").reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter(t => t.direction === "out").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-amber-400" /> سجل المهام والعمليات
          </h1>
          <p className="text-white/40 text-sm mt-1">جميع الحركات المالية والعمليات بالنظام</p>
        </div>
        <div className="text-xs text-white/30">{filtered.length} عملية</div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5">
          <p className="text-white/50 text-xs mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> إجمالي الوارد</p>
          <p className="text-emerald-400 font-black text-lg">{formatCurrency(totalIn)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-red-500/20 bg-red-500/5">
          <p className="text-white/50 text-xs mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> إجمالي الصادر</p>
          <p className="text-red-400 font-black text-lg">{formatCurrency(totalOut)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5">
          <p className="text-white/50 text-xs mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> الصافي</p>
          <p className={`font-black text-lg ${totalIn - totalOut >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(totalIn - totalOut)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-3 flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-white/30 shrink-0" />
          <input
            type="text"
            placeholder="بحث في العمليات..."
            className="bg-transparent text-white outline-none text-sm w-full placeholder:text-white/20"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-white/30" />
          <input
            type="date"
            className="bg-transparent text-white/70 outline-none text-sm"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
          />
          {dateFilter && <button onClick={() => setDateFilter("")} className="text-white/30 hover:text-white text-xs">✕</button>}
        </div>

        {/* Group tabs */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          <Filter className="w-3.5 h-3.5 text-white/30 mx-1" />
          {Object.entries(GROUP_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setGroup(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                group === key ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions list */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/50 font-medium">النوع</th>
                <th className="p-4 text-white/50 font-medium">الوصف</th>
                <th className="p-4 text-white/50 font-medium">الطرف</th>
                <th className="p-4 text-white/50 font-medium">الخزينة</th>
                <th className="p-4 text-white/50 font-medium">المبلغ</th>
                <th className="p-4 text-white/50 font-medium">الاتجاه</th>
                <th className="p-4 text-white/50 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-16 text-center text-white/30">
                  <Activity className="w-8 h-8 mx-auto mb-3 opacity-30 animate-pulse" />
                  جاري التحميل...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-16 text-center text-white/30">
                  <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  لا توجد عمليات مطابقة
                </td></tr>
              ) : filtered.map(tx => {
                const meta = TYPE_META[tx.type] || DEFAULT_META;
                const Icon = meta.icon;
                const party = tx.customer_name || tx.supplier_name || null;
                return (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${meta.bg} ${meta.color}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="p-4 text-white/80 max-w-48 truncate">{tx.description || "—"}</td>
                    <td className="p-4 text-white/60">{party || "—"}</td>
                    <td className="p-4 text-white/60 text-xs">{tx.safe_name || "—"}</td>
                    <td className="p-4">
                      <span className={`font-black text-base ${tx.direction === 'in' ? 'text-emerald-400' : tx.direction === 'out' ? 'text-red-400' : 'text-white/50'}`}>
                        {tx.direction === 'in' ? '+' : tx.direction === 'out' ? '-' : ''}{formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="p-4">
                      {tx.direction === 'in' ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <TrendingUp className="w-3 h-3" /> وارد
                        </span>
                      ) : tx.direction === 'out' ? (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <TrendingDown className="w-3 h-3" /> صادر
                        </span>
                      ) : <span className="text-white/30 text-xs">—</span>}
                    </td>
                    <td className="p-4 text-white/40 text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
