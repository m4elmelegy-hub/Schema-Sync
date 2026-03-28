import { useGetDashboardStats } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Wallet, 
  Receipt,
  PackageX
} from "lucide-react";
import { motion } from "framer-motion";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboardStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isError || !stats) {
    return <div className="text-destructive p-8 glass-panel rounded-3xl text-center">حدث خطأ في تحميل البيانات</div>;
  }

  const chartData = [
    { name: "اليوم", sales: stats.total_sales_today, expenses: stats.total_expenses_today }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="مبيعات اليوم" 
          value={stats.total_sales_today} 
          icon={TrendingUp} 
          color="text-primary" 
          bg="bg-primary/10" 
        />
        <StatCard 
          title="مصروفات اليوم" 
          value={stats.total_expenses_today} 
          icon={TrendingDown} 
          color="text-destructive" 
          bg="bg-destructive/10" 
        />
        <StatCard 
          title="إيرادات أخرى" 
          value={stats.total_income_today} 
          icon={Wallet} 
          color="text-blue-400" 
          bg="bg-blue-400/10" 
        />
        <StatCard 
          title="صافي الربح (اليوم)" 
          value={stats.net_profit} 
          icon={Receipt} 
          color="text-emerald-400" 
          bg="bg-emerald-400/10" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Debts & Quick Chart */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
              <h3 className="text-white/60 font-medium mb-2">ديون العملاء (لنا)</h3>
              <p className="text-3xl font-bold text-yellow-500">{formatCurrency(stats.total_customer_debts)}</p>
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-6 h-[400px]">
            <h3 className="text-lg font-bold text-white mb-6">نظرة عامة (اليوم)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="name" stroke="#ffffff50" />
                <YAxis stroke="#ffffff50" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="sales" name="مبيعات" stroke="#10b981" strokeWidth={3} />
                <Line type="monotone" dataKey="expenses" name="مصروفات" stroke="#ef4444" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock & Recent Transactions */}
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" /> تنبيهات المخزون
              </h3>
            </div>
            <div className="space-y-3">
              {stats.low_stock_products?.length === 0 ? (
                <div className="text-center py-6 text-white/40 flex flex-col items-center gap-2">
                  <PackageX className="w-8 h-8 opacity-50" />
                  <p>لا توجد منتجات ناقصة</p>
                </div>
              ) : (
                stats.low_stock_products?.slice(0, 5).map(prod => (
                  <div key={prod.id} className="bg-white/5 rounded-xl p-3 flex justify-between items-center border border-white/5">
                    <div>
                      <p className="font-medium text-white">{prod.name}</p>
                      <p className="text-xs text-white/50">{prod.sku || 'بدون رمز'}</p>
                    </div>
                    <div className="text-center">
                      <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-bold border border-red-500/30">
                        {prod.quantity}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">أحدث العمليات</h3>
            <div className="space-y-3">
              {stats.recent_transactions?.length === 0 ? (
                <div className="text-center py-6 text-white/40">لا توجد عمليات حديثة</div>
              ) : (
                stats.recent_transactions?.slice(0, 5).map(tx => (
                  <div key={tx.id} className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        tx.type === 'sale' || tx.type === 'receipt' || tx.type === 'income' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {
                          tx.type === 'sale' ? 'مبيعات' : 
                          tx.type === 'purchase' ? 'مشتريات' : 
                          tx.type === 'expense' ? 'مصروف' : 
                          tx.type === 'income' ? 'إيراد' : 
                          tx.type === 'receipt' ? 'سند قبض' : 'سند توريد'
                        }
                      </span>
                      <span className="font-bold text-white">{formatCurrency(tx.amount)}</span>
                    </div>
                    <p className="text-xs text-white/50 mt-2">{formatDate(tx.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: { title: string, value: number, icon: any, color: string, bg: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="glass-panel rounded-3xl p-6 relative overflow-hidden group cursor-default"
    >
      <div className={`absolute top-0 right-0 w-32 h-32 ${bg} rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150`}></div>
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="text-white/60 font-medium text-sm lg:text-base mb-2">{title}</p>
          <h4 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">{formatCurrency(value)}</h4>
        </div>
        <div className={`p-3 rounded-2xl ${bg} ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </motion.div>
  );
}
