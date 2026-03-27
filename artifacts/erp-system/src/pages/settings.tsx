import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useGetSettingsUsers, useCreateSettingsUser, useUpdateSettingsUser, useDeleteSettingsUser,
  useGetSettingsSafes, useCreateSettingsSafe, useDeleteSettingsSafe,
  useGetSettingsSafeTransfers, useCreateSettingsSafeTransfer,
  useGetSettingsWarehouses, useCreateSettingsWarehouse, useDeleteSettingsWarehouse,
  useResetDatabase,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Users, Landmark, Warehouse, AlertTriangle, Plus, Trash2, Edit2, X, Check,
  ArrowLeftRight, ShieldCheck, RefreshCcw, Eye, EyeOff, Save
} from "lucide-react";

type Tab = "users" | "safes" | "warehouses" | "reset";

const ROLES: Record<string, { label: string; color: string }> = {
  admin:   { label: "مدير النظام", color: "text-red-400 bg-red-500/10 border-red-500/30" },
  manager: { label: "مدير",        color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  cashier: { label: "كاشير",       color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
};

const PERMISSIONS_LIST = [
  { key: "sales",     label: "المبيعات" },
  { key: "purchases", label: "المشتريات" },
  { key: "customers", label: "العملاء" },
  { key: "expenses",  label: "المصروفات" },
  { key: "income",    label: "الإيرادات" },
  { key: "reports",   label: "التقارير" },
  { key: "settings",  label: "الإعدادات" },
];

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const { data: users = [], isLoading } = useGetSettingsUsers();
  const createUser = useCreateSettingsUser();
  const updateUser = useUpdateSettingsUser();
  const deleteUser = useDeleteSettingsUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", pin: "0000", role: "cashier", permissions: {} as Record<string, boolean> });

  const resetForm = () => { setForm({ name: "", username: "", pin: "0000", role: "cashier", permissions: {} }); setEditId(null); setShowForm(false); };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.username.trim()) { toast({ title: "الاسم واسم المستخدم مطلوبان", variant: "destructive" }); return; }
    const perms = JSON.stringify(form.permissions);

    if (editId) {
      updateUser.mutate({ id: editId, body: { name: form.name, username: form.username, pin: form.pin, role: form.role, permissions: perms } }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم تعديل المستخدم" }); resetForm(); },
        onError: () => toast({ title: "فشل التعديل", variant: "destructive" }),
      });
    } else {
      createUser.mutate({ name: form.name, username: form.username, pin: form.pin, role: form.role, permissions: perms }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم إضافة المستخدم" }); resetForm(); },
        onError: () => toast({ title: "فشل الإضافة", variant: "destructive" }),
      });
    }
  };

  const handleEdit = (u: any) => {
    let perms: Record<string, boolean> = {};
    try { perms = JSON.parse(u.permissions || "{}"); } catch {}
    setForm({ name: u.name, username: u.username, pin: u.pin || "0000", role: u.role, permissions: perms });
    setEditId(u.id); setShowForm(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("هل تريد حذف هذا المستخدم؟")) return;
    deleteUser.mutate(id, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم حذف المستخدم" }); },
    });
  };

  const togglePerm = (key: string) => setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">إدارة المستخدمين والصلاحيات</h3>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> إضافة مستخدم
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-5">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-amber-400">{editId ? "تعديل مستخدم" : "مستخدم جديد"}</h4>
            <button onClick={resetForm}><X className="w-5 h-5 text-white/50" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">الاسم الكامل</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" placeholder="أحمد محمد" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">اسم المستخدم</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" placeholder="ahmed123" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">PIN (رقم سري)</label>
              <div className="relative">
                <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm pr-10" type={showPin ? "text" : "password"} placeholder="0000" maxLength={6} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} />
                <button className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" onClick={() => setShowPin(s => !s)}>{showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">الدور</label>
              <select className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="admin">مدير النظام</option>
                <option value="manager">مدير</option>
                <option value="cashier">كاشير</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-white/60 text-xs mb-2 block">الصلاحيات</label>
            <div className="grid grid-cols-3 gap-2">
              {PERMISSIONS_LIST.map(p => (
                <button key={p.key} onClick={() => togglePerm(p.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all ${form.permissions[p.key] ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-white/50'}`}>
                  {form.permissions[p.key] ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-white/30 text-xs mt-2">مدير النظام يملك كل الصلاحيات تلقائياً</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSubmit} className="btn-primary flex items-center gap-2 px-5 py-2 rounded-xl text-sm">
              <Save className="w-4 h-4" /> {editId ? "حفظ التعديلات" : "إضافة"}
            </button>
            <button onClick={resetForm} className="btn-secondary px-5 py-2 rounded-xl text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        {isLoading ? (
          <div className="p-12 text-center text-white/40">جاري التحميل...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-white/40">لا يوجد مستخدمون. أضف مستخدماً جديداً.</div>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 text-white/60">الاسم</th>
                <th className="p-4 text-white/60">اسم المستخدم</th>
                <th className="p-4 text-white/60">الدور</th>
                <th className="p-4 text-white/60">الصلاحيات</th>
                <th className="p-4 text-white/60">الحالة</th>
                <th className="p-4 text-white/60">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                let perms: Record<string, boolean> = {};
                try { perms = JSON.parse(u.permissions || "{}"); } catch {}
                const activePerms = PERMISSIONS_LIST.filter(p => perms[p.key]);
                return (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="p-4 font-bold text-white">{u.name}</td>
                    <td className="p-4 text-white/60 font-mono">@{u.username}</td>
                    <td className="p-4"><span className={`px-2 py-1 rounded-lg text-xs font-bold border ${ROLES[u.role]?.color}`}>{ROLES[u.role]?.label || u.role}</span></td>
                    <td className="p-4">
                      {u.role === "admin" ? (
                        <span className="text-red-400 text-xs">كل الصلاحيات</span>
                      ) : activePerms.length === 0 ? (
                        <span className="text-white/30 text-xs">لا توجد صلاحيات</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {activePerms.slice(0, 3).map(p => <span key={p.key} className="text-xs bg-white/10 px-2 py-0.5 rounded-lg text-white/60">{p.label}</span>)}
                          {activePerms.length > 3 && <span className="text-xs text-white/40">+{activePerms.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold border ${u.active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                        {u.active ? "نشط" : "موقوف"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(u)} className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(u.id)} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Safes Tab ────────────────────────────────────────────────────────────────
function SafesTab() {
  const { data: safes = [], isLoading } = useGetSettingsSafes();
  const { data: transfers = [] } = useGetSettingsSafeTransfers();
  const createSafe = useCreateSettingsSafe();
  const deleteSafe = useDeleteSettingsSafe();
  const createTransfer = useCreateSettingsSafeTransfer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showAddSafe, setShowAddSafe] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [safeForm, setSafeForm] = useState({ name: "", balance: "" });
  const [transferForm, setTransferForm] = useState({ from_safe_id: "", to_safe_id: "", amount: "", notes: "" });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/settings/safe-transfers"] });
  };

  const handleAddSafe = () => {
    if (!safeForm.name.trim()) { toast({ title: "اسم الخزنة مطلوب", variant: "destructive" }); return; }
    createSafe.mutate({ name: safeForm.name, balance: Number(safeForm.balance) || 0 }, {
      onSuccess: () => { invalidate(); toast({ title: "تم إضافة الخزنة" }); setSafeForm({ name: "", balance: "" }); setShowAddSafe(false); },
      onError: () => toast({ title: "فشل الإضافة", variant: "destructive" }),
    });
  };

  const handleDeleteSafe = (id: number) => {
    if (!confirm("هل تريد حذف هذه الخزنة؟")) return;
    deleteSafe.mutate(id, {
      onSuccess: () => { invalidate(); toast({ title: "تم حذف الخزنة" }); },
    });
  };

  const handleTransfer = () => {
    if (!transferForm.from_safe_id || !transferForm.to_safe_id || !transferForm.amount) {
      toast({ title: "جميع الحقول مطلوبة", variant: "destructive" }); return;
    }
    if (transferForm.from_safe_id === transferForm.to_safe_id) {
      toast({ title: "لا يمكن التحويل لنفس الخزنة", variant: "destructive" }); return;
    }
    createTransfer.mutate({
      from_safe_id: Number(transferForm.from_safe_id),
      to_safe_id: Number(transferForm.to_safe_id),
      amount: Number(transferForm.amount),
      notes: transferForm.notes || undefined,
    }, {
      onSuccess: () => { invalidate(); toast({ title: "تم التحويل بنجاح" }); setTransferForm({ from_safe_id: "", to_safe_id: "", amount: "", notes: "" }); setShowTransfer(false); },
      onError: (e: any) => toast({ title: e?.message || "فشل التحويل", variant: "destructive" }),
    });
  };

  const totalBalance = safes.reduce((s, x) => s + Number(x.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">إدارة الخزائن</h3>
          <p className="text-white/40 text-sm mt-0.5">إجمالي الأرصدة: <span className="text-amber-400 font-bold">{formatCurrency(totalBalance)}</span></p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowTransfer(true)} className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
            <ArrowLeftRight className="w-4 h-4" /> تحويل بين الخزائن
          </button>
          <button onClick={() => setShowAddSafe(true)} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
            <Plus className="w-4 h-4" /> إضافة خزنة
          </button>
        </div>
      </div>

      {/* Add Safe Form */}
      {showAddSafe && (
        <div className="glass-panel rounded-3xl p-5 border border-amber-500/20">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-amber-400">خزنة جديدة</h4>
            <button onClick={() => setShowAddSafe(false)}><X className="w-5 h-5 text-white/50" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">اسم الخزنة</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" placeholder="الخزنة الرئيسية" value={safeForm.name} onChange={e => setSafeForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">الرصيد الابتدائي (ج.م)</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" type="number" placeholder="0" value={safeForm.balance} onChange={e => setSafeForm(f => ({ ...f, balance: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAddSafe} className="btn-primary px-5 py-2 rounded-xl text-sm">إضافة</button>
            <button onClick={() => setShowAddSafe(false)} className="btn-secondary px-5 py-2 rounded-xl text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="glass-panel rounded-3xl p-5 border border-blue-500/20">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-blue-400">تحويل بين الخزائن</h4>
            <button onClick={() => setShowTransfer(false)}><X className="w-5 h-5 text-white/50" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">من خزنة</label>
              <select className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" value={transferForm.from_safe_id} onChange={e => setTransferForm(f => ({ ...f, from_safe_id: e.target.value }))}>
                <option value="">اختر...</option>
                {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">إلى خزنة</label>
              <select className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" value={transferForm.to_safe_id} onChange={e => setTransferForm(f => ({ ...f, to_safe_id: e.target.value }))}>
                <option value="">اختر...</option>
                {safes.map(s => <option key={s.id} value={s.id}>{s.name} ({formatCurrency(Number(s.balance))})</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">المبلغ (ج.م)</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" type="number" placeholder="0" value={transferForm.amount} onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">ملاحظات</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" placeholder="اختياري" value={transferForm.notes} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleTransfer} className="btn-primary flex items-center gap-2 px-5 py-2 rounded-xl text-sm">
              <ArrowLeftRight className="w-4 h-4" /> تحويل
            </button>
            <button onClick={() => setShowTransfer(false)} className="btn-secondary px-5 py-2 rounded-xl text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {/* Safes Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-white/40">جاري التحميل...</div>
      ) : safes.length === 0 ? (
        <div className="text-center py-12 text-white/40">لا توجد خزائن. أضف خزنة جديدة.</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {safes.map(s => (
            <div key={s.id} className="glass-panel rounded-2xl p-5 border border-white/5 relative group">
              <button onClick={() => handleDeleteSafe(s.id)} className="absolute top-3 left-3 p-1.5 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
              <Landmark className="w-8 h-8 text-amber-400 mb-3" />
              <p className="text-white font-bold">{s.name}</p>
              <p className="text-2xl font-black text-amber-400 mt-2">{formatCurrency(Number(s.balance))}</p>
              <p className="text-white/30 text-xs mt-1">الرصيد الحالي</p>
            </div>
          ))}
        </div>
      )}

      {/* Transfer History */}
      {transfers.length > 0 && (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
          <div className="p-4 border-b border-white/10">
            <h4 className="font-bold text-white">سجل التحويلات</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-3 text-white/60">من</th>
                  <th className="p-3 text-white/60">إلى</th>
                  <th className="p-3 text-white/60">المبلغ</th>
                  <th className="p-3 text-white/60">ملاحظات</th>
                  <th className="p-3 text-white/60">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {transfers.slice(0, 20).map(t => (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="p-3 text-red-400 font-semibold">{t.from_safe_name}</td>
                    <td className="p-3 text-emerald-400 font-semibold">{t.to_safe_name}</td>
                    <td className="p-3 text-amber-400 font-bold">{formatCurrency(Number(t.amount))}</td>
                    <td className="p-3 text-white/50">{t.notes || '-'}</td>
                    <td className="p-3 text-white/50">{formatDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Warehouses Tab ───────────────────────────────────────────────────────────
function WarehousesTab() {
  const { data: warehouses = [], isLoading } = useGetSettingsWarehouses();
  const createWarehouse = useCreateSettingsWarehouse();
  const deleteWarehouse = useDeleteSettingsWarehouse();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });

  const handleAdd = () => {
    if (!form.name.trim()) { toast({ title: "اسم المخزن مطلوب", variant: "destructive" }); return; }
    createWarehouse.mutate({ name: form.name, address: form.address || undefined }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/warehouses"] }); toast({ title: "تم إضافة المخزن" }); setForm({ name: "", address: "" }); setShowForm(false); },
      onError: () => toast({ title: "فشل الإضافة", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("هل تريد حذف هذا المخزن؟")) return;
    deleteWarehouse.mutate(id, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/warehouses"] }); toast({ title: "تم حذف المخزن" }); },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">إدارة المخازن</h3>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> إضافة مخزن
        </button>
      </div>

      {showForm && (
        <div className="glass-panel rounded-3xl p-5 border border-amber-500/20">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-amber-400">مخزن جديد</h4>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-white/50" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-white/60 text-xs mb-1 block">اسم المخزن</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" placeholder="المخزن الرئيسي" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">العنوان (اختياري)</label>
              <input className="glass-input w-full rounded-xl px-3 py-2 text-white text-sm" placeholder="القاهرة، مصر" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAdd} className="btn-primary px-5 py-2 rounded-xl text-sm">إضافة</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2 rounded-xl text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-white/40">جاري التحميل...</div>
      ) : warehouses.length === 0 ? (
        <div className="text-center py-12 text-white/40">لا توجد مخازن. أضف مخزناً جديداً.</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map(w => (
            <div key={w.id} className="glass-panel rounded-2xl p-5 border border-white/5 relative group">
              <button onClick={() => handleDelete(w.id)} className="absolute top-3 left-3 p-1.5 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
              <Warehouse className="w-8 h-8 text-blue-400 mb-3" />
              <p className="text-white font-bold text-lg">{w.name}</p>
              {w.address && <p className="text-white/40 text-sm mt-1">{w.address}</p>}
              <p className="text-white/30 text-xs mt-3">{formatDate(w.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reset Tab ────────────────────────────────────────────────────────────────
function ResetTab() {
  const resetDb = useResetDatabase();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [done, setDone] = useState(false);

  const handleReset = () => {
    if (confirmText !== "تأكيد الحذف") {
      toast({ title: 'اكتب "تأكيد الحذف" بالضبط لتفعيل الزر', variant: "destructive" }); return;
    }
    resetDb.mutate({ confirm: "تأكيد الحذف" }, {
      onSuccess: () => {
        queryClient.clear();
        setDone(true);
        setConfirmText("");
        toast({ title: "✅ تم تصفير قاعدة البيانات بنجاح" });
      },
      onError: () => toast({ title: "فشل التصفير", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white">إعادة تهيئة قاعدة البيانات</h3>
        <p className="text-white/40 text-sm mt-1">هذه العملية ستحذف جميع البيانات التشغيلية مع الاحتفاظ بالمنتجات والعملاء والموردين</p>
      </div>

      {done && (
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/30 bg-emerald-500/5">
          <p className="text-emerald-400 font-bold">✅ تم تصفير قاعدة البيانات بنجاح. جميع الفواتير والحركات المالية تم حذفها.</p>
        </div>
      )}

      <div className="glass-panel rounded-3xl p-6 border border-red-500/20 bg-red-500/5 space-y-5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-red-500/20 shrink-0">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h4 className="text-red-400 font-bold text-lg mb-2">تحذير: عملية لا يمكن التراجع عنها</h4>
            <ul className="space-y-1.5 text-white/60 text-sm">
              <li>• سيتم حذف جميع فواتير المبيعات والمشتريات</li>
              <li>• سيتم حذف جميع المصروفات والإيرادات</li>
              <li>• سيتم حذف جميع الحركات المالية</li>
              <li>• سيتم تصفير رصيد جميع العملاء والموردين</li>
              <li>• سيتم تصفير كميات المنتجات في المخزن</li>
              <li className="text-emerald-400">• سيتم الاحتفاظ ببيانات المنتجات والعملاء والموردين</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-5">
          <label className="text-white/70 text-sm font-semibold mb-2 block">
            اكتب <span className="text-red-400 font-black">"تأكيد الحذف"</span> للمتابعة:
          </label>
          <input
            className="glass-input w-full rounded-xl px-4 py-3 text-white text-base mb-4"
            placeholder="تأكيد الحذف"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
          />
          <button
            onClick={handleReset}
            disabled={confirmText !== "تأكيد الحذف" || resetDb.isPending}
            className={`w-full py-3 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-3 ${
              confirmText === "تأكيد الحذف"
                ? "bg-red-500/80 hover:bg-red-500 text-white border border-red-400/50"
                : "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
            }`}
          >
            <RefreshCcw className={`w-5 h-5 ${resetDb.isPending ? "animate-spin" : ""}`} />
            {resetDb.isPending ? "جاري التصفير..." : "تصفير قاعدة البيانات"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
const TABS = [
  { id: "users"     as Tab, label: "المستخدمون والصلاحيات", icon: Users },
  { id: "safes"     as Tab, label: "الخزائن",               icon: Landmark },
  { id: "warehouses"as Tab, label: "المخازن",               icon: Warehouse },
  { id: "reset"     as Tab, label: "إعادة التهيئة",         icon: AlertTriangle },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("users");

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="glass-panel rounded-3xl p-2 flex gap-1 border border-white/5 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? tab.id === "reset"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "users"      && <UsersTab />}
        {activeTab === "safes"      && <SafesTab />}
        {activeTab === "warehouses" && <WarehousesTab />}
        {activeTab === "reset"      && <ResetTab />}
      </div>
    </div>
  );
}
