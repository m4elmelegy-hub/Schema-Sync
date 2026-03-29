import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useGetSettingsUsers, useCreateSettingsUser, useUpdateSettingsUser, useDeleteSettingsUser,
  useGetSettingsSafes, useCreateSettingsSafe, useDeleteSettingsSafe,
  useGetSettingsSafeTransfers, useCreateSettingsSafeTransfer,
  useGetSettingsWarehouses, useCreateSettingsWarehouse, useDeleteSettingsWarehouse,
  useResetDatabase,
  useGetProducts, useGetCustomers, useGetSuppliers,
} from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { formatCurrency, formatDate, formatCurrencyPreview } from "@/lib/format";
import {
  useAppSettings, CURRENCIES, FONTS, ACCENT_COLORS, FONT_SIZES, LOGIN_BG_OPTIONS,
  type CurrencyCode, type FontFamily, type AccentColor, type FontSize, type NumberFormat,
} from "@/contexts/app-settings";
import {
  Users, Landmark, Warehouse, AlertTriangle, Plus, Trash2, Edit2, X, Check,
  ArrowLeftRight, Eye, EyeOff, Save, Palette, DollarSign, Database,
  Upload, Download, RefreshCcw, Building2, Image, Type, Loader2, CheckCircle2,
  HardDrive, History, BookOpen, Package, UserCircle, Truck, Banknote,
} from "lucide-react";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

type Tab = "users" | "safes" | "warehouses" | "appearance" | "currency" | "backup" | "data" | "opening-balance";

const TABS: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "users",           label: "المستخدمون",     icon: Users },
  { id: "safes",           label: "الخزائن",        icon: Landmark },
  { id: "warehouses",      label: "المخازن",        icon: Warehouse },
  { id: "opening-balance", label: "أول المدة",      icon: BookOpen },
  { id: "appearance",      label: "الواجهة",        icon: Palette },
  { id: "currency",        label: "العملة",         icon: DollarSign },
  { id: "backup",          label: "نسخ احتياطي",    icon: HardDrive },
  { id: "data",            label: "البيانات",       icon: Database },
];

const ROLES: Record<string, { label: string; color: string }> = {
  admin:   { label: "مدير النظام", color: "text-red-400 bg-red-500/10 border-red-500/30" },
  manager: { label: "مدير",        color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  cashier: { label: "كاشير",       color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  salesperson: { label: "مندوب",   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
};

const PERMISSIONS_LIST = [
  { key: "sales", label: "المبيعات" }, { key: "purchases", label: "المشتريات" },
  { key: "customers", label: "العملاء" }, { key: "expenses", label: "المصروفات" },
  { key: "income", label: "الإيرادات" }, { key: "reports", label: "التقارير" },
  { key: "settings", label: "الإعدادات" },
];

/* ─── Shared UI ─── */
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-lg font-black text-white">{title}</h3>
      {sub && <p className="text-white/40 text-sm mt-0.5">{sub}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-white/50 text-xs mb-1.5 font-medium">{children}</label>;
}

/* ─── Settings Page ─── */
export default function Settings() {
  const [tab, setTab] = useState<Tab>("users");
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap glass-panel rounded-2xl p-1.5 border border-white/5">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all flex-1 justify-center
                ${active ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-white/40 hover:text-white hover:bg-white/5"}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {tab === "users" && <UsersTab />}
        {tab === "safes" && <SafesTab />}
        {tab === "warehouses" && <WarehousesTab />}
        {tab === "opening-balance" && <OpeningBalanceTab />}
        {tab === "appearance" && <AppearanceTab />}
        {tab === "currency" && <CurrencyTab />}
        {tab === "backup" && <BackupImportTab />}
        {tab === "data" && <DataTab />}
      </div>
    </div>
  );
}

/* ─── Users Tab ─── */
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
    deleteUser.mutate(id, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم حذف المستخدم" }); } });
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <SectionHeader title="إدارة المستخدمين" sub="التحكم في حسابات المستخدمين وصلاحياتهم" />
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm shrink-0">
          <Plus className="w-4 h-4" /> إضافة مستخدم
        </button>
      </div>

      {showForm && (
        <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-amber-400">{editId ? "تعديل مستخدم" : "مستخدم جديد"}</h4>
            <button onClick={resetForm}><X className="w-5 h-5 text-white/50" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>الاسم الكامل</Label><input className="glass-input w-full text-white text-sm" placeholder="أحمد محمد" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>اسم المستخدم</Label><input className="glass-input w-full text-white text-sm" placeholder="ahmed" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
            <div>
              <Label>رقم سري (PIN)</Label>
              <div className="relative">
                <input className="glass-input w-full text-white text-sm pr-10" type={showPin ? "text" : "password"} placeholder="0000" maxLength={6} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} />
                <button className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" onClick={() => setShowPin(s => !s)}>
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>الدور</Label>
              <select className="glass-input w-full text-white text-sm" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="admin">مدير النظام</option>
                <option value="manager">مدير</option>
                <option value="cashier">كاشير</option>
                <option value="salesperson">مندوب مبيعات</option>
              </select>
            </div>
          </div>
          <div>
            <Label>الصلاحيات</Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {PERMISSIONS_LIST.map(p => (
                <button key={p.key} onClick={() => setForm(f => ({ ...f, permissions: { ...f.permissions, [p.key]: !f.permissions[p.key] } }))}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border transition-all ${form.permissions[p.key] ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-white/5 border-white/10 text-white/50"}`}>
                  {form.permissions[p.key] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSubmit} className="btn-primary flex items-center gap-2 px-5 py-2 rounded-xl text-sm"><Save className="w-4 h-4" /> {editId ? "حفظ التعديلات" : "إضافة"}</button>
            <button onClick={resetForm} className="btn-secondary px-5 py-2 rounded-xl text-sm">إلغاء</button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        {isLoading ? <div className="p-12 text-center text-white/40">جاري التحميل...</div>
          : users.length === 0 ? <div className="p-12 text-center text-white/40">لا يوجد مستخدمون</div>
          : (
            <table className="w-full text-right text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="p-3 text-white/50 text-xs">الاسم</th>
                  <th className="p-3 text-white/50 text-xs">اسم المستخدم</th>
                  <th className="p-3 text-white/50 text-xs">الدور</th>
                  <th className="p-3 text-white/50 text-xs">الحالة</th>
                  <th className="p-3 text-white/50 text-xs">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-b border-white/5 erp-table-row">
                    <td className="p-3 font-bold text-white">{u.name}</td>
                    <td className="p-3 text-white/50 font-mono text-xs">@{u.username}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-lg text-xs font-bold border ${ROLES[u.role]?.color}`}>{ROLES[u.role]?.label || u.role}</span></td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-lg text-xs font-bold border ${u.active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>{u.active ? "نشط" : "موقوف"}</span></td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(u)} className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

/* ─── Safes Tab ─── */
function SafesTab() {
  const { data: safes = [], isLoading } = useGetSettingsSafes();
  const { data: transfers = [] } = useGetSettingsSafeTransfers();
  const createSafe = useCreateSettingsSafe();
  const deleteSafe = useDeleteSettingsSafe();
  const createTransfer = useCreateSettingsSafeTransfer();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [form, setForm] = useState({ name: "", balance: "" });
  const [tf, setTf] = useState({ from_safe_id: "", to_safe_id: "", amount: "", notes: "" });
  const totalBalance = safes.reduce((s, x) => s + Number(x.balance), 0);

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/safes"] }); queryClient.invalidateQueries({ queryKey: ["/api/settings/safe-transfers"] }); };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <SectionHeader title="إدارة الخزائن" sub={`إجمالي الأرصدة: ${formatCurrency(totalBalance)}`} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTransfer(true)} className="btn-secondary flex items-center gap-2 px-3 py-2 rounded-xl text-sm"><ArrowLeftRight className="w-4 h-4" /> تحويل</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 px-3 py-2 rounded-xl text-sm"><Plus className="w-4 h-4" /> إضافة خزنة</button>
        </div>
      </div>

      {showAdd && (
        <div className="glass-panel rounded-2xl p-5 border border-amber-500/20">
          <div className="flex justify-between mb-3"><h4 className="font-bold text-amber-400">خزنة جديدة</h4><button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-white/40" /></button></div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><Label>اسم الخزنة</Label><input className="glass-input w-full text-white text-sm" placeholder="الخزنة الرئيسية" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>الرصيد الابتدائي</Label><input type="number" className="glass-input w-full text-white text-sm" placeholder="0" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary px-4 py-2 rounded-xl text-sm" onClick={() => {
              if (!form.name.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
              createSafe.mutate({ name: form.name, balance: Number(form.balance) || 0 }, {
                onSuccess: () => { invalidate(); toast({ title: "تم إضافة الخزنة" }); setForm({ name: "", balance: "" }); setShowAdd(false); },
              });
            }}>إضافة</button>
            <button className="btn-secondary px-4 py-2 rounded-xl text-sm" onClick={() => setShowAdd(false)}>إلغاء</button>
          </div>
        </div>
      )}

      {showTransfer && (
        <div className="glass-panel rounded-2xl p-5 border border-blue-500/20">
          <div className="flex justify-between mb-3"><h4 className="font-bold text-blue-400">تحويل بين الخزائن</h4><button onClick={() => setShowTransfer(false)}><X className="w-4 h-4 text-white/40" /></button></div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><Label>من خزنة</Label><select className="glass-input w-full text-white text-sm" value={tf.from_safe_id} onChange={e => setTf(f => ({ ...f, from_safe_id: e.target.value }))}>
              <option value="">اختر...</option>{safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><Label>إلى خزنة</Label><select className="glass-input w-full text-white text-sm" value={tf.to_safe_id} onChange={e => setTf(f => ({ ...f, to_safe_id: e.target.value }))}>
              <option value="">اختر...</option>{safes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><Label>المبلغ</Label><input type="number" className="glass-input w-full text-white text-sm" placeholder="0" value={tf.amount} onChange={e => setTf(f => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>ملاحظات</Label><input className="glass-input w-full text-white text-sm" placeholder="اختياري" value={tf.notes} onChange={e => setTf(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm" onClick={() => {
              if (!tf.from_safe_id || !tf.to_safe_id || !tf.amount) { toast({ title: "جميع الحقول مطلوبة", variant: "destructive" }); return; }
              createTransfer.mutate({ from_safe_id: Number(tf.from_safe_id), to_safe_id: Number(tf.to_safe_id), amount: Number(tf.amount), notes: tf.notes || undefined }, {
                onSuccess: () => { invalidate(); toast({ title: "تم التحويل" }); setTf({ from_safe_id: "", to_safe_id: "", amount: "", notes: "" }); setShowTransfer(false); },
                onError: (e: any) => toast({ title: e?.message || "فشل التحويل", variant: "destructive" }),
              });
            }}><ArrowLeftRight className="w-4 h-4" /> تحويل</button>
            <button className="btn-secondary px-4 py-2 rounded-xl text-sm" onClick={() => setShowTransfer(false)}>إلغاء</button>
          </div>
        </div>
      )}

      {isLoading ? <div className="p-12 text-center text-white/40">جاري التحميل...</div>
        : safes.length === 0 ? <div className="p-12 text-center text-white/40">لا توجد خزائن</div>
        : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {safes.map(s => (
              <div key={s.id} className="glass-panel rounded-2xl p-4 border border-white/5 relative group">
                <button onClick={() => { if (!confirm("حذف الخزنة؟")) return; deleteSafe.mutate(s.id, { onSuccess: () => { invalidate(); toast({ title: "تم الحذف" }); } }); }}
                  className="absolute top-2 left-2 p-1.5 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                <Landmark className="w-7 h-7 text-amber-400 mb-2" />
                <p className="text-white font-bold text-sm">{s.name}</p>
                <p className="text-xl font-black text-amber-400 mt-1">{formatCurrency(Number(s.balance))}</p>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

/* ─── Warehouses Tab ─── */
function WarehousesTab() {
  const { data: warehouses = [], isLoading } = useGetSettingsWarehouses();
  const createWarehouse = useCreateSettingsWarehouse();
  const deleteWarehouse = useDeleteSettingsWarehouse();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <SectionHeader title="إدارة المخازن" sub="أماكن تخزين البضاعة والمنتجات" />
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 px-3 py-2 rounded-xl text-sm"><Plus className="w-4 h-4" /> إضافة مخزن</button>
      </div>
      {showForm && (
        <div className="glass-panel rounded-2xl p-5 border border-amber-500/20">
          <div className="flex justify-between mb-3"><h4 className="font-bold text-amber-400">مخزن جديد</h4><button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-white/40" /></button></div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><Label>اسم المخزن</Label><input className="glass-input w-full text-white text-sm" placeholder="المخزن الرئيسي" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>العنوان</Label><input className="glass-input w-full text-white text-sm" placeholder="القاهرة، مصر" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary px-4 py-2 rounded-xl text-sm" onClick={() => {
              if (!form.name.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
              createWarehouse.mutate({ name: form.name, address: form.address || undefined }, {
                onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/warehouses"] }); toast({ title: "تم إضافة المخزن" }); setForm({ name: "", address: "" }); setShowForm(false); },
              });
            }}>إضافة</button>
            <button className="btn-secondary px-4 py-2 rounded-xl text-sm" onClick={() => setShowForm(false)}>إلغاء</button>
          </div>
        </div>
      )}
      {isLoading ? <div className="p-12 text-center text-white/40">جاري التحميل...</div>
        : warehouses.length === 0 ? <div className="p-12 text-center text-white/40">لا توجد مخازن</div>
        : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {warehouses.map((w: any) => (
              <div key={w.id} className="glass-panel rounded-2xl p-4 border border-white/5 relative group">
                <button onClick={() => { if (!confirm("حذف المخزن؟")) return; deleteWarehouse.mutate(w.id, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/warehouses"] }); toast({ title: "تم الحذف" }); } }); }}
                  className="absolute top-2 left-2 p-1.5 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                <Warehouse className="w-7 h-7 text-blue-400 mb-2" />
                <p className="text-white font-bold text-sm">{w.name}</p>
                {w.address && <p className="text-white/40 text-xs mt-1">{w.address}</p>}
                <p className="text-white/20 text-xs mt-2">{formatDate(w.created_at)}</p>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

/* ─── Appearance Tab ─── */
const COLOR_SWATCHES: Record<AccentColor, string> = {
  amber: "#f59e0b", emerald: "#10b981", violet: "#8b5cf6",
  sky: "#0ea5e9", rose: "#f43f5e", orange: "#f97316",
};

function AppearanceTab() {
  const { settings, update } = useAppSettings();
  const { toast } = useToast();
  const logoRef = useRef<HTMLInputElement>(null);
  const loginBgRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { toast({ title: "حجم الصورة كبير جداً (الحد 500 كيلوبايت)", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => update({ customLogo: reader.result as string });
    reader.readAsDataURL(file);
    toast({ title: "تم رفع اللوجو بنجاح" });
  };

  const handleLoginBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast({ title: "حجم الصورة كبير جداً (الحد 2 ميجابايت)", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => { update({ loginBgImage: reader.result as string }); toast({ title: "تم تغيير خلفية تسجيل الدخول" }); };
    reader.readAsDataURL(file);
  };

  const fontSizeKeys = Object.keys(FONT_SIZES) as FontSize[];
  const currentSizeIdx = fontSizeKeys.indexOf(settings.fontSize ?? "md");

  return (
    <div className="space-y-5">
      <SectionHeader title="تخصيص الواجهة" sub="تغيير مظهر البرنامج حسب هويتك" />

      {/* Company Info */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">معلومات الشركة</h4>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>اسم الشركة</Label>
            <input className="glass-input w-full text-white text-sm" value={settings.companyName}
              onChange={e => update({ companyName: e.target.value })} placeholder="Halal Tech" />
          </div>
          <div>
            <Label>الشعار / Slogan</Label>
            <input className="glass-input w-full text-white text-sm" value={settings.companySlogan}
              onChange={e => update({ companySlogan: e.target.value })} placeholder="الحلال = البركة" />
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Image className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">لوجو الشركة</h4>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
            {settings.customLogo
              ? <img src={settings.customLogo} alt="Logo" className="w-full h-full object-contain" />
              : <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="w-full h-full object-contain" />}
          </div>
          <div className="space-y-2">
            <button onClick={() => logoRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 glass-panel rounded-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white transition-all text-sm">
              <Upload className="w-4 h-4" /> رفع لوجو جديد
            </button>
            {settings.customLogo && (
              <button onClick={() => update({ customLogo: "" })}
                className="flex items-center gap-2 px-4 py-2 glass-panel rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all text-sm">
                <X className="w-4 h-4" /> حذف اللوجو المخصص
              </button>
            )}
            <p className="text-white/25 text-xs">PNG/JPG — الحد الأقصى 500 كيلوبايت</p>
          </div>
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
      </div>

      {/* Font + Size row */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Type className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">الخط وحجمه</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Font family dropdown */}
          <div className="space-y-2">
            <Label>نوع الخط</Label>
            <div className="relative">
              <select
                value={settings.fontFamily}
                onChange={e => { const v = e.target.value as FontFamily; update({ fontFamily: v }); toast({ title: `تم تغيير الخط إلى ${FONTS[v].label}` }); }}
                className="glass-input w-full appearance-none pr-4 text-sm cursor-pointer"
                style={{ fontFamily: `'${settings.fontFamily}', sans-serif` }}>
                {(Object.keys(FONTS) as FontFamily[]).map(f => (
                  <option key={f} value={f} className="bg-slate-900">{FONTS[f].label} — {f}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">▾</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center"
              style={{ fontFamily: `'${settings.fontFamily}', sans-serif` }}>
              <span className="text-white/70 text-sm">أبجد هوز حطي كلمن — نموذج خط {FONTS[settings.fontFamily].label}</span>
            </div>
          </div>

          {/* Font size slider */}
          <div className="space-y-2">
            <Label>حجم الخط</Label>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white/50 text-xs">صغير</span>
                <span className="text-amber-400 font-bold text-sm">{FONT_SIZES[settings.fontSize ?? "md"].label}</span>
                <span className="text-white/50 text-xs">كبير</span>
              </div>
              <input type="range" min={0} max={3} step={1} value={currentSizeIdx}
                onChange={e => { const sz = fontSizeKeys[Number(e.target.value)]; update({ fontSize: sz }); }}
                className="w-full accent-amber-500 cursor-pointer" />
              <div className="flex justify-between">
                {fontSizeKeys.map((k, i) => (
                  <button key={k} onClick={() => update({ fontSize: k })}
                    className={`text-xs font-bold px-2 py-0.5 rounded-lg transition-all ${(settings.fontSize ?? "md") === k ? "text-amber-400" : "text-white/30 hover:text-white/60"}`}>
                    {FONT_SIZES[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <p style={{ fontSize: FONT_SIZES[settings.fontSize ?? "md"].cssVal }} className="text-white/70 text-center">نص تجريبي بهذا الحجم</p>
            </div>
          </div>
        </div>
      </div>

      {/* Accent Color dropdown */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">لون الواجهة</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(ACCENT_COLORS) as AccentColor[]).map(color => {
            const isActive = settings.accentColor === color;
            return (
              <button key={color} onClick={() => { update({ accentColor: color }); toast({ title: `تم تغيير اللون إلى ${ACCENT_COLORS[color].label}` }); }}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isActive ? "border-white/30 bg-white/10" : "glass-panel border-white/5 hover:border-white/15 hover:bg-white/5"}`}>
                <div className="w-7 h-7 rounded-full shrink-0 shadow-lg" style={{ backgroundColor: COLOR_SWATCHES[color] }} />
                <span className={`text-sm font-bold ${isActive ? "text-white" : "text-white/60"}`}>{ACCENT_COLORS[color].label}</span>
                {isActive && <Check className="w-4 h-4 text-white/70 mr-auto" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── لون مخصص (Hex) ─── */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">لون مخصص (Hex) — يتجاوز الألوان أعلاه</h4>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={settings.customAccentHex || "#f59e0b"}
            onChange={e => update({ customAccentHex: e.target.value })}
            className="w-16 h-12 rounded-xl cursor-pointer border-0 bg-transparent"
            style={{ padding: "2px" }}
          />
          <div className="flex-1">
            <p className="text-white/60 text-xs mb-2">اختر أي لون تريده — سيطبّق فوراً على كل التطبيق</p>
            <div className="flex gap-2">
              <code className="text-amber-400 text-xs font-mono bg-black/30 px-2 py-1 rounded-lg">
                {settings.customAccentHex || "#f59e0b"}
              </code>
              {settings.customAccentHex && (
                <button
                  onClick={() => update({ customAccentHex: "" })}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 transition-colors"
                >
                  إلغاء المخصص
                </button>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full border-2 border-white/20 shadow-lg shrink-0"
            style={{ backgroundColor: settings.customAccentHex || "#f59e0b" }} />
        </div>
      </div>

      {/* ─── سماكة الحدود + سماكة النص + حجم الأيقونات ─── */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Type className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">إعدادات المظهر المتقدمة</h4>
        </div>

        {/* سماكة الحدود */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>سماكة الحدود</Label>
            <span className="text-amber-400 font-bold text-xs font-mono">{settings.borderWidth ?? 1}px</span>
          </div>
          <input type="range" min={0.5} max={4} step={0.5}
            value={settings.borderWidth ?? 1}
            onChange={e => update({ borderWidth: parseFloat(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer h-2 rounded-full" />
          <div className="flex justify-between text-white/30 text-xs">
            <span>رفيع جداً</span><span>سميك</span>
          </div>
        </div>

        {/* سماكة النص */}
        <div className="space-y-2">
          <Label>سماكة النص</Label>
          <div className="grid grid-cols-4 gap-2">
            {([400, 500, 600, 700] as const).map(w => (
              <button key={w} onClick={() => update({ fontWeightNormal: w })}
                className={`py-2 rounded-xl border text-xs font-bold transition-all ${(settings.fontWeightNormal ?? 400) === w ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:text-white hover:border-white/20"}`}
                style={{ fontWeight: w }}>
                {w === 400 ? "عادي" : w === 500 ? "متوسط" : w === 600 ? "نصف غامق" : "غامق"}
              </button>
            ))}
          </div>
          <p className="text-white/40 text-xs text-center" style={{ fontWeight: settings.fontWeightNormal ?? 400 }}>
            نموذج النص بهذه السماكة — أبجد هوز حطي كلمن
          </p>
        </div>

        {/* حجم الأيقونات */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>حجم أيقونات القائمة</Label>
            <span className="text-amber-400 font-bold text-xs font-mono">{settings.iconSize ?? 20}px</span>
          </div>
          <input type="range" min={14} max={36} step={2}
            value={settings.iconSize ?? 20}
            onChange={e => update({ iconSize: parseInt(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer h-2 rounded-full" />
          <div className="flex justify-between text-white/30 text-xs">
            <span>صغير</span><span>كبير</span>
          </div>
        </div>
      </div>

      {/* Login background */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Image className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">خلفية صفحة تسجيل الدخول</h4>
        </div>
        {/* Image preview + upload */}
        <div className="flex items-center gap-4">
          <div className="w-32 h-20 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-white/5 flex items-center justify-center">
            {settings.loginBgImage
              ? <img src={settings.loginBgImage} alt="Login BG" className="w-full h-full object-cover" />
              : <span className="text-white/20 text-xs text-center px-2">خلفية تدرج لوني</span>}
          </div>
          <div className="space-y-2">
            <button onClick={() => loginBgRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 glass-panel rounded-xl border border-white/10 hover:border-white/20 text-white/70 hover:text-white transition-all text-sm">
              <Upload className="w-4 h-4" /> {settings.loginBgImage ? "تغيير الصورة" : "رفع صورة خلفية"}
            </button>
            {settings.loginBgImage && (
              <button onClick={() => update({ loginBgImage: "" })}
                className="flex items-center gap-2 px-4 py-2 glass-panel rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all text-sm">
                <X className="w-4 h-4" /> إزالة الصورة
              </button>
            )}
            <p className="text-white/25 text-xs">PNG/JPG — الحد الأقصى 2 ميجابايت</p>
          </div>
        </div>
        <input ref={loginBgRef} type="file" accept="image/*" className="hidden" onChange={handleLoginBgUpload} />
        {/* Gradient presets (when no image) */}
        {!settings.loginBgImage && (
          <div>
            <p className="text-white/40 text-xs mb-2">أو اختر تدرجاً:</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {LOGIN_BG_OPTIONS.map(opt => (
                <button key={opt.key}
                  onClick={() => { update({ loginBg: opt.key }); toast({ title: "تم تغيير خلفية تسجيل الدخول" }); }}
                  className={`p-2.5 rounded-xl border transition-all text-center text-xs ${settings.loginBg === opt.key ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "glass-panel border-white/10 text-white/50 hover:border-white/20 hover:text-white"}`}>
                  {settings.loginBg === opt.key && <Check className="w-3 h-3 mx-auto mb-0.5" />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Currency Tab ─── */
const CURRENCY_OPTIONS: { code: CurrencyCode; flag: string; label: string; symbol: string }[] = [
  { code: "EGP", flag: "🇪🇬", label: "جنيه مصري",    symbol: "ج.م" },
  { code: "SAR", flag: "🇸🇦", label: "ريال سعودي",   symbol: "ر.س" },
  { code: "AED", flag: "🇦🇪", label: "درهم إماراتي", symbol: "د.إ" },
  { code: "USD", flag: "🇺🇸", label: "دولار أمريكي", symbol: "$"   },
  { code: "KWD", flag: "🇰🇼", label: "دينار كويتي",  symbol: "د.ك" },
  { code: "BHD", flag: "🇧🇭", label: "دينار بحريني", symbol: "د.ب" },
];

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; preview: string }[] = [
  { value: "western",      label: "أرقام غربية",       preview: "1, 2, 3 … 1234" },
  { value: "arabic-indic", label: "أرقام عربية-هندية", preview: "١، ٢، ٣ … ١٢٣٤" },
];

function CurrencyTab() {
  const { settings, update } = useAppSettings();
  const { toast } = useToast();

  const [localCurrency,    setLocalCurrency]    = useState<CurrencyCode>(settings.currency);
  const [localNumFmt,      setLocalNumFmt]      = useState<NumberFormat>(settings.numberFormat ?? "western");
  const [saved,            setSaved]            = useState(false);

  const selectedCurr = CURRENCY_OPTIONS.find(o => o.code === localCurrency)!;
  const previewAmount = 1234.56;
  const previewFormatted = formatCurrencyPreview(previewAmount, localCurrency, localNumFmt);

  const handleSave = () => {
    update({ currency: localCurrency, numberFormat: localNumFmt });
    setSaved(true);
    toast({ title: "تم حفظ الإعدادات ✓", description: "تم تطبيق العملة وصيغة الأرقام على كامل النظام" });
    setTimeout(() => setSaved(false), 2000);
  };

  const selectBase = {
    WebkitAppearance: "none" as const,
    MozAppearance: "none" as const,
    appearance: "none" as const,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#fff",
    borderRadius: "14px",
    padding: "12px 42px 12px 16px",
    width: "100%",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    outline: "none",
    direction: "rtl" as const,
    transition: "border-color 0.2s, box-shadow 0.2s",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <SectionHeader
        title="العملة والأرقام"
        sub="اختر العملة وصيغة عرض الأرقام المستخدمة في جميع أنحاء النظام"
      />

      <div className="glass-panel rounded-2xl p-6 border border-white/8 space-y-6">

        {/* ── Two dropdowns side by side ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Currency dropdown */}
          <div>
            <Label>العملة</Label>
            <div style={{ position: "relative" }}>
              <select
                value={localCurrency}
                onChange={(e) => setLocalCurrency(e.target.value as CurrencyCode)}
                style={selectBase}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)";
                  e.currentTarget.style.boxShadow  = "0 0 0 3px rgba(245,158,11,0.12)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                  e.currentTarget.style.boxShadow  = "none";
                }}
              >
                {CURRENCY_OPTIONS.map(o => (
                  <option key={o.code} value={o.code} style={{ background: "#111118", color: "#fff" }}>
                    {o.flag}  {o.label} — {o.code}
                  </option>
                ))}
              </select>

              {/* chevron icon */}
              <span style={{
                position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.35)", pointerEvents: "none", fontSize: "10px",
              }}>▼</span>

              {/* currency symbol badge */}
              <span style={{
                position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
                background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)",
                color: "#F59E0B", borderRadius: "8px", padding: "2px 8px",
                fontSize: "12px", fontWeight: 800, pointerEvents: "none",
              }}>
                {selectedCurr.symbol}
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "6px" }}>
              {selectedCurr.flag} {selectedCurr.label}
            </p>
          </div>

          {/* Number format dropdown */}
          <div>
            <Label>صيغة الأرقام</Label>
            <div style={{ position: "relative" }}>
              <select
                value={localNumFmt}
                onChange={(e) => setLocalNumFmt(e.target.value as NumberFormat)}
                style={selectBase}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)";
                  e.currentTarget.style.boxShadow  = "0 0 0 3px rgba(245,158,11,0.12)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                  e.currentTarget.style.boxShadow  = "none";
                }}
              >
                {NUMBER_FORMAT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: "#111118", color: "#fff" }}>
                    {o.label} — {o.preview}
                  </option>
                ))}
              </select>
              <span style={{
                position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.35)", pointerEvents: "none", fontSize: "10px",
              }}>▼</span>
            </div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "6px" }}>
              {NUMBER_FORMAT_OPTIONS.find(o => o.value === localNumFmt)?.preview}
            </p>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div style={{
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
          padding: "18px 20px",
        }}>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "12px", letterSpacing: "0.06em" }}>
            معاينة مباشرة
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>المبلغ التجريبي</span>
            <span style={{
              fontSize: "26px", fontWeight: 900, color: "#F59E0B",
              textShadow: "0 0 20px rgba(245,158,11,0.35)",
              letterSpacing: "-0.5px",
            }}>
              {previewFormatted}
            </span>
          </div>
          <div style={{
            marginTop: "10px", display: "flex", gap: "6px", flexWrap: "wrap" as const,
          }}>
            {[100, 999, 50000].map(n => (
              <span key={n} style={{
                fontSize: "12px", color: "rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "8px", padding: "3px 10px",
              }}>
                {formatCurrencyPreview(n, localCurrency, localNumFmt)}
              </span>
            ))}
          </div>
        </div>

        {/* ── Save button ── */}
        <button
          onClick={handleSave}
          style={{
            width: "100%", padding: "13px", borderRadius: "14px",
            fontWeight: 800, fontSize: "15px", cursor: "pointer",
            background: saved ? "rgba(52,211,153,0.9)" : "#F59E0B",
            color: saved ? "#fff" : "#000",
            border: "none", transition: "all 0.25s",
            boxShadow: saved
              ? "0 4px 20px rgba(52,211,153,0.3)"
              : "0 4px 20px rgba(245,158,11,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}
        >
          {saved ? (
            <>
              <CheckCircle2 style={{ width: "18px", height: "18px" }} />
              تم الحفظ
            </>
          ) : (
            <>
              <Save style={{ width: "18px", height: "18px" }} />
              حفظ الإعدادات
            </>
          )}
        </button>

        {/* ── Info note ── */}
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
          سيتم تطبيق التغييرات فوراً على جميع الشاشات والتقارير والفواتير
        </p>
      </div>
    </div>
  );
}

/* ─── Backup & Import Tab ─── */

const BACKUP_MODULES_LIST = [
  { key: "sales",        icon: "🛍️", label: "المبيعات",          sub: "الفواتير، العملاء، المرتجعات",         url: "/api/sales" },
  { key: "purchases",    icon: "🛒", label: "المشتريات",          sub: "فواتير الموردين، المرتجعات",           url: "/api/purchases" },
  { key: "products",     icon: "📦", label: "المخزن",             sub: "الأصناف، الكميات، الحركات",            url: "/api/products" },
  { key: "treasury",     icon: "💰", label: "الخزينة",            sub: "الإيرادات، المصروفات، السندات",        url: "/api/financial-transactions" },
  { key: "customers",    icon: "👥", label: "العملاء والموردين",  sub: "الأرصدة والبيانات",                    url: "/api/customers" },
  { key: "settings",     icon: "⚙️", label: "الإعدادات",          sub: "العملة والتفضيلات",                    url: null },
  { key: "reports",      icon: "📊", label: "التقارير المحفوظة",  sub: "الإحصائيات والبيانات التاريخية",       url: null },
] as const;

const ACTIVITY_KEY  = "halal_erp_activity_log";
const LAST_BK_KEY   = "halal_erp_last_backup";
const SCHEDULE_KEY2 = "halal_erp_schedule";

interface ActivityEntry {
  id:     string;
  date:   string;
  type:   "backup" | "import-products" | "import-purchases";
  file:   string;
  status: string;
  user:   string;
}

function loadActivityLog(): ActivityEntry[] {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"); } catch { return []; }
}
function pushActivity(e: Omit<ActivityEntry, "id">) {
  const log = loadActivityLog();
  log.unshift({ ...e, id: `${Date.now()}` });
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log.slice(0, 50))); } catch {}
}

interface PurchaseRow {
  idx:       number;
  sku:       string;
  name:      string;
  quantity:  string;
  unitPrice: string;
  supplier:  string;
  invoiceNo: string;
  date:      string;
  tax:       string;
  discount:  string;
  productId: number | null;
  errors:    string[];
}

function BackupImportTab() {
  const { toast } = useToast();
  const [importSubTab, setImportSubTab] = useState<"products" | "purchases">("products");

  /* ── Backup state ── */
  const [bkModules,  setBkModules]  = useState<Set<string>>(new Set(BACKUP_MODULES_LIST.map(m => m.key)));
  const [bkLoading,  setBkLoading]  = useState(false);
  const [bkProgress, setBkProgress] = useState(0);
  const [bkResult,   setBkResult]   = useState<{ name: string; size: string; count: number } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(() => localStorage.getItem(LAST_BK_KEY));
  const [schedule,   setSchedule]   = useState(() => localStorage.getItem(SCHEDULE_KEY2) || "none");

  /* ── Products import state ── */
  const [prodImporting, setProdImporting] = useState(false);
  const [prodExporting, setProdExporting] = useState(false);
  const [prodResult,    setProdResult]    = useState<{ success: number; failed: number } | null>(null);
  const prodFileRef = useRef<HTMLInputElement>(null);

  /* ── Purchase import state ── */
  const [purRows,       setPurRows]       = useState<PurchaseRow[]>([]);
  const [purParsed,     setPurParsed]     = useState(false);
  const [purLoading,    setPurLoading]    = useState(false);
  const [purConfirming, setPurConfirming] = useState(false);
  const [purResult,     setPurResult]     = useState<string | null>(null);
  const [purSupplier,   setPurSupplier]   = useState("");
  const [purPayType,    setPurPayType]    = useState<"cash" | "credit">("cash");
  const purFileRef = useRef<HTMLInputElement>(null);

  /* ── Activity log ── */
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>(() => loadActivityLog());
  const refreshLog = () => setActivityLog(loadActivityLog());

  /* ─── BACKUP ─── */
  const toggleModule = (key: string) => setBkModules(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
  });
  const toggleAllModules = () =>
    setBkModules(bkModules.size === BACKUP_MODULES_LIST.length ? new Set() : new Set(BACKUP_MODULES_LIST.map(m => m.key)));

  const handleBackup = async () => {
    if (bkModules.size === 0) { toast({ title: "اختر وحدة واحدة على الأقل", variant: "destructive" }); return; }
    setBkLoading(true); setBkProgress(5); setBkResult(null);
    try {
      const selected = BACKUP_MODULES_LIST.filter(m => bkModules.has(m.key));
      const bundle: Record<string, unknown> = {
        version: "1.0", created_at: new Date().toISOString(), app: "Halal Tech ERP",
        modules: selected.map(m => m.label),
      };
      const step = Math.floor(75 / selected.length);
      for (const mod of selected) {
        setBkProgress(p => Math.min(p + step, 85));
        if (mod.url) {
          try {
            const res = await fetch(api(mod.url));
            bundle[mod.key] = res.ok ? await res.json() : [];
          } catch { bundle[mod.key] = []; }
        } else if (mod.key === "settings") {
          try { bundle[mod.key] = JSON.parse(localStorage.getItem("halal_erp_settings") || "{}"); } catch { bundle[mod.key] = {}; }
        } else { bundle[mod.key] = null; }
      }
      setBkProgress(90);
      const json  = JSON.stringify(bundle, null, 2);
      const blob  = new Blob([json], { type: "application/json" });
      const dt    = new Date().toISOString().replace("T", "_").replace(/:/g, "-").slice(0, 19);
      const fname = `backup_${dt}.json`;
      const link  = document.createElement("a");
      link.href     = URL.createObjectURL(blob);
      link.download = fname;
      link.click();
      URL.revokeObjectURL(link.href);
      const sizekb = (blob.size / 1024).toFixed(1);
      setBkResult({ name: fname, size: `${sizekb} KB`, count: selected.length });
      setBkProgress(100);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BK_KEY, now);
      setLastBackup(now);
      pushActivity({ date: now, type: "backup", file: fname, status: `✅ ${selected.length} وحدات`, user: "Admin" });
      refreshLog();
      toast({ title: `✅ تم إنشاء النسخة الاحتياطية — ${fname}` });
    } catch { toast({ title: "فشل إنشاء النسخة الاحتياطية", variant: "destructive" }); }
    finally { setBkLoading(false); setTimeout(() => setBkProgress(0), 1500); }
  };

  const lastBackupLabel = () => {
    if (!lastBackup) return "لم يتم إنشاء نسخة بعد";
    const days = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000);
    if (days === 0) return "اليوم";
    if (days === 1) return "منذ يوم واحد";
    if (days < 30)  return `منذ ${days} أيام`;
    return new Date(lastBackup).toLocaleDateString("ar-EG");
  };

  /* ─── PRODUCTS IMPORT ─── */
  const handleProductsExport = async () => {
    setProdExporting(true);
    try {
      const res  = await fetch(api("/api/products"));
      const prods = await res.json();
      const rows = prods.map((p: any) => ({
        "اسم الصنف": p.name, "كود الصنف (SKU)": p.sku || "", "التصنيف": p.category || "",
        "الكمية": Number(p.quantity), "سعر التكلفة": Number(p.cost_price),
        "سعر البيع": Number(p.sale_price), "حد التنبيه": p.low_stock_threshold || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
      XLSX.writeFile(wb, `halal-tech-products-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: `تم تصدير ${prods.length} صنف بنجاح` });
    } catch { toast({ title: "فشل التصدير", variant: "destructive" }); }
    finally { setProdExporting(false); }
  };

  const handleProductsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setProdImporting(true); setProdResult(null);
    try {
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];
      let success = 0, failed = 0;
      for (const row of rows) {
        const name = row["اسم الصنف"] || row["name"] || row["Name"];
        if (!name) { failed++; continue; }
        try {
          const res = await fetch(api("/api/products"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: String(name), sku: String(row["كود الصنف (SKU)"] || row["sku"] || ""),
              category: String(row["التصنيف"] || row["category"] || ""),
              quantity: Number(row["الكمية"] || row["quantity"] || 0),
              cost_price: Number(row["سعر التكلفة"] || row["cost_price"] || 0),
              sale_price: Number(row["سعر البيع"] || row["sale_price"] || 0),
              low_stock_threshold: row["حد التنبيه"] ? Number(row["حد التنبيه"]) : undefined,
            }),
          });
          if (res.ok) success++; else failed++;
        } catch { failed++; }
      }
      setProdResult({ success, failed });
      const now = new Date().toISOString();
      pushActivity({ date: now, type: "import-products", file: file.name, status: `✅ ${success} صنف${failed > 0 ? ` — ⚠️ ${failed} خطأ` : ""}`, user: "Admin" });
      refreshLog();
      toast({ title: `تم الاستيراد: ${success} صنف ✓، ${failed} فشل` });
    } catch { toast({ title: "فشل قراءة الملف", variant: "destructive" }); }
    finally { setProdImporting(false); if (prodFileRef.current) prodFileRef.current.value = ""; }
  };

  const downloadProductsTemplate = () => {
    const rows = [
      { "اسم الصنف": "شاشة LCD", "كود الصنف (SKU)": "SCR001", "التصنيف": "قطع غيار", "الكمية": 10, "سعر التكلفة": 150, "سعر البيع": 200, "حد التنبيه": 5 },
      { "اسم الصنف": "بطارية أيفون", "كود الصنف (SKU)": "BAT002", "التصنيف": "بطاريات", "الكمية": 20, "سعر التكلفة": 80, "سعر البيع": 120, "حد التنبيه": 3 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const instRows = [
      { "الحقل": "اسم الصنف",         "الوصف": "اسم المنتج (إلزامي)",           "مثال": "شاشة LCD" },
      { "الحقل": "كود الصنف (SKU)",   "الوصف": "رمز تعريف فريد",                "مثال": "SCR001" },
      { "الحقل": "التصنيف",           "الوصف": "فئة المنتج",                     "مثال": "قطع غيار" },
      { "الحقل": "الكمية",            "الوصف": "الكمية في المخزن",               "مثال": "10" },
      { "الحقل": "سعر التكلفة",       "الوصف": "سعر الشراء",                     "مثال": "150" },
      { "الحقل": "سعر البيع",         "الوصف": "سعر البيع للعميل",               "مثال": "200" },
      { "الحقل": "حد التنبيه",        "الوصف": "كمية التنبيه للنفاد",             "مثال": "5" },
    ];
    const wsInst = XLSX.utils.json_to_sheet(instRows);
    wsInst["!cols"] = [{ wch: 20 }, { wch: 35 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
    XLSX.utils.book_append_sheet(wb, wsInst, "التعليمات");
    XLSX.writeFile(wb, "template-products.xlsx");
  };

  /* ─── PURCHASE IMPORT ─── */
  const handlePurchaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPurLoading(true); setPurParsed(false); setPurRows([]); setPurResult(null);
    try {
      const prodRes  = await fetch(api("/api/products"));
      const products: any[] = prodRes.ok ? await prodRes.json() : [];
      const skuMap   = new Map<string, { id: number; name: string }>();
      for (const p of products) {
        if (p.sku) skuMap.set(String(p.sku).trim().toUpperCase(), { id: p.id, name: p.name });
      }
      const data    = await file.arrayBuffer();
      const wb      = XLSX.read(data);
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws) as any[];
      const parsed: PurchaseRow[] = rawRows.map((row, idx) => {
        const sku       = String(row["كود الصنف (SKU)"] || row["sku"] || "").trim();
        const name      = String(row["اسم الصنف"]       || row["name"]       || "");
        const quantity  = String(row["الكمية"]           || row["quantity"]   || "");
        const unitPrice = String(row["سعر الشراء"]       || row["unit_price"] || "");
        const supplier  = String(row["المورد"]           || row["supplier"]   || "");
        const invoiceNo = String(row["رقم الفاتورة"]     || row["invoice_no"] || "");
        const date      = String(row["تاريخ الفاتورة"]   || row["date"]       || "");
        const tax       = String(row["الضريبة%"]         || row["tax"]        || "0");
        const discount  = String(row["الخصم%"]           || row["discount"]   || "0");
        const errors: string[] = [];
        if (!sku)                                                             errors.push("كود الصنف مفقود");
        else if (!skuMap.has(sku.toUpperCase()))                             errors.push(`كود غير موجود: ${sku}`);
        if (!quantity  || isNaN(Number(quantity))  || Number(quantity) <= 0) errors.push("الكمية غير صالحة");
        if (!unitPrice || isNaN(Number(unitPrice)) || Number(unitPrice) <= 0) errors.push("السعر غير صالح");
        const resolved = skuMap.get(sku.toUpperCase());
        return { idx, sku, name: name || resolved?.name || "", quantity, unitPrice, supplier, invoiceNo, date, tax, discount, productId: resolved?.id ?? null, errors };
      });
      setPurRows(parsed); setPurParsed(true);
      if (parsed.length > 0 && parsed[0].supplier) setPurSupplier(parsed[0].supplier);
    } catch { toast({ title: "فشل قراءة ملف المشتريات", variant: "destructive" }); }
    finally { setPurLoading(false); if (purFileRef.current) purFileRef.current.value = ""; }
  };

  const updatePurRow = (idx: number, field: "quantity" | "unitPrice", value: string) => {
    setPurRows(prev => prev.map(r => {
      if (r.idx !== idx) return r;
      const u = { ...r, [field]: value };
      const errors: string[] = [];
      if (!u.sku)                                                              errors.push("كود الصنف مفقود");
      else if (!u.productId)                                                   errors.push("كود غير موجود في النظام");
      if (!u.quantity  || isNaN(Number(u.quantity))  || Number(u.quantity) <= 0) errors.push("الكمية غير صالحة");
      if (!u.unitPrice || isNaN(Number(u.unitPrice)) || Number(u.unitPrice) <= 0) errors.push("السعر غير صالح");
      u.errors = errors;
      return u;
    }));
  };

  const validRows  = purRows.filter(r => r.errors.length === 0);
  const errorRows  = purRows.filter(r => r.errors.length > 0);

  const handlePurchaseConfirm = async () => {
    if (validRows.length === 0) { toast({ title: "لا توجد صفوف صالحة للاستيراد", variant: "destructive" }); return; }
    setPurConfirming(true);
    try {
      const items = validRows.map(r => {
        const qty          = Number(r.quantity);
        const price        = Number(r.unitPrice);
        const discountFrac = Number(r.discount || 0) / 100;
        const taxFrac      = Number(r.tax      || 0) / 100;
        const unitNet      = price * (1 - discountFrac);
        const totalPrice   = qty * unitNet * (1 + taxFrac);
        return { product_id: r.productId!, product_name: r.name, quantity: qty, unit_price: unitNet, total_price: totalPrice };
      });
      const total = items.reduce((s, i) => s + i.total_price, 0);
      const body  = {
        payment_type: purPayType, total_amount: total,
        paid_amount: purPayType === "credit" ? 0 : total,
        items, supplier_name: purSupplier || undefined,
        notes: `استيراد من Excel — ${validRows.length} صنف`,
      };
      const res  = await fetch(api("/api/purchases"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الاستيراد");
      const msg = `تم إنشاء فاتورة مشتريات ${data.invoice_no} وتحديث المخزن بـ ${validRows.length} صنف ✓`;
      setPurResult(msg);
      const now = new Date().toISOString();
      pushActivity({ date: now, type: "import-purchases", file: "Excel", status: `✅ ${validRows.length} صنف — ${data.invoice_no}`, user: "Admin" });
      refreshLog();
      toast({ title: msg });
    } catch (err: any) { toast({ title: err.message || "فشل الاستيراد", variant: "destructive" }); }
    finally { setPurConfirming(false); }
  };

  const downloadPurchaseTemplate = () => {
    const rows = [
      { "كود الصنف (SKU)": "SCR001", "اسم الصنف": "شاشة LCD", "الكمية": 10, "سعر الشراء": 150, "المورد": "مورد الشاشات", "تاريخ الفاتورة": "2024-01-15", "رقم الفاتورة": "INV-001", "الضريبة%": 14, "الخصم%": 0 },
      { "كود الصنف (SKU)": "BAT002", "اسم الصنف": "بطارية أيفون", "الكمية": 20, "سعر الشراء": 80, "المورد": "مورد الشاشات", "تاريخ الفاتورة": "2024-01-15", "رقم الفاتورة": "INV-001", "الضريبة%": 14, "الخصم%": 5 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }];
    const instRows = [
      { "الحقل": "كود الصنف (SKU)",  "الوصف": "رمز الصنف الموجود في النظام (إلزامي)",         "مثال": "SCR001" },
      { "الحقل": "اسم الصنف",        "الوصف": "اسم الصنف للعرض فقط (اختياري)",                "مثال": "شاشة LCD" },
      { "الحقل": "الكمية",           "الوصف": "الكمية المشتراة (إلزامي، أكبر من صفر)",         "مثال": "10" },
      { "الحقل": "سعر الشراء",       "الوصف": "سعر الوحدة قبل الضريبة (إلزامي)",               "مثال": "150" },
      { "الحقل": "المورد",           "الوصف": "اسم المورد (اختياري)",                           "مثال": "مورد الشاشات" },
      { "الحقل": "تاريخ الفاتورة",   "الوصف": "تاريخ الفاتورة بصيغة YYYY-MM-DD (اختياري)",   "مثال": "2024-01-15" },
      { "الحقل": "رقم الفاتورة",     "الوصف": "رقم فاتورة المورد الأصلية (اختياري)",           "مثال": "INV-001" },
      { "الحقل": "الضريبة%",         "الوصف": "نسبة ضريبة القيمة المضافة (اختياري، افتراضي 0)","مثال": "14" },
      { "الحقل": "الخصم%",           "الوصف": "نسبة الخصم على سعر الوحدة (اختياري، افتراضي 0)","مثال": "0" },
    ];
    const wsInst = XLSX.utils.json_to_sheet(instRows);
    wsInst["!cols"] = [{ wch: 18 }, { wch: 45 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "فاتورة المشتريات");
    XLSX.utils.book_append_sheet(wb, wsInst, "التعليمات");
    XLSX.writeFile(wb, "template-purchase-invoice.xlsx");
  };

  /* ─── RENDER ─── */
  return (
    <div className="space-y-6">
      <SectionHeader title="النسخ الاحتياطية والاستيراد" sub="احتفظ ببيانات نظامك واستورد البيانات بأمان" />

      {/* ══════════ SECTION 1: BACKUP ══════════ */}
      <div className="glass-panel rounded-2xl border border-white/8 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">النسخ الاحتياطية</h4>
              <p className="text-white/40 text-xs">آخر نسخة: {lastBackupLabel()}</p>
            </div>
          </div>
          <button onClick={toggleAllModules} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            {bkModules.size === BACKUP_MODULES_LIST.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Module checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BACKUP_MODULES_LIST.map(m => {
              const active = bkModules.has(m.key);
              return (
                <button key={m.key} onClick={() => toggleModule(m.key)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${
                    active ? "bg-blue-500/10 border-blue-500/25" : "glass-panel border-white/6 hover:border-white/15"
                  }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    active ? "bg-blue-500/20" : "bg-white/5"
                  }`}>
                    {active
                      ? <Check className="w-4 h-4 text-blue-400" />
                      : <span className="text-base leading-none">{m.icon}</span>
                    }
                  </div>
                  <div className="flex-1 text-right">
                    <p className={`text-sm font-bold ${active ? "text-blue-300" : "text-white/70"}`}>{m.label}</p>
                    <p className="text-white/30 text-xs">{m.sub}</p>
                  </div>
                  <span className="text-lg leading-none">{m.icon}</span>
                </button>
              );
            })}
          </div>

          {/* Schedule */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
            <span className="text-white/40 text-xs whitespace-nowrap">جدولة تلقائية:</span>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: "none", l: "بدون" }, { v: "daily", l: "يومياً" },
                { v: "weekly", l: "أسبوعياً" }, { v: "monthly", l: "شهرياً" },
              ].map(s => (
                <button key={s.v}
                  onClick={() => { setSchedule(s.v); localStorage.setItem(SCHEDULE_KEY2, s.v); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                    schedule === s.v
                      ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                      : "border-white/10 text-white/35 hover:border-white/20 hover:text-white/60"
                  }`}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          {bkLoading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-white/40">
                <span>جاري إنشاء النسخة الاحتياطية...</span>
                <span>{bkProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full transition-all duration-300" style={{ width: `${bkProgress}%` }} />
              </div>
            </div>
          )}

          {/* Success card */}
          {bkResult && !bkLoading && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 font-bold text-sm">تم إنشاء النسخة الاحتياطية بنجاح</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-white/35 text-xs mb-0.5">الملف</p>
                  <p className="text-white text-xs font-bold truncate">{bkResult.name.slice(0, 20)}…</p>
                </div>
                <div>
                  <p className="text-white/35 text-xs mb-0.5">الحجم</p>
                  <p className="text-white text-sm font-bold">{bkResult.size}</p>
                </div>
                <div>
                  <p className="text-white/35 text-xs mb-0.5">الوحدات</p>
                  <p className="text-white text-sm font-bold">{bkResult.count}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleBackup}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/25 rounded-lg text-emerald-400 text-xs font-bold transition-all">
                  <Download className="w-3.5 h-3.5" /> تحميل مرة أخرى
                </button>
                <button disabled
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/3 border border-white/8 rounded-lg text-white/20 text-xs font-bold cursor-not-allowed">
                  ☁️ نسخ إلى السحابة (قريباً)
                </button>
              </div>
            </div>
          )}

          {/* Backup button */}
          <button onClick={handleBackup} disabled={bkLoading || bkModules.size === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-xl text-blue-300 font-bold text-sm transition-all disabled:opacity-40">
            {bkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            {bkLoading ? `جاري الإنشاء... ${bkProgress}%` : `💾 إنشاء نسخة احتياطية (${bkModules.size} وحدات)`}
          </button>
        </div>
      </div>

      {/* ══════════ SECTION 2: IMPORT ══════════ */}
      <div className="glass-panel rounded-2xl border border-white/8 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Upload className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">الاستيراد</h4>
              <p className="text-white/40 text-xs">استيراد الأصناف وفواتير المشتريات من ملفات Excel</p>
            </div>
          </div>
          {/* Sub-tabs */}
          <div className="flex gap-1.5">
            {[
              { id: "products"  as const, label: "📦 استيراد الأصناف" },
              { id: "purchases" as const, label: "🛒 استيراد فاتورة مشتريات" },
            ].map(t => (
              <button key={t.id} onClick={() => setImportSubTab(t.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                  importSubTab === t.id
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                    : "border-white/8 text-white/40 hover:text-white/60 hover:border-white/15"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* ── Products sub-tab ── */}
          {importSubTab === "products" && (
            <div className="space-y-4">
              {/* Export existing products */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <div>
                  <p className="text-emerald-400 font-bold text-sm">تصدير الأصناف الحالية</p>
                  <p className="text-white/30 text-xs">تحميل جميع الأصناف كملف Excel</p>
                </div>
                <button onClick={handleProductsExport} disabled={prodExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold text-xs transition-all disabled:opacity-40">
                  {prodExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {prodExporting ? "جاري التصدير..." : "تصدير Excel"}
                </button>
              </div>

              {/* Import products */}
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
                <div>
                  <p className="text-amber-400 font-bold text-sm">استيراد أصناف جديدة</p>
                  <p className="text-white/30 text-xs">رفع ملف Excel لإضافة الأصناف دفعةً واحدة</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => prodFileRef.current?.click()} disabled={prodImporting}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl text-amber-400 font-bold text-xs transition-all disabled:opacity-40">
                    {prodImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {prodImporting ? "جاري الاستيراد..." : "رفع ملف Excel"}
                  </button>
                  <button onClick={downloadProductsTemplate}
                    className="flex items-center gap-2 px-4 py-2 glass-panel border border-white/10 hover:border-white/20 rounded-xl text-white/50 hover:text-white text-xs transition-all">
                    <Download className="w-3.5 h-3.5" /> تحميل نموذج فارغ
                  </button>
                </div>
                <input ref={prodFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleProductsImport} />
                {prodResult && (
                  <div className={`p-3 rounded-xl border text-xs ${prodResult.failed === 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 inline ml-2" />
                    تم استيراد <strong>{prodResult.success}</strong> صنف
                    {prodResult.failed > 0 && <span className="text-red-400"> — فشل {prodResult.failed}</span>}
                  </div>
                )}
                <div className="p-3 rounded-xl bg-white/3 border border-white/5 text-xs text-white/25">
                  الأعمدة: اسم الصنف، كود الصنف (SKU)، التصنيف، الكمية، سعر التكلفة، سعر البيع، حد التنبيه — الصيغ: xlsx, xls, csv
                </div>
              </div>
            </div>
          )}

          {/* ── Purchases sub-tab ── */}
          {importSubTab === "purchases" && (
            <div className="space-y-4">
              {!purParsed ? (
                <div className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 space-y-3">
                  <div>
                    <p className="text-violet-400 font-bold text-sm">استيراد فاتورة مشتريات</p>
                    <p className="text-white/30 text-xs">رفع ملف Excel يحتوي على بنود الفاتورة لإنشائها تلقائياً وتحديث المخزن</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => purFileRef.current?.click()} disabled={purLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl text-violet-400 font-bold text-xs transition-all disabled:opacity-40">
                      {purLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {purLoading ? "جاري القراءة والتحقق..." : "رفع ملف Excel"}
                    </button>
                    <button onClick={downloadPurchaseTemplate}
                      className="flex items-center gap-2 px-4 py-2 glass-panel border border-white/10 hover:border-white/20 rounded-xl text-white/50 hover:text-white text-xs transition-all">
                      <Download className="w-3.5 h-3.5" /> تحميل نموذج فارغ
                    </button>
                  </div>
                  <input ref={purFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handlePurchaseFile} />
                  <div className="p-3 rounded-xl bg-white/3 border border-white/5 text-xs text-white/25 space-y-0.5">
                    <p><span className="text-white/40">إلزامي:</span> كود الصنف (SKU)، الكمية، سعر الشراء</p>
                    <p><span className="text-white/40">اختياري:</span> اسم الصنف، المورد، تاريخ الفاتورة، رقم الفاتورة، الضريبة%، الخصم%</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/8">
                    <div className="flex gap-4">
                      <span className="text-emerald-400 text-sm font-bold">{validRows.length} صنف صحيح ✓</span>
                      {errorRows.length > 0 && <span className="text-red-400 text-sm font-bold">{errorRows.length} صنف به أخطاء ✗</span>}
                    </div>
                    <button onClick={() => { setPurParsed(false); setPurRows([]); setPurResult(null); }}
                      className="text-white/30 hover:text-white/60 text-xs transition-colors">
                      تغيير الملف
                    </button>
                  </div>

                  {/* Invoice meta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-white/40 text-xs mb-1.5">اسم المورد</label>
                      <input value={purSupplier} onChange={e => setPurSupplier(e.target.value)}
                        className="glass-input w-full text-white text-sm" placeholder="اسم المورد (اختياري)" />
                    </div>
                    <div>
                      <label className="block text-white/40 text-xs mb-1.5">نوع الدفع</label>
                      <select value={purPayType} onChange={e => setPurPayType(e.target.value as "cash" | "credit")}
                        className="glass-input w-full text-white text-sm">
                        <option value="cash">نقدي (كاش)</option>
                        <option value="credit">آجل (دين)</option>
                      </select>
                    </div>
                  </div>

                  {/* Preview table */}
                  <div className="overflow-x-auto rounded-xl border border-white/8">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                        <tr className="border-b border-white/8 bg-white/3">
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium whitespace-nowrap">SKU</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">الصنف</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium whitespace-nowrap">الكمية</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium whitespace-nowrap">السعر</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium whitespace-nowrap">الإجمالي</th>
                          <th className="px-3 py-2.5 text-right text-white/40 font-medium">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purRows.map(r => {
                          const hasError = r.errors.length > 0;
                          const total    = (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
                          return (
                            <tr key={r.idx}
                              className={`border-b border-white/4 transition-colors ${hasError ? "bg-red-500/5" : "hover:bg-white/2"}`}>
                              <td className="px-3 py-2 text-white/50 font-mono whitespace-nowrap">{r.sku || "—"}</td>
                              <td className="px-3 py-2 text-white/70 max-w-[120px] truncate">{r.name || "—"}</td>
                              <td className="px-3 py-2">
                                <input type="number" value={r.quantity}
                                  onChange={e => updatePurRow(r.idx, "quantity", e.target.value)}
                                  className={`w-16 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none focus:ring-1 focus:ring-amber-500/30 ${
                                    !r.quantity || Number(r.quantity) <= 0 ? "border-red-500/50" : "border-white/10 focus:border-amber-500/40"
                                  }`} />
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" value={r.unitPrice}
                                  onChange={e => updatePurRow(r.idx, "unitPrice", e.target.value)}
                                  className={`w-20 px-2 py-1 rounded-lg bg-white/5 border text-white text-center text-xs outline-none focus:ring-1 focus:ring-amber-500/30 ${
                                    !r.unitPrice || Number(r.unitPrice) <= 0 ? "border-red-500/50" : "border-white/10 focus:border-amber-500/40"
                                  }`} />
                              </td>
                              <td className="px-3 py-2 text-white/55 font-mono whitespace-nowrap">
                                {isNaN(total) ? "—" : total.toFixed(2)}
                              </td>
                              <td className="px-3 py-2">
                                {hasError
                                  ? <span className="text-red-400 text-xs" title={r.errors.join(" | ")}>✗ {r.errors[0]}</span>
                                  : <span className="text-emerald-400 text-xs">✓ صالح</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Grand total */}
                  {validRows.length > 0 && (
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/3 border border-white/8">
                      <span className="text-white/50 text-sm">إجمالي الفاتورة</span>
                      <span className="text-amber-400 font-black text-lg">
                        {validRows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Import result */}
                  {purResult && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                      <CheckCircle2 className="w-4 h-4 inline ml-2" />{purResult}
                    </div>
                  )}

                  {/* Confirm button */}
                  <button onClick={handlePurchaseConfirm} disabled={purConfirming || validRows.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl text-violet-400 font-bold text-sm transition-all disabled:opacity-40">
                    {purConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {purConfirming ? "جاري إنشاء الفاتورة وتحديث المخزن..." : `تأكيد استيراد ${validRows.length} صنف وإنشاء فاتورة مشتريات`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════ SECTION 3: ACTIVITY LOG ══════════ */}
      <div className="glass-panel rounded-2xl border border-white/8 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center">
              <History className="w-4 h-4 text-white/50" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">سجل العمليات</h4>
              <p className="text-white/40 text-xs">آخر {activityLog.length} عملية</p>
            </div>
          </div>
          {activityLog.length > 0 && (
            <button onClick={() => { localStorage.removeItem(ACTIVITY_KEY); setActivityLog([]); }}
              className="text-xs text-white/30 hover:text-red-400 transition-colors">
              مسح السجل
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          {activityLog.length === 0 ? (
            <div className="p-8 text-center text-white/25 text-sm">لا توجد عمليات مسجلة بعد</div>
          ) : (
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/2">
                  <th className="px-4 py-3 text-right text-white/35 font-medium">التاريخ</th>
                  <th className="px-4 py-3 text-right text-white/35 font-medium">النوع</th>
                  <th className="px-4 py-3 text-right text-white/35 font-medium">الملف</th>
                  <th className="px-4 py-3 text-right text-white/35 font-medium">الحالة</th>
                  <th className="px-4 py-3 text-right text-white/35 font-medium">المستخدم</th>
                </tr>
              </thead>
              <tbody>
                {activityLog.map(e => (
                  <tr key={e.id} className="border-b border-white/4 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 text-white/45 font-mono whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString("ar-EG")} {new Date(e.date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap ${
                        e.type === "backup"            ? "bg-blue-500/15 text-blue-400"   :
                        e.type === "import-products"   ? "bg-amber-500/15 text-amber-400" :
                                                         "bg-violet-500/15 text-violet-400"
                      }`}>
                        {e.type === "backup" ? "نسخ احتياطي" : e.type === "import-products" ? "استيراد أصناف" : "استيراد مشتريات"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/45 font-mono max-w-[120px] truncate">{e.file}</td>
                    <td className="px-4 py-3 text-white/65">{e.status}</td>
                    <td className="px-4 py-3 text-white/45">{e.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Data Management Tab ─── */
const DATA_GROUPS = [
  { key: "sales", label: "المبيعات", sub: "فواتير البيع والمدفوعات", color: "emerald" },
  { key: "purchases", label: "المشتريات", sub: "فواتير الشراء وتكاليفها", color: "amber" },
  { key: "expenses", label: "المصروفات", sub: "جميع سجلات المصروفات", color: "red" },
  { key: "income", label: "الإيرادات", sub: "جميع سجلات الإيرادات", color: "teal" },
  { key: "receipt_vouchers", label: "سندات القبض", sub: "مدفوعات العملاء", color: "violet" },
  { key: "deposit_vouchers", label: "سندات التوريد", sub: "توريدات العملاء النقدية", color: "indigo" },
  { key: "transactions", label: "الحركات المالية", sub: "السجل المركزي للمعاملات", color: "cyan" },
  { key: "products", label: "الأصناف", sub: "بيانات المنتجات والمخزون", color: "orange" },
  { key: "customers", label: "العملاء", sub: "بيانات العملاء وأرصدتهم", color: "blue" },
];

function DataTab() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const toggleAll = () => {
    if (selected.size === DATA_GROUPS.length) setSelected(new Set());
    else setSelected(new Set(DATA_GROUPS.map(g => g.key)));
  };

  const toggle = (key: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  };

  const handleClear = async () => {
    if (confirmText !== "مسح البيانات") { toast({ title: 'اكتب "مسح البيانات" بالضبط للتأكيد', variant: "destructive" }); return; }
    if (selected.size === 0) { toast({ title: "اختر البيانات المطلوب مسحها", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch(api("/api/admin/clear"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `✅ تم مسح: ${Array.from(selected).length} جدول بنجاح` });
      setSelected(new Set()); setConfirmText("");
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "فشل المسح", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="إدارة البيانات" sub="مسح جداول محددة من قاعدة البيانات" />

      <div className="glass-panel rounded-2xl p-5 border border-red-500/20 bg-red-500/4 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-400 font-bold text-sm">تحذير: هذه العملية لا يمكن التراجع عنها</p>
        </div>

        {/* Select all */}
        <div className="flex justify-between items-center">
          <p className="text-white/50 text-sm">اختر البيانات المطلوب مسحها:</p>
          <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            {selected.size === DATA_GROUPS.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DATA_GROUPS.map(g => {
            const active = selected.has(g.key);
            return (
              <button key={g.key} onClick={() => toggle(g.key)}
                className={`p-3 rounded-xl text-right border transition-all ${active ? "bg-red-500/20 border-red-500/40" : "glass-panel border-white/8 hover:border-white/15"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${active ? "text-red-300" : "text-white/70"}`}>{g.label}</span>
                  {active ? <Check className="w-3.5 h-3.5 text-red-400" /> : <div className="w-3.5 h-3.5 rounded border border-white/20" />}
                </div>
                <p className="text-white/30 text-xs">{g.sub}</p>
              </button>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div>
            <label className="text-white/60 text-sm font-medium block mb-2">
              اكتب <span className="text-red-400 font-black">"مسح البيانات"</span> للتأكيد:
            </label>
            <input className="glass-input w-full text-white text-sm mb-3"
              placeholder="مسح البيانات" value={confirmText} onChange={e => setConfirmText(e.target.value)} />
            <button onClick={handleClear} disabled={loading || confirmText !== "مسح البيانات"}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 font-bold text-sm transition-all disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {loading ? "جاري المسح..." : `مسح ${selected.size} جدول`}
            </button>
          </div>
        )}
      </div>

      {/* Full system reset */}
      <FullResetSection />
    </div>
  );
}

function FullResetSection() {
  const resetDb = useResetDatabase();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [done, setDone] = useState(false);

  return (
    <div className="glass-panel rounded-2xl p-5 border border-red-500/30 space-y-4">
      <h4 className="font-bold text-red-400 text-sm">تصفير قاعدة البيانات الكاملة</h4>
      <p className="text-white/40 text-xs">يمسح جميع الفواتير والحركات المالية مع الاحتفاظ بالمنتجات والعملاء</p>
      {done && <p className="text-emerald-400 text-sm">✅ تم التصفير بنجاح</p>}
      <input className="glass-input w-full text-white text-sm" placeholder='اكتب "تأكيد الحذف"'
        value={confirmText} onChange={e => setConfirmText(e.target.value)} />
      <button
        disabled={confirmText !== "تأكيد الحذف" || resetDb.isPending}
        onClick={() => resetDb.mutate({ confirm: "تأكيد الحذف" }, {
          onSuccess: () => { queryClient.clear(); setDone(true); setConfirmText(""); toast({ title: "✅ تم التصفير" }); },
          onError: () => toast({ title: "فشل التصفير", variant: "destructive" }),
        })}
        className="flex items-center gap-2 px-5 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 font-bold text-sm transition-all disabled:opacity-40">
        {resetDb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
        تصفير الكل
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening Balance Tab
// ─────────────────────────────────────────────────────────────────────────────

type OBSubTab = "treasury" | "products" | "customers" | "suppliers";

const OB_SUB_TABS: { id: OBSubTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "treasury",  label: "الخزائن",   icon: Banknote },
  { id: "products",  label: "المنتجات",  icon: Package },
  { id: "customers", label: "العملاء",   icon: UserCircle },
  { id: "suppliers", label: "الموردون",  icon: Truck },
];

interface OBEntry {
  id: number;
  amount?: number;
  quantity?: number;
  unit_cost?: number;
  description?: string;
  customer_name?: string;
  safe_name?: string;
  product_name?: string;
  date?: string;
  created_at: string;
}

function useOBData(path: string) {
  const [data, setData] = useState<OBEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${BASE}/api${path}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload };
}

function OBEntryTable({ entries, loading, columns }: {
  entries: OBEntry[];
  loading: boolean;
  columns: { label: string; render: (e: OBEntry) => React.ReactNode }[];
}) {
  if (loading) return (
    <div className="p-8 text-center text-white/40 text-sm">
      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
      جاري التحميل...
    </div>
  );
  if (entries.length === 0) return (
    <div className="p-8 text-center text-white/30 text-sm">لا توجد قيود مسجلة</div>
  );
  return (
    <table className="w-full text-right text-sm">
      <thead className="bg-white/5 border-b border-white/10">
        <tr>
          {columns.map(c => (
            <th key={c.label} className="p-3 text-white/50 text-xs font-medium">{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map(e => (
          <tr key={e.id} className="border-b border-white/5 erp-table-row">
            {columns.map(c => (
              <td key={c.label} className="p-3 text-white/80 text-sm">{c.render(e)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Treasury sub-tab ──────────────────────────────────── */
function OBTreasuryTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/treasury");
  const { data: safes = [] } = useGetSettingsSafes();
  const { toast } = useToast();
  const [form, setForm] = useState({ safe_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.safe_id || !form.amount) { toast({ title: "الخزينة والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/opening-balance/treasury`, {
        method: "POST",
        body: JSON.stringify({ safe_id: parseInt(form.safe_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: "✅ تم تسجيل رصيد أول المدة للخزينة" });
      setForm(f => ({ ...f, safe_id: "", amount: "", notes: "" }));
      reload();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="رصيد أول المدة — الخزائن" sub="أضف الرصيد الافتتاحي لكل خزينة عند بداية تشغيل النظام" />

      {/* Form */}
      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <Banknote className="w-4 h-4" /> إضافة رصيد افتتاحي
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>الخزينة</Label>
            <select className="glass-input w-full text-white text-sm" value={form.safe_id} onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
              <option value="">— اختر الخزينة —</option>
              {(safes as any[]).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} (رصيد حالي: {Number(s.balance).toLocaleString("ar-EG")} ج.م)</option>
              ))}
            </select>
          </div>
          <div>
            <Label>المبلغ الافتتاحي (ج.م)</Label>
            <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <Label>تاريخ أول المدة</Label>
            <input type="date" className="glass-input w-full text-white text-sm" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <Label>ملاحظات (اختياري)</Label>
            <input className="glass-input w-full text-white text-sm" placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={saving}
          className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </button>
      </div>

      {/* Existing entries */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8">
          <h4 className="font-bold text-white/70 text-sm">القيود المسجلة ({entries.length})</h4>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "الخزينة", render: e => <span className="font-bold text-amber-400">{e.safe_name}</span> },
          { label: "المبلغ", render: e => <span className="text-emerald-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/50 text-xs">{e.date}</span> },
          { label: "البيان", render: e => <span className="text-white/40 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Products sub-tab ──────────────────────────────────── */
function OBProductsTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/product");
  const { data: products = [] } = useGetProducts();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ product_id: "", quantity: "", cost_price: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredProductIds = new Set(entries.map(e => e.id));
  const filteredProducts = (products as any[]).filter((p: any) =>
    !registeredProductIds.has(p.id) &&
    (p.name.includes(search) || (p.sku ?? "").includes(search))
  );

  const handleSelectProduct = (p: any) => {
    setForm(f => ({ ...f, product_id: String(p.id), cost_price: String(Number(p.cost_price)) }));
    setSearch(p.name);
  };

  const selectedProduct = (products as any[]).find((p: any) => String(p.id) === form.product_id);

  const handleSubmit = async () => {
    if (!form.product_id || !form.quantity || !form.cost_price) {
      toast({ title: "المنتج والكمية والتكلفة مطلوبة", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/inventory/opening-balance`, {
        method: "POST",
        body: JSON.stringify({
          product_id: parseInt(form.product_id),
          quantity: parseFloat(form.quantity),
          cost_price: parseFloat(form.cost_price),
          date: form.date,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedProduct?.name ?? "المنتج"}` });
      setForm(f => ({ ...f, product_id: "", quantity: "", cost_price: "", notes: "" }));
      setSearch("");
      reload();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="رصيد أول المدة — المنتجات" sub="أضف الكمية الافتتاحية وتكلفة الوحدة لكل منتج عند بدء تشغيل النظام" />

      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <Package className="w-4 h-4" /> إضافة رصيد مخزن افتتاحي
        </h4>
        {/* Product search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="relative">
            <Label>البحث عن منتج</Label>
            <input className="glass-input w-full text-white text-sm" placeholder="ابحث بالاسم أو الكود..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, product_id: "" })); }} />
            {search && !form.product_id && filteredProducts.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 glass-panel rounded-xl border border-white/10 max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 12).map((p: any) => (
                  <button key={p.id} onClick={() => handleSelectProduct(p)}
                    className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-white/40 font-mono shrink-0">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedProduct && (
              <p className="mt-1 text-emerald-400 text-xs">✓ {selectedProduct.name} — رصيد حالي: {Number(selectedProduct.quantity)} وحدة</p>
            )}
          </div>
          <div>
            <Label>الكمية الافتتاحية</Label>
            <input type="number" min="0.001" step="any" className="glass-input w-full text-white text-sm" placeholder="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div>
            <Label>تكلفة الوحدة (ج.م)</Label>
            <input type="number" min="0" step="0.01" className="glass-input w-full text-white text-sm" placeholder="0.00" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} />
          </div>
          <div>
            <Label>تاريخ أول المدة</Label>
            <input type="date" className="glass-input w-full text-white text-sm" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <Label>ملاحظات (اختياري)</Label>
            <input className="glass-input w-full text-white text-sm" placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <button onClick={handleSubmit} disabled={saving || !form.product_id}
              className="btn-primary w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm disabled:opacity-40">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              تسجيل
            </button>
          </div>
        </div>
        {form.product_id && form.quantity && form.cost_price && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-xs">
              سيُضاف <strong>{parseFloat(form.quantity) || 0}</strong> وحدة بتكلفة <strong>{parseFloat(form.cost_price) || 0} ج.م</strong> للمنتج
              {selectedProduct ? ` "${selectedProduct.name}"` : ""}
              — ويُحسب متوسط التكلفة المرجّح تلقائياً
            </p>
          </div>
        )}
      </div>

      {/* Registered entries */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex justify-between items-center">
          <h4 className="font-bold text-white/70 text-sm">أرصدة المنتجات المسجلة ({entries.length})</h4>
          <p className="text-white/30 text-xs">كل منتج يُسجل مرة واحدة فقط</p>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "المنتج", render: e => <span className="font-bold text-white">{e.product_name}</span> },
          { label: "الكمية", render: e => <span className="text-blue-400 font-mono">{Number(e.quantity).toLocaleString("ar-EG")}</span> },
          { label: "تكلفة الوحدة", render: e => <span className="text-amber-400 font-mono">{Number(e.unit_cost).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/50 text-xs">{e.date}</span> },
          { label: "البيان", render: e => <span className="text-white/40 text-xs">{e.notes ?? "رصيد أول المدة"}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Customers sub-tab ─────────────────────────────────── */
function OBCustomersTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/customer");
  const { data: customers = [] } = useGetCustomers();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ customer_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredIds = new Set(entries.map(e => e.id));
  const filteredCustomers = (customers as any[]).filter((c: any) =>
    !registeredIds.has(c.id) && c.name.includes(search)
  );
  const selectedCustomer = (customers as any[]).find((c: any) => String(c.id) === form.customer_id);

  const handleSelect = (c: any) => { setForm(f => ({ ...f, customer_id: String(c.id) })); setSearch(c.name); };

  const handleSubmit = async () => {
    if (!form.customer_id || !form.amount) { toast({ title: "العميل والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/opening-balance/customer`, {
        method: "POST",
        body: JSON.stringify({ customer_id: parseInt(form.customer_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedCustomer?.name ?? "العميل"}` });
      setForm(f => ({ ...f, customer_id: "", amount: "", notes: "" }));
      setSearch("");
      reload();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="رصيد أول المدة — العملاء" sub="سجّل الأرصدة المدينة للعملاء عند بدء تشغيل النظام" />

      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <UserCircle className="w-4 h-4" /> إضافة رصيد افتتاحي لعميل
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Label>العميل</Label>
            <input className="glass-input w-full text-white text-sm" placeholder="ابحث عن عميل..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, customer_id: "" })); }} />
            {search && !form.customer_id && filteredCustomers.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 glass-panel rounded-xl border border-white/10 max-h-48 overflow-y-auto">
                {filteredCustomers.slice(0, 10).map((c: any) => (
                  <button key={c.id} onClick={() => handleSelect(c)} className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {selectedCustomer && <p className="mt-1 text-emerald-400 text-xs">✓ {selectedCustomer.name}</p>}
          </div>
          <div>
            <Label>مبلغ الدين الافتتاحي (ج.م)</Label>
            <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <Label>تاريخ أول المدة</Label>
            <input type="date" className="glass-input w-full text-white text-sm" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <Label>ملاحظات (اختياري)</Label>
            <input className="glass-input w-full text-white text-sm" placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={saving || !form.customer_id}
          className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </button>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8">
          <h4 className="font-bold text-white/70 text-sm">أرصدة العملاء المسجلة ({entries.length})</h4>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "العميل", render: e => <span className="font-bold text-white">{e.customer_name}</span> },
          { label: "المبلغ", render: e => <span className="text-red-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/50 text-xs">{e.date}</span> },
          { label: "البيان", render: e => <span className="text-white/40 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Suppliers sub-tab ─────────────────────────────────── */
function OBSuppliersTab() {
  const { data: entries, loading, reload } = useOBData("/opening-balance/supplier");
  const { data: suppliers = [] } = useGetSuppliers();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ supplier_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredIds = new Set(entries.map(e => e.id));
  const filteredSuppliers = (suppliers as any[]).filter((s: any) =>
    !registeredIds.has(s.id) && s.name.includes(search)
  );
  const selectedSupplier = (suppliers as any[]).find((s: any) => String(s.id) === form.supplier_id);

  const handleSelect = (s: any) => { setForm(f => ({ ...f, supplier_id: String(s.id) })); setSearch(s.name); };

  const handleSubmit = async () => {
    if (!form.supplier_id || !form.amount) { toast({ title: "المورد والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/opening-balance/supplier`, {
        method: "POST",
        body: JSON.stringify({ supplier_id: parseInt(form.supplier_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedSupplier?.name ?? "المورد"}` });
      setForm(f => ({ ...f, supplier_id: "", amount: "", notes: "" }));
      setSearch("");
      reload();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="رصيد أول المدة — الموردون" sub="سجّل الأرصدة المستحقة للموردين عند بدء تشغيل النظام" />

      <div className="glass-panel rounded-3xl p-6 border border-amber-500/20 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <Truck className="w-4 h-4" /> إضافة رصيد افتتاحي لمورد
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Label>المورد</Label>
            <input className="glass-input w-full text-white text-sm" placeholder="ابحث عن مورد..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, supplier_id: "" })); }} />
            {search && !form.supplier_id && filteredSuppliers.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 glass-panel rounded-xl border border-white/10 max-h-48 overflow-y-auto">
                {filteredSuppliers.slice(0, 10).map((s: any) => (
                  <button key={s.id} onClick={() => handleSelect(s)} className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {selectedSupplier && <p className="mt-1 text-emerald-400 text-xs">✓ {selectedSupplier.name}</p>}
          </div>
          <div>
            <Label>مبلغ الرصيد المستحق (ج.م)</Label>
            <input type="number" min="0.01" step="0.01" className="glass-input w-full text-white text-sm" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <Label>تاريخ أول المدة</Label>
            <input type="date" className="glass-input w-full text-white text-sm" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <Label>ملاحظات (اختياري)</Label>
            <input className="glass-input w-full text-white text-sm" placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={saving || !form.supplier_id}
          className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </button>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8">
          <h4 className="font-bold text-white/70 text-sm">أرصدة الموردين المسجلة ({entries.length})</h4>
        </div>
        <OBEntryTable entries={entries} loading={loading} columns={[
          { label: "المورد", render: e => <span className="font-bold text-white">{e.description?.split("—")[1]?.trim() ?? `مورد #${e.id}`}</span> },
          { label: "المبلغ", render: e => <span className="text-orange-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/50 text-xs">{e.date}</span> },
          { label: "البيان", render: e => <span className="text-white/40 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ── Main OpeningBalanceTab ─────────────────────────────── */
function OpeningBalanceTab() {
  const [subTab, setSubTab] = useState<OBSubTab>("treasury");

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
        <BookOpen className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-300 font-bold text-sm">قيود أول المدة</p>
          <p className="text-blue-300/60 text-xs mt-0.5">
            سجّل هنا الأرصدة الافتتاحية عند بدء استخدام النظام لأول مرة.
            قيود الخزائن والعملاء والموردين تُضاف للأرصدة الحالية مباشرة.
            قيود المنتجات تُسجَّل مرة واحدة فقط لكل منتج وتُحسب التكلفة المرجّحة تلقائياً.
          </p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 glass-panel rounded-2xl p-1.5 border border-white/5">
        {OB_SUB_TABS.map(t => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-1 justify-center
                ${active ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-white/40 hover:text-white hover:bg-white/5"}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div>
        {subTab === "treasury"  && <OBTreasuryTab />}
        {subTab === "products"  && <OBProductsTab />}
        {subTab === "customers" && <OBCustomersTab />}
        {subTab === "suppliers" && <OBSuppliersTab />}
      </div>
    </div>
  );
}
