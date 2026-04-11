import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { safeArray } from "@/lib/safe-data";
import {
  useGetSettingsUsers, useCreateSettingsUser, useUpdateSettingsUser, useDeleteSettingsUser,
  useGetSettingsSafes, useGetSettingsWarehouses,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Trash2, Edit2, Eye, EyeOff, Save, Loader2, Search, RotateCcw,
} from "lucide-react";
import {
  PageHeader, CardSkeleton, Modal, FieldLabel, SInput, SSelect,
  PrimaryBtn, DangerBtn, GhostBtn, PermissionGroupCard,
} from "./_shared";
import {
  ROLES, PERMISSION_GROUPS, PERMISSION_TEMPLATES, TEMPLATE_LABELS,
} from "./_constants";

function getInitials(name: string) {
  const p = name.trim().split(" ");
  if (p.length >= 2) return p[0][0] + p[1][0];
  return name.slice(0, 2);
}

export default function UsersTab() {
  const { data: usersRaw, isLoading } = useGetSettingsUsers();
  const users = safeArray(usersRaw);
  const { data: warehousesRaw } = useGetSettingsWarehouses();
  const warehouses = safeArray(warehousesRaw);
  const { data: safesRaw } = useGetSettingsSafes();
  const safes = safeArray(safesRaw);
  const createUser = useCreateSettingsUser();
  const updateUser = useUpdateSettingsUser();
  const deleteUser = useDeleteSettingsUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm,      setShowForm]      = useState(false);
  const [editId,        setEditId]        = useState<number | null>(null);
  const [showPin,       setShowPin]       = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<{ id: number; name: string } | null>(null);
  const [permSearch,    setPermSearch]    = useState("");

  const [form, setForm] = useState({
    name: "", username: "", pin: "0000", role: "cashier",
    permissions: {} as Record<string, boolean>,
    warehouse_id: "" as string,
    safe_id: "" as string,
    active: true,
  });

  const resetForm = () => {
    setForm({ name: "", username: "", pin: "0000", role: "cashier", permissions: {}, warehouse_id: "", safe_id: "", active: true });
    setEditId(null); setShowForm(false); setShowPin(false); setPermSearch("");
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.username.trim()) {
      toast({ title: "الاسم واسم المستخدم مطلوبان", variant: "destructive" }); return;
    }
    if ((form.role === "cashier" || form.role === "salesperson") && !form.warehouse_id) {
      toast({ title: "اختر المخزن أولاً", variant: "destructive" }); return;
    }
    if ((form.role === "cashier" || form.role === "salesperson") && !form.safe_id) {
      toast({ title: "اختر الخزنة أولاً", variant: "destructive" }); return;
    }
    const payload = {
      name: form.name, username: form.username, pin: form.pin,
      role: form.role, permissions: JSON.stringify(form.permissions),
      warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null,
      safe_id: form.safe_id ? Number(form.safe_id) : null,
      active: form.active,
    };
    if (editId) {
      updateUser.mutate({ id: editId, body: payload }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم تعديل المستخدم" }); resetForm(); },
        onError: (e: any) => toast({ title: e?.message || "فشل التعديل", variant: "destructive" }),
      });
    } else {
      createUser.mutate(payload as any, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم إضافة المستخدم" }); resetForm(); },
        onError: (e: any) => toast({ title: e?.message || "فشل الإضافة", variant: "destructive" }),
      });
    }
  };

  const handleEdit = (u: any) => {
    let perms: Record<string, boolean> = {};
    try { perms = JSON.parse(u.permissions || "{}"); } catch {}
    setForm({
      name: u.name, username: u.username, pin: u.pin || "0000", role: u.role, permissions: perms,
      warehouse_id: u.warehouse_id ? String(u.warehouse_id) : "",
      safe_id: u.safe_id ? String(u.safe_id) : "",
      active: u.active !== false,
    });
    setEditId(u.id); setShowForm(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteUser.mutate(deleteTarget.id, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] }); toast({ title: "تم حذف المستخدم" }); setDeleteTarget(null); },
      onError: () => toast({ title: "فشل الحذف", variant: "destructive" }),
    });
  };

  const pinStrength = (pin: string) => {
    if (pin.length < 4)  return { w: "25%", color: "bg-red-500",    label: "ضعيف جداً (4 أحرف على الأقل)" };
    if (pin.length < 6)  return { w: "50%", color: "bg-amber-500",  label: "مقبول" };
    if (pin.length < 8)  return { w: "75%", color: "bg-blue-500",   label: "جيد" };
    return                      { w: "100%",color: "bg-emerald-500", label: "قوي" };
  };
  const ps = pinStrength(form.pin);

  return (
    <div>
      <PageHeader
        title="إدارة المستخدمين"
        sub="التحكم في حسابات المستخدمين وصلاحياتهم"
        action={
          <PrimaryBtn onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> إضافة مستخدم
          </PrimaryBtn>
        }
      />

      {/* User Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/40 font-semibold">لا يوجد مستخدمون</p>
          <p className="text-white/20 text-sm mt-1">أضف أول مستخدم للنظام</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u: any) => {
            const role = ROLES[u.role] ?? ROLES.cashier;
            return (
              <div
                key={u.id}
                className="group bg-[#111827] border border-white/5 hover:border-amber-500/20 rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${role.avatarBg} flex items-center justify-center shrink-0`}>
                    <span className={`font-black text-lg ${role.avatarText}`}>{getInitials(u.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{u.name}</p>
                    <p className="text-white/40 text-xs font-mono mt-0.5">@{u.username}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${role.badge}`}>
                    {role.label}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                    u.active
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {u.active ? "نشط" : "موقوف"}
                  </span>
                  {(() => {
                    let perms: Record<string, boolean> = {};
                    try { perms = JSON.parse(u.permissions || "{}"); } catch {}
                    const count = Object.values(perms).filter(Boolean).length;
                    return count > 0 ? (
                      <span className="px-2 py-1 rounded-lg text-[11px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20">
                        ⚙ {count} مخصصة
                      </span>
                    ) : null;
                  })()}
                </div>

                <div className="flex gap-2 pt-3 border-t border-white/5">
                  <button
                    onClick={() => handleEdit(u)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> تعديل
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editId ? "تعديل مستخدم" : "إضافة مستخدم جديد"} icon={Users} onClose={resetForm} maxWidth="max-w-xl">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>الاسم الكامل</FieldLabel>
                <SInput placeholder="أحمد محمد" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>اسم المستخدم</FieldLabel>
                <SInput placeholder="ahmed" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>رقم سري (PIN)</FieldLabel>
                <div className="relative">
                  <SInput
                    type={showPin ? "text" : "password"}
                    placeholder="أدخل الرقم السري"
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
                  />
                  <button className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors" onClick={() => setShowPin(s => !s)}>
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${ps.color}`} style={{ width: ps.w }} />
                  </div>
                  <p className="text-[11px] text-white/30">قوة الرقم السري: <span className="text-white/60 font-semibold">{ps.label}</span></p>
                </div>
              </div>
              <div>
                <FieldLabel>الدور</FieldLabel>
                <SSelect value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="admin">مدير النظام</option>
                  <option value="manager">مشرف</option>
                  <option value="cashier">كاشير</option>
                  <option value="salesperson">مندوب مبيعات</option>
                </SSelect>
              </div>
              <div>
                <FieldLabel>
                  المخزن {(form.role === "cashier" || form.role === "salesperson") && <span className="text-red-400 mr-0.5">*</span>}
                </FieldLabel>
                <SSelect value={form.warehouse_id} onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}>
                  <option value="">اختر المخزن</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </SSelect>
              </div>
              <div>
                <FieldLabel>
                  الخزنة {(form.role === "cashier" || form.role === "salesperson") && <span className="text-red-400 mr-0.5">*</span>}
                </FieldLabel>
                <SSelect value={form.safe_id} onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
                  <option value="">اختر الخزنة</option>
                  {safes.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </SSelect>
              </div>
            </div>

            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div>
                <p className="text-white/80 text-sm font-semibold">المستخدم نشط</p>
                <p className="text-white/35 text-[11px]">{form.active ? "يمكنه تسجيل الدخول" : "لا يمكنه تسجيل الدخول"}</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${form.active ? "bg-emerald-500" : "bg-white/15"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${form.active ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <FieldLabel>نوع المستخدم</FieldLabel>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SSelect
                      value=""
                      onChange={e => {
                        const tpl = PERMISSION_TEMPLATES[e.target.value];
                        if (tpl) setForm(f => ({ ...f, permissions: { ...tpl } }));
                      }}
                    >
                      <option value="" disabled>اختر قالباً لملء الصلاحيات تلقائياً...</option>
                      {TEMPLATE_LABELS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </SSelect>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const tpl = PERMISSION_TEMPLATES[form.role];
                      if (tpl) setForm(f => ({ ...f, permissions: { ...tpl } }));
                    }}
                    title="إعادة تعيين للصلاحيات الافتراضية بناءً على الدور"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:border-white/25 transition-all text-xs whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    إعادة تعيين
                  </button>
                </div>
                <p className="text-[10px] text-white/25 mt-1.5">يملأ مربعات الصلاحيات تلقائياً — يمكنك التعديل بعدها يدوياً</p>
              </div>

              <div>
                <FieldLabel>الصلاحيات</FieldLabel>
                <div className="relative mb-3">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--erp-text-4)" }} />
                  <SInput
                    placeholder="ابحث في الصلاحيات..."
                    value={permSearch}
                    onChange={e => setPermSearch(e.target.value)}
                    className="pr-9 text-xs"
                  />
                </div>
                {(() => {
                  const filtered = permSearch.trim()
                    ? PERMISSION_GROUPS.map(g => ({
                        ...g,
                        permissions: g.permissions.filter(p => p.label.includes(permSearch.trim())),
                      })).filter(g => g.permissions.length > 0)
                    : PERMISSION_GROUPS;
                  return filtered.length === 0 ? (
                    <p className="text-center py-4 text-xs" style={{ color: "var(--erp-text-4)" }}>لا توجد صلاحيات مطابقة</p>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map(group => (
                        <PermissionGroupCard
                          key={group.key}
                          group={group}
                          permissions={form.permissions}
                          onChange={(key, val) =>
                            setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: val } }))
                          }
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-white/8 shrink-0">
            <PrimaryBtn onClick={handleSubmit} className="flex-1" disabled={createUser.isPending || updateUser.isPending}>
              {(createUser.isPending || updateUser.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editId ? "حفظ التعديلات" : "إضافة المستخدم"}
            </PrimaryBtn>
            <GhostBtn onClick={resetForm} className="flex-1">إلغاء</GhostBtn>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal title="تأكيد الحذف" icon={Trash2} onClose={() => setDeleteTarget(null)}>
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-white font-bold">هل تريد حذف هذا المستخدم؟</p>
              <p className="text-white/40 text-sm mt-1">سيتم حذف <span className="text-white font-semibold">{deleteTarget.name}</span> نهائياً</p>
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-white/8">
            <DangerBtn onClick={confirmDelete} className="flex-1" disabled={deleteUser.isPending}>
              {deleteUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              تأكيد الحذف
            </DangerBtn>
            <GhostBtn onClick={() => setDeleteTarget(null)} className="flex-1">إلغاء</GhostBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}
