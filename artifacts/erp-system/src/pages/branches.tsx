import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  Plus, Pencil, Trash2, GitBranch, MapPin, Phone,
  CheckCircle2, XCircle, Building2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

interface Branch {
  id:         number;
  company_id: number;
  name:       string;
  address:    string | null;
  phone:      string | null;
  is_active:  boolean;
  created_at: string;
}

const EMPTY_FORM = { name: "", address: "", phone: "", is_active: true };

export default function Branches() {
  const { user } = useAuth();
  const qc       = useQueryClient();
  const { toast } = useToast();
  const isAdmin   = user?.role === "admin";

  const [showForm,    setShowForm]    = useState(false);
  const [editId,      setEditId]      = useState<number | null>(null);
  const [deleteId,    setDeleteId]    = useState<number | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);

  /* ── Queries ─────────────────────────────────────────────── */
  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    queryFn:  () => authFetch(api("/api/branches")).then(r => {
      if (!r.ok) throw new Error("خطأ في جلب الفروع");
      return r.json();
    }),
  });

  /* ── Mutations ───────────────────────────────────────────── */
  const createMutation = useMutation({
    mutationFn: async (body: { name: string; address?: string; phone?: string; is_active: boolean }) => {
      const r = await authFetch(api("/api/branches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "تم إنشاء الفرع بنجاح" });
      qc.invalidateQueries({ queryKey: ["/api/branches"] });
      resetForm();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<typeof EMPTY_FORM> }) => {
      const r = await authFetch(api(`/api/branches/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "تم تحديث الفرع بنجاح" });
      qc.invalidateQueries({ queryKey: ["/api/branches"] });
      resetForm();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(api(`/api/branches/${id}`), { method: "DELETE" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "خطأ"); }
    },
    onSuccess: () => {
      toast({ title: "تم حذف الفرع" });
      qc.invalidateQueries({ queryKey: ["/api/branches"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  /* ── Helpers ─────────────────────────────────────────────── */
  function resetForm() {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditId(null);
  }

  function startEdit(b: Branch) {
    setForm({ name: b.name, address: b.address ?? "", phone: b.phone ?? "", is_active: b.is_active });
    setEditId(b.id);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: "اسم الفرع مطلوب", variant: "destructive" }); return; }
    const body = { name: form.name.trim(), address: form.address.trim() || undefined, phone: form.phone.trim() || undefined, is_active: form.is_active };
    if (editId !== null) {
      updateMutation.mutate({ id: editId, body });
    } else {
      createMutation.mutate({ ...body, is_active: true });
    }
  }

  const activeBranches   = branches.filter(b => b.is_active).length;
  const inactiveBranches = branches.length - activeBranches;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">إدارة الفروع</h1>
            <p className="text-xs text-white/40 mt-0.5">إنشاء وإدارة فروع الشركة</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            فرع جديد
          </button>
        )}
      </div>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "إجمالي الفروع",  value: branches.length,  icon: Building2,    color: "#F59E0B" },
          { label: "فروع نشطة",       value: activeBranches,   icon: CheckCircle2, color: "#10B981" },
          { label: "فروع موقوفة",     value: inactiveBranches, icon: XCircle,      color: "#EF4444" },
        ].map(s => (
          <div key={s.label}
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            className="rounded-xl p-4 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: s.color + "1A" }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-white/40">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Form ───────────────────────────────────────────── */}
      {showForm && isAdmin && (
        <div
          style={{ background: "rgba(26,32,53,0.95)", border: "1px solid rgba(245,158,11,0.25)" }}
          className="rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">
              {editId !== null ? "تعديل الفرع" : "فرع جديد"}
            </h2>
            <button onClick={resetForm} className="text-white/40 hover:text-white/70 transition-colors text-sm">إلغاء</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5">اسم الفرع *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: الفرع الرئيسي"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">العنوان</label>
                <input
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="عنوان الفرع"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">رقم الهاتف</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="رقم هاتف الفرع"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>
            </div>
            {editId !== null && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-white/70">حالة الفرع:</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-amber-500" : "bg-white/15"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? "-translate-x-6" : "-translate-x-1"}`} />
                </button>
                <span className="text-sm text-white/50">{form.is_active ? "نشط" : "موقوف"}</span>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={resetForm}
                className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors">
                إلغاء
              </button>
              <button type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
                {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : editId !== null ? "حفظ التعديلات" : "إنشاء الفرع"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────── */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }} className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : branches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <GitBranch className="w-12 h-12 text-white/10 mb-3" />
            <p className="text-white/40 font-medium">لا توجد فروع بعد</p>
            {isAdmin && (
              <button onClick={() => setShowForm(true)}
                className="mt-4 text-sm text-amber-400 hover:text-amber-300 transition-colors">
                أضف أول فرع
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["الفرع", "العنوان", "الهاتف", "الحالة", "تاريخ الإنشاء", isAdmin ? "إجراءات" : ""].map(h => (
                  <th key={h} className="py-3 px-4 text-right text-xs font-medium text-white/40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map((b, i) => (
                <tr key={b.id}
                  style={{ borderBottom: i < branches.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                  className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-amber-400" />
                      </div>
                      <span className="font-medium text-white">{b.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {b.address ? (
                      <div className="flex items-center gap-1.5 text-white/60">
                        <MapPin className="w-3.5 h-3.5 text-white/30" />
                        {b.address}
                      </div>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {b.phone ? (
                      <div className="flex items-center gap-1.5 text-white/60">
                        <Phone className="w-3.5 h-3.5 text-white/30" />
                        {b.phone}
                      </div>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                      style={{
                        background: b.is_active ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        color:      b.is_active ? "#10B981" : "#EF4444",
                        border:     `1px solid ${b.is_active ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                      }}
                    >
                      {b.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {b.is_active ? "نشط" : "موقوف"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-white/40 text-xs">
                    {new Date(b.created_at).toLocaleDateString("ar-EG")}
                  </td>
                  {isAdmin && (
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(b)}
                          className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-amber-400 transition-colors"
                          title="تعديل"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(b.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Delete Confirm ──────────────────────────────────── */}
      {deleteId !== null && (
        <ConfirmModal
          title="حذف الفرع"
          description="هل أنت متأكد من حذف هذا الفرع؟ لا يمكن التراجع عن هذا الإجراء."
          confirmLabel="حذف"
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
