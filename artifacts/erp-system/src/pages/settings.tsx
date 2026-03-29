import { useState, useRef, useCallback } from "react";
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
  useAppSettings, CURRENCIES, FONTS, ACCENT_COLORS, FONT_SIZES, LOGIN_BG_OPTIONS,
  type CurrencyCode, type FontFamily, type AccentColor, type FontSize,
} from "@/contexts/app-settings";
import {
  Users, Landmark, Warehouse, AlertTriangle, Plus, Trash2, Edit2, X, Check,
  ArrowLeftRight, Eye, EyeOff, Save, Palette, DollarSign, Package, Database,
  Upload, Download, RefreshCcw, Building2, Image, Type, Loader2, CheckCircle2,
} from "lucide-react";
import * as XLSX from "xlsx";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

type Tab = "users" | "safes" | "warehouses" | "appearance" | "currency" | "products" | "data";

const TABS: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "users",      label: "المستخدمون",  icon: Users },
  { id: "safes",      label: "الخزائن",     icon: Landmark },
  { id: "warehouses", label: "المخازن",     icon: Warehouse },
  { id: "appearance", label: "الواجهة",     icon: Palette },
  { id: "currency",   label: "العملة",      icon: DollarSign },
  { id: "products",   label: "الأصناف",     icon: Package },
  { id: "data",       label: "البيانات",    icon: Database },
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
        {tab === "appearance" && <AppearanceTab />}
        {tab === "currency" && <CurrencyTab />}
        {tab === "products" && <ProductsTab />}
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
function CurrencyTab() {
  const { settings, update } = useAppSettings();
  const { toast } = useToast();

  return (
    <div className="space-y-5">
      <SectionHeader title="إعداد العملة" sub="اختر العملة المستخدمة في جميع الفواتير والتقارير" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(Object.keys(CURRENCIES) as CurrencyCode[]).map(code => {
          const c = CURRENCIES[code];
          const isActive = settings.currency === code;
          return (
            <button key={code}
              onClick={() => { update({ currency: code }); toast({ title: `تم تغيير العملة إلى ${c.label}` }); window.location.reload(); }}
              className={`glass-panel rounded-2xl p-5 text-right border transition-all hover:-translate-y-0.5 ${isActive ? "border-amber-500/40 bg-amber-500/10" : "border-white/8 hover:border-white/20"}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-3xl font-black text-white/80">{c.symbol}</span>
                {isActive && <CheckCircle2 className="w-5 h-5 text-amber-400" />}
              </div>
              <p className={`font-bold text-base ${isActive ? "text-amber-400" : "text-white"}`}>{c.label}</p>
              <p className="text-white/30 text-xs mt-0.5">{code}</p>
              <p className="text-white/20 text-xs mt-2">{formatCurrency(1234.5)}</p>
            </button>
          );
        })}
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/5">
        <p className="text-white/40 text-sm">العملة الحالية: <span className="text-amber-400 font-bold">{CURRENCIES[settings.currency].label} — {CURRENCIES[settings.currency].symbol}</span></p>
        <p className="text-white/25 text-xs mt-1">سيتم تغيير العملة في جميع الشاشات والتقارير والفواتير</p>
      </div>
    </div>
  );
}

/* ─── Products Excel Tab ─── */
function ProductsTab() {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res = await fetch(api("/api/products"));
      const products = await res.json();
      const rows = products.map((p: any) => ({
        "اسم الصنف": p.name,
        "كود الصنف (SKU)": p.sku || "",
        "التصنيف": p.category || "",
        "الكمية": Number(p.quantity),
        "سعر التكلفة": Number(p.cost_price),
        "سعر البيع": Number(p.sale_price),
        "حد التنبيه": p.low_stock_threshold || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
      XLSX.writeFile(wb, `halal-tech-products-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: `تم تصدير ${products.length} صنف بنجاح` });
    } catch {
      toast({ title: "فشل التصدير", variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];

      let success = 0, failed = 0;
      for (const row of rows) {
        const name = row["اسم الصنف"] || row["name"] || row["Name"];
        if (!name) { failed++; continue; }
        try {
          const res = await fetch(api("/api/products"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: String(name),
              sku: String(row["كود الصنف (SKU)"] || row["sku"] || ""),
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
      setImportResult({ success, failed });
      toast({ title: `تم الاستيراد: ${success} صنف ✓، ${failed} فشل` });
    } catch {
      toast({ title: "فشل قراءة الملف", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const rows = [
      { "اسم الصنف": "شاشة LCD", "كود الصنف (SKU)": "SCR001", "التصنيف": "قطع غيار", "الكمية": 10, "سعر التكلفة": 150, "سعر البيع": 200, "حد التنبيه": 5 },
      { "اسم الصنف": "بطارية أيفون", "كود الصنف (SKU)": "BAT002", "التصنيف": "بطاريات", "الكمية": 20, "سعر التكلفة": 80, "سعر البيع": 120, "حد التنبيه": 3 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
    XLSX.writeFile(wb, "template-products.xlsx");
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="الأصناف والمنتجات" sub="تصدير واستيراد الأصناف عبر Excel" />

      {/* Export */}
      <div className="glass-panel rounded-2xl p-5 border border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Download className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h4 className="font-bold text-emerald-400 text-sm">تصدير الأصناف</h4>
            <p className="text-white/40 text-xs">تحميل جميع الأصناف كملف Excel</p>
          </div>
        </div>
        <button onClick={handleExport} disabled={exportLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold text-sm transition-all disabled:opacity-40">
          {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exportLoading ? "جاري التصدير..." : "تصدير Excel"}
        </button>
      </div>

      {/* Import */}
      <div className="glass-panel rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Upload className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h4 className="font-bold text-amber-400 text-sm">استيراد الأصناف</h4>
            <p className="text-white/40 text-xs">رفع ملف Excel لإضافة الأصناف دفعةً واحدة</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl text-amber-400 font-bold text-sm transition-all disabled:opacity-40">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? "جاري الاستيراد..." : "رفع ملف Excel"}
          </button>
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2.5 glass-panel border border-white/10 hover:border-white/20 rounded-xl text-white/60 hover:text-white text-sm transition-all">
            <Download className="w-4 h-4" /> تحميل نموذج فارغ
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />

        {importResult && (
          <div className={`mt-3 p-3 rounded-xl border text-sm ${importResult.failed === 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
            <CheckCircle2 className="w-4 h-4 inline ml-2" />
            تم استيراد <strong>{importResult.success}</strong> صنف بنجاح
            {importResult.failed > 0 && <span className="text-red-400"> — فشل: {importResult.failed}</span>}
          </div>
        )}

        <div className="mt-3 p-3 rounded-xl bg-white/3 border border-white/5 text-xs text-white/30 space-y-0.5">
          <p>الأعمدة المطلوبة: <span className="text-white/50">اسم الصنف، كود الصنف (SKU)، التصنيف، الكمية، سعر التكلفة، سعر البيع، حد التنبيه</span></p>
          <p>الصيغ المدعومة: xlsx, xls, csv</p>
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
