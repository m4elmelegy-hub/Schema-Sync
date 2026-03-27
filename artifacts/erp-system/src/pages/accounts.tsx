import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import { Plus, ChevronDown, ChevronLeft, Edit2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface Account {
  id: number; code: string; name: string; type: string;
  parent_id: number | null; level: number; is_posting: boolean;
  is_active: boolean; opening_balance: number; current_balance: number;
}

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية",
  revenue: "إيرادات", expense: "مصروفات",
};
const TYPE_COLORS: Record<string, string> = {
  asset: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  liability: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  equity: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  revenue: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  expense: "text-red-400 bg-red-500/10 border-red-500/20",
};

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "الأصول", type: "asset", level: 1, is_posting: false },
  { code: "1100", name: "الأصول المتداولة", type: "asset", level: 2, is_posting: false },
  { code: "1110", name: "النقد في الصندوق", type: "asset", level: 3, is_posting: true },
  { code: "1120", name: "النقد في البنك", type: "asset", level: 3, is_posting: true },
  { code: "1130", name: "ذمم مدينة (عملاء)", type: "asset", level: 3, is_posting: true },
  { code: "1140", name: "المخزون", type: "asset", level: 3, is_posting: true },
  { code: "2000", name: "الخصوم", type: "liability", level: 1, is_posting: false },
  { code: "2100", name: "الالتزامات المتداولة", type: "liability", level: 2, is_posting: false },
  { code: "2110", name: "ذمم دائنة (موردون)", type: "liability", level: 3, is_posting: true },
  { code: "3000", name: "حقوق الملكية", type: "equity", level: 1, is_posting: false },
  { code: "3100", name: "رأس المال", type: "equity", level: 2, is_posting: true },
  { code: "4000", name: "الإيرادات", type: "revenue", level: 1, is_posting: false },
  { code: "4100", name: "إيرادات المبيعات", type: "revenue", level: 2, is_posting: true },
  { code: "4200", name: "إيرادات أخرى", type: "revenue", level: 2, is_posting: true },
  { code: "5000", name: "المصروفات", type: "expense", level: 1, is_posting: false },
  { code: "5100", name: "تكلفة البضاعة المباعة", type: "expense", level: 2, is_posting: true },
  { code: "5200", name: "مصروفات تشغيلية", type: "expense", level: 2, is_posting: false },
  { code: "5210", name: "الرواتب", type: "expense", level: 3, is_posting: true },
  { code: "5220", name: "الإيجار", type: "expense", level: 3, is_posting: true },
  { code: "5230", name: "الكهرباء والمياه", type: "expense", level: 3, is_posting: true },
  { code: "5240", name: "النقل والمواصلات", type: "expense", level: 3, is_posting: true },
];

function AccountRow({ account, accounts, depth = 0 }: { account: Account; accounts: Account[]; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const children = accounts.filter(a => a.parent_id === account.id);
  const hasChildren = children.length > 0;

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
        <td className="p-3">
          <div className="flex items-center gap-2" style={{ paddingRight: `${depth * 20}px` }}>
            {hasChildren ? (
              <button onClick={() => setOpen(!open)} className="p-0.5 rounded text-white/40 hover:text-white/80 transition-colors">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            ) : <span className="w-5" />}
            <span className={`font-mono text-xs ${depth === 0 ? "text-amber-400 font-bold" : "text-white/50"}`}>{account.code}</span>
          </div>
        </td>
        <td className="p-3">
          <span className={`font-${depth === 0 ? "black" : depth === 1 ? "bold" : "medium"} text-white`}>{account.name}</span>
        </td>
        <td className="p-3">
          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${TYPE_COLORS[account.type] || ""}`}>
            {TYPE_LABELS[account.type] || account.type}
          </span>
        </td>
        <td className="p-3 text-right">
          <span className={`font-bold ${account.current_balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatCurrency(Math.abs(account.current_balance))}
          </span>
        </td>
        <td className="p-3">
          {account.is_posting ? (
            <span className="px-2 py-0.5 rounded text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">ترحيل</span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs text-white/30 bg-white/5 border border-white/10">إجمالي</span>
          )}
        </td>
      </tr>
      {open && children.map(child => (
        <AccountRow key={child.id} account={child} accounts={accounts} depth={depth + 1} />
      ))}
    </>
  );
}

export default function Accounts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const [form, setForm] = useState({ code: "", name: "", type: "asset", parent_id: "", level: "2", is_posting: true, opening_balance: "" });

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    queryFn: () => fetch(api("/api/accounts")).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => fetch(api("/api/accounts"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accounts"] }); setShowForm(false); setForm({ code: "", name: "", type: "asset", parent_id: "", level: "2", is_posting: true, opening_balance: "" }); toast({ title: "✅ تم إضافة الحساب" }); },
    onError: () => toast({ title: "حدث خطأ", variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      for (const acc of DEFAULT_ACCOUNTS) {
        await fetch(api("/api/accounts"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...acc, opening_balance: 0 }) });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accounts"] }); toast({ title: "✅ تم تحميل الحسابات الافتراضية" }); },
  });

  const roots = accounts.filter(a => a.parent_id === null);
  const filteredRoots = filter ? accounts.filter(a => TYPE_LABELS[a.type] === filter || a.type === filter) : roots;

  // حساب المجاميع
  const totals = useMemo(() => {
    const sum = (type: string) => accounts.filter(a => a.type === type && a.is_posting).reduce((s, a) => s + a.current_balance, 0);
    return { asset: sum("asset"), liability: sum("liability"), equity: sum("equity"), revenue: sum("revenue"), expense: sum("expense") };
  }, [accounts]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10 flex-wrap gap-1">
          {["", "asset", "liability", "equity", "revenue", "expense"].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filter === t ? "bg-amber-500 text-black" : "text-white/50 hover:text-white"}`}>
              {t ? TYPE_LABELS[t] : "الكل"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mr-auto">
          {accounts.length === 0 && (
            <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="btn-secondary px-4 py-2 text-sm">
              {seedMutation.isPending ? "جاري التحميل..." : "تحميل حسابات افتراضية"}
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> حساب جديد
          </button>
        </div>
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(totals).map(([type, val]) => (
          <div key={type} className={`glass-panel rounded-2xl p-3 border ${TYPE_COLORS[type].split(" ").slice(1).join(" ")}`}>
            <p className={`text-xs font-bold mb-1 ${TYPE_COLORS[type].split(" ")[0]}`}>{TYPE_LABELS[type]}</p>
            <p className="text-white font-black text-sm">{formatCurrency(val)}</p>
          </div>
        ))}
      </div>

      {/* نموذج الإضافة */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">حساب جديد</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X className="w-4 h-4 text-white/70" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/60 text-xs mb-1 block">كود الحساب *</label><input required type="text" className="glass-input font-mono" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="مثال: 1110" /></div>
                <div><label className="text-white/60 text-xs mb-1 block">نوع الحساب *</label>
                  <select className="glass-input appearance-none" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v} className="bg-gray-900">{l}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="text-white/60 text-xs mb-1 block">اسم الحساب *</label><input required type="text" className="glass-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="text-white/60 text-xs mb-1 block">الحساب الأب</label>
                <select className="glass-input appearance-none" value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}>
                  <option value="" className="bg-gray-900">بدون (حساب رئيسي)</option>
                  {accounts.filter(a => !a.is_posting).map(a => <option key={a.id} value={a.id} className="bg-gray-900">[{a.code}] {a.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-white/60 text-xs mb-1 block">رصيد افتتاحي</label><input type="number" step="0.01" className="glass-input" value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} /></div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_posting} onChange={e => setForm(f => ({ ...f, is_posting: e.target.checked }))} className="w-4 h-4 accent-amber-500" />
                    <span className="text-white/70 text-sm">حساب ترحيل</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => createMutation.mutate({ ...form, parent_id: form.parent_id ? parseInt(form.parent_id) : null, level: parseInt(form.level), opening_balance: parseFloat(form.opening_balance) || 0 })} disabled={!form.code || !form.name || createMutation.isPending} className="flex-1 btn-primary py-3">حفظ</button>
              <button onClick={() => setShowForm(false)} className="flex-1 btn-secondary py-3">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* الجدول */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-3 text-white/60 font-semibold">الكود</th>
                <th className="p-3 text-white/60 font-semibold">اسم الحساب</th>
                <th className="p-3 text-white/60 font-semibold">النوع</th>
                <th className="p-3 text-white/60 font-semibold text-right">الرصيد</th>
                <th className="p-3 text-white/60 font-semibold">طبيعة</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-12 text-center text-white/40">جاري التحميل...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center">
                  <div className="text-white/30 space-y-3">
                    <p className="text-lg">لا توجد حسابات</p>
                    <button onClick={() => seedMutation.mutate()} className="btn-primary px-6 py-2 text-sm mx-auto">تحميل الحسابات الافتراضية</button>
                  </div>
                </td></tr>
              ) : (filter ? accounts.filter(a => a.type === filter) : roots).map(acc => (
                <AccountRow key={acc.id} account={acc} accounts={accounts} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
