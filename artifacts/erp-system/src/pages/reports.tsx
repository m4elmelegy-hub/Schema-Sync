import { useGetDashboardStats, useGetTransactions } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export default function Reports() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: transactions = [], isLoading: txLoading } = useGetTransactions();

  if (statsLoading || txLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const pieData = [
    { name: "مبيعات", value: stats?.total_sales_today || 0, color: "#10b981" },
    { name: "إيرادات أخرى", value: stats?.total_income_today || 0, color: "#3b82f6" },
    { name: "مصروفات", value: stats?.total_expenses_today || 0, color: "#ef4444" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">تقرير الإيرادات والمصروفات المجمع</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-3xl p-6 flex flex-col justify-center items-center min-h-[300px]">
          <h3 className="text-lg font-bold text-white mb-4 w-full">توزيع التدفقات النقدية (اليوم)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: '#fff' }}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel rounded-3xl p-6 space-y-4">
          <h3 className="text-lg font-bold text-white mb-4">ملخص الأرقام</h3>
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center">
              <span className="text-white/70">إجمالي المبيعات</span>
              <span className="text-xl font-bold text-emerald-400">{formatCurrency(stats?.total_sales_today)}</span>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center">
              <span className="text-white/70">إجمالي الإيرادات الإضافية</span>
              <span className="text-xl font-bold text-blue-400">{formatCurrency(stats?.total_income_today)}</span>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center">
              <span className="text-white/70">إجمالي المصروفات</span>
              <span className="text-xl font-bold text-red-400">{formatCurrency(stats?.total_expenses_today)}</span>
            </div>
            <div className="bg-primary/20 border border-primary/30 p-4 rounded-xl flex justify-between items-center">
              <span className="text-white font-bold">صافي التدفق</span>
              <span className="text-2xl font-black text-white">{formatCurrency(stats?.net_profit)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden mt-8">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-bold text-white">سجل الحركات المالية المجمعة</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-white/80 whitespace-nowrap">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium">النوع</th>
                <th className="p-4 font-medium">المبلغ</th>
                <th className="p-4 font-medium">التفاصيل / المرجع</th>
                <th className="p-4 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-white/50">لا توجد حركات مسجلة</td></tr>
              ) : (
                transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        tx.type === 'sale' || tx.type === 'receipt' || tx.type === 'income' 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                          : 'bg-red-500/20 text-red-400 border-red-500/30'
                      }`}>
                        {
                          tx.type === 'sale' ? 'مبيعات' : 
                          tx.type === 'purchase' ? 'مشتريات' : 
                          tx.type === 'expense' ? 'مصروف' : 
                          tx.type === 'income' ? 'إيراد' : 
                          tx.type === 'receipt' ? 'سند قبض' : 'سند صرف'
                        }
                      </span>
                    </td>
                    <td className={`p-4 font-bold ${
                        tx.type === 'sale' || tx.type === 'receipt' || tx.type === 'income' 
                          ? 'text-emerald-400' 
                          : 'text-red-400'
                      }`}>
                      {tx.type === 'sale' || tx.type === 'receipt' || tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount)}
                    </td>
                    <td className="p-4 text-white">{tx.description || '-'} {tx.related_id ? `(#${tx.related_id})` : ''}</td>
                    <td className="p-4 text-sm text-white/60">{formatDate(tx.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
