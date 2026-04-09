/**
 * Super Admin Dashboard — manage all SaaS companies + super_admin accounts
 * Only accessible to users with role = "super_admin"
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

/* ── Types ───────────────────────────────────────── */
interface BackupFile {
  filename:   string;
  size_mb:    string;
  created_at: string;
}
interface Company {
  id: number; name: string; plan_type: string;
  start_date: string; end_date: string; is_active: boolean;
  admin_email: string | null; daysRemaining: number;
  status: "active" | "trial" | "expired" | "suspended";
  userCount: number; created_at: string;
}
interface Stats {
  total: number; active: number; trial: number;
  expired: number; suspended: number; totalUsers: number;
}
interface Manager {
  id: number; name: string; username: string;
  email: string | null; active: boolean | null;
  last_login: string | null; created_at: string;
}

/* ── Constants ───────────────────────────────────── */
const STATUS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  active:    { bg: "rgba(34,197,94,0.12)",  text: "#22C55E", border: "rgba(34,197,94,0.3)",  label: "نشط"    },
  trial:     { bg: "rgba(249,115,22,0.12)", text: "#F97316", border: "rgba(249,115,22,0.3)", label: "تجريبي" },
  expired:   { bg: "rgba(239,68,68,0.12)",  text: "#EF4444", border: "rgba(239,68,68,0.3)",  label: "منتهي"  },
  suspended: { bg: "rgba(148,163,184,0.1)", text: "#94A3B8", border: "rgba(148,163,184,0.2)",label: "موقوف"  },
};
const PLAN_LABELS: Record<string, string> = {
  trial: "تجريبي", basic: "أساسي", professional: "احترافي", pro: "احترافي", paid: "مدفوع",
};
const translatePlan = (p: string) => PLAN_LABELS[p] ?? p;

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const C = {
  bg: "#0F172A", card: "#1E293B", border: "#334155",
  orange: "#F97316", orangeDim: "rgba(249,115,22,0.15)",
  text: "#F8FAFC", muted: "#94A3B8",
  success: "#22C55E", danger: "#EF4444", warning: "#F59E0B", blue: "#3B82F6",
};
const PER_PAGE = 10;
const FONT = "'Tajawal','Cairo',sans-serif";

/* ── Animated counter ───────────────────────────── */
function AnimatedNumber({ target }: { target: number | string }) {
  const [display, setDisplay] = useState<number | string>(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (typeof target !== "number") { setDisplay(target); return; }
    const duration = 700; const startTime = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target]);
  return <>{display}</>;
}

/* ── Toast ──────────────────────────────────────── */
function Toast({ msg, type = "success" }: { msg: string; type?: "success" | "error" }) {
  const isErr = type === "error";
  return (
    <div style={{
      position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
      background: isErr ? "#2e1a1a" : "#1a2e1a",
      border: `1px solid ${isErr ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
      borderRadius: "12px", padding: "12px 24px",
      fontSize: "14px", fontWeight: 700, color: isErr ? C.danger : C.success,
      zIndex: 3000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      animation: "sa-fade-in 0.3s ease", fontFamily: FONT,
    }}>
      {isErr ? "⚠️" : "✅"} {msg}
    </div>
  );
}

/* ── Generic dark input ─────────────────────────── */
function DarkInput({ label, value, onChange, placeholder, type = "text", required = false, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean; hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "5px" }}>
        {label}{required && <span style={{ color: C.danger }}> *</span>}
      </label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "10px 14px", borderRadius: "10px",
          border: `1.5px solid ${focused ? C.orange : C.border}`,
          background: C.bg, color: C.text,
          fontSize: "14px", fontFamily: FONT, outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <div style={{ fontSize: "11px", color: C.muted, marginTop: "4px" }}>{hint}</div>}
    </div>
  );
}

/* ── Modal shell ────────────────────────────────── */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div dir="rtl" style={{
        background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`,
        padding: "28px", maxWidth: "460px", width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)", fontFamily: FONT,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" }}>
          <h3 style={{ fontSize: "17px", fontWeight: 900, color: C.orange, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: "20px", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Confirm Delete Modal ───────────────────────── */
function ConfirmDeleteModal({ title, body, onConfirm, onCancel, loading, error }: {
  title: string; body: React.ReactNode; onConfirm: () => void; onCancel: () => void;
  loading: boolean; error: string;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1100,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      <div dir="rtl" style={{
        background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`,
        padding: "32px", maxWidth: "420px", width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)", fontFamily: FONT,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0,
          }}>🗑️</div>
          <h3 style={{ fontSize: "18px", fontWeight: 900, color: C.text, margin: 0 }}>{title}</h3>
        </div>
        <div style={{ fontSize: "14px", color: C.muted, lineHeight: 1.8, marginBottom: "20px" }}>{body}</div>
        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: "10px", marginBottom: "16px",
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            fontSize: "13px", color: C.danger,
          }}>⚠️ {error}</div>
        )}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onConfirm} disabled={loading}
            style={{
              flex: 1, padding: "12px", borderRadius: "10px", border: "none",
              background: loading ? "#6b2020" : C.danger, color: "#fff",
              fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: FONT, opacity: loading ? 0.7 : 1,
            }}>
            {loading ? "جاري الحذف..." : "نعم، احذف"}
          </button>
          <button onClick={onCancel} disabled={loading}
            style={{
              flex: 1, padding: "12px", borderRadius: "10px",
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.muted, fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            }}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ActionBtn ──────────────────────────────────── */
function ActionBtn({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex", alignItems: "center", gap: "5px",
        padding: "8px 14px", borderRadius: "10px",
        border: `1.5px solid ${color}44`, background: `${color}18`, color,
        fontSize: "13px", fontWeight: 700, cursor: "pointer",
        transition: "all 0.15s", fontFamily: FONT,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}30`; e.currentTarget.style.borderColor = `${color}88`; }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}18`; e.currentTarget.style.borderColor = `${color}44`; }}
    >
      {icon && <span>{icon}</span>}<span>{label}</span>
    </button>
  );
}

/* ── PageBtn ────────────────────────────────────── */
function PageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
        cursor: disabled ? "default" : "pointer", fontFamily: FONT,
        border: `1px solid ${disabled ? "rgba(51,65,85,0.4)" : C.border}`,
        background: "transparent",
        color: disabled ? "rgba(148,163,184,0.3)" : C.muted,
        transition: "all 0.15s",
      }}>
      {label}
    </button>
  );
}

/* ══════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════ */
export default function SuperAdmin() {
  const { user, token, logout } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  /* ── Tab ─── */
  const [activeTab, setActiveTab] = useState<"companies" | "managers" | "settings" | "backups">("companies");

  /* ── Companies state ─── */
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [extendDays,   setExtendDays]   = useState<Record<number, number>>({});
  const [showCreate,   setShowCreate]   = useState(false);
  const [newName,      setNewName]      = useState("");
  const [newPlan,      setNewPlan]      = useState("trial");
  const [newDays,      setNewDays]      = useState(14);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,         setPage]         = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteCoErr,  setDeleteCoErr]  = useState("");

  /* ── Managers state ─── */
  const [showAddMgr,   setShowAddMgr]   = useState(false);
  const [editMgr,      setEditMgr]      = useState<Manager | null>(null);
  const [deleteMgr,    setDeleteMgr]    = useState<Manager | null>(null);
  const [deleteMgrErr, setDeleteMgrErr] = useState("");

  /* Add form */
  const [mgName,   setMgName]   = useState("");
  const [mgUser,   setMgUser]   = useState("");
  const [mgPin,    setMgPin]    = useState("");
  const [mgPin2,   setMgPin2]   = useState("");
  const [mgErr,    setMgErr]    = useState("");

  /* Edit form */
  const [eName,    setEName]    = useState("");
  const [eUser,    setEUser]    = useState("");
  const [ePin,     setEPin]     = useState("");
  const [ePin2,    setEPin2]    = useState("");
  const [eErr,     setEErr]     = useState("");

  /* ── Support settings state ─── */
  const [supportWa,    setSupportWa]    = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [settingSaving, setSettingSaving] = useState(false);

  /* ── Toast ─── */
  const [toast,    setToast]    = useState<{ msg: string; type?: "success" | "error" } | null>(null);

  if (user?.role !== "super_admin") { setLocation("/"); return null; }

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetcher = useCallback((url: string) =>
    fetch(api(url), { headers: authHeaders(token ?? "") }).then(r => {
      if (!r.ok) throw new Error("فشل جلب البيانات");
      return r.json();
    }), [token]);

  /* ── Queries ─── */
  const { data: stats }              = useQuery<Stats>({ queryKey: ["/api/super/stats"], queryFn: () => fetcher("/api/super/stats"), staleTime: 30_000 });
  const { data: companies = [], isLoading: coLoading } = useQuery<Company[]>({ queryKey: ["/api/super/companies"], queryFn: () => fetcher("/api/super/companies"), staleTime: 30_000 });
  const { data: managers  = [], isLoading: mgLoading } = useQuery<Manager[]>({ queryKey: ["/api/super/managers"], queryFn: () => fetcher("/api/super/managers"), staleTime: 30_000 });

  /* ── Backup state + query ─── */
  const [creatingBackup, setCreatingBackup] = useState(false);
  const { data: backupData, refetch: refetchBackups } = useQuery<{ backups: BackupFile[]; total: number }>({
    queryKey: ["/api/super/backup/list"],
    queryFn:  () => fetcher("/api/super/backup/list"),
    enabled:  activeTab === "backups",
    staleTime: 30_000,
  });

  async function triggerBackup() {
    setCreatingBackup(true);
    try {
      const res = await fetch(api("/api/super/backup/create"), {
        method: "POST", headers: authHeaders(token ?? ""),
      });
      const data: { success?: boolean; message?: string; filename?: string; size_mb?: string; error?: string } = await res.json();
      if (data.success) {
        showToast(`✅ ${data.message ?? "تم إنشاء النسخة الاحتياطية"} (${data.size_mb} MB)`);
        void refetchBackups();
      } else {
        showToast(data.error ?? "فشل إنشاء النسخة الاحتياطية", "error");
      }
    } catch {
      showToast("فشل إنشاء النسخة الاحتياطية", "error");
    } finally {
      setCreatingBackup(false);
    }
  }

  /* ── Support settings query ─── */
  const { data: sysSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings/system"],
    queryFn: () => fetcher("/api/settings/system"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (sysSettings) {
      setSupportWa(sysSettings["support_whatsapp"] ?? "");
      setSupportEmail(sysSettings["support_email"] ?? "");
    }
  }, [sysSettings]);

  async function saveSupportSettings() {
    setSettingSaving(true);
    try {
      const upsert = async (key: string, value: string) => {
        await fetch(api("/api/settings/system"), {
          method: "POST",
          headers: authHeaders(token ?? ""),
          body: JSON.stringify({ key, value }),
        });
      };
      await upsert("support_whatsapp", supportWa.trim());
      await upsert("support_email", supportEmail.trim());
      showToast("تم حفظ إعدادات التواصل");
    } catch {
      showToast("فشل حفظ الإعدادات", "error");
    } finally {
      setSettingSaving(false);
    }
  }

  /* ── Mutations ─── */
  const coMutate = useMutation({
    mutationFn: ({ url, method = "POST", body }: { url: string; method?: string; body?: object }) =>
      fetch(api(url), { method, headers: authHeaders(token ?? ""), body: body ? JSON.stringify(body) : undefined }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/companies"] });
      qc.invalidateQueries({ queryKey: ["/api/super/stats"] });
    },
  });

  const coDelete = useMutation({
    mutationFn: (id: number) =>
      fetch(api(`/api/super/companies/${id}`), { method: "DELETE", headers: authHeaders(token ?? "") })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/companies"] });
      qc.invalidateQueries({ queryKey: ["/api/super/stats"] });
      setDeleteTarget(null); setDeleteCoErr("");
      showToast("تم حذف الشركة بنجاح");
    },
    onError: (e: Error) => setDeleteCoErr(e.message),
  });

  const mgCreate = useMutation({
    mutationFn: (body: object) =>
      fetch(api("/api/super/managers"), { method: "POST", headers: authHeaders(token ?? ""), body: JSON.stringify(body) })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/managers"] });
      setShowAddMgr(false); resetAddForm();
      showToast("تم إضافة المدير بنجاح");
    },
    onError: (e: Error) => setMgErr(e.message),
  });

  const mgUpdate = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      fetch(api(`/api/super/managers/${id}`), { method: "PATCH", headers: authHeaders(token ?? ""), body: JSON.stringify(body) })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/managers"] });
      setEditMgr(null); resetEditForm();
      showToast("تم تحديث بيانات المدير");
    },
    onError: (e: Error) => setEErr(e.message),
  });

  const mgToggle = useMutation({
    mutationFn: (id: number) =>
      fetch(api(`/api/super/managers/${id}/toggle`), { method: "PATCH", headers: authHeaders(token ?? "") })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/managers"] });
      showToast("تم تحديث حالة المدير");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const mgDelete = useMutation({
    mutationFn: (id: number) =>
      fetch(api(`/api/super/managers/${id}`), { method: "DELETE", headers: authHeaders(token ?? "") })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/managers"] });
      setDeleteMgr(null); setDeleteMgrErr("");
      showToast("تم حذف المدير بنجاح");
    },
    onError: (e: Error) => setDeleteMgrErr(e.message),
  });

  /* ── Form helpers ─── */
  const resetAddForm = () => { setMgName(""); setMgUser(""); setMgPin(""); setMgPin2(""); setMgErr(""); };
  const resetEditForm = () => { setEName(""); setEUser(""); setEPin(""); setEPin2(""); setEErr(""); };

  const openEdit = (m: Manager) => { setEName(m.name); setEUser(m.username); setEPin(""); setEPin2(""); setEErr(""); setEditMgr(m); };

  const handleAddMgr = () => {
    if (!mgName.trim()) { setMgErr("الاسم الكامل مطلوب"); return; }
    if (!mgUser.trim()) { setMgErr("اسم المستخدم مطلوب"); return; }
    if (/\s/.test(mgUser)) { setMgErr("اسم المستخدم لا يجب أن يحتوي على مسافات"); return; }
    if (mgPin.length < 4) { setMgErr("الرقم السري يجب أن يكون 4 أحرف على الأقل"); return; }
    if (mgPin !== mgPin2) { setMgErr("الرقم السري وتأكيده غير متطابقين"); return; }
    setMgErr("");
    mgCreate.mutate({ name: mgName.trim(), username: mgUser.trim(), pin: mgPin });
  };

  const handleEditMgr = () => {
    if (!editMgr) return;
    if (!eName.trim()) { setEErr("الاسم الكامل مطلوب"); return; }
    if (!eUser.trim()) { setEErr("اسم المستخدم مطلوب"); return; }
    if (/\s/.test(eUser)) { setEErr("اسم المستخدم لا يجب أن يحتوي على مسافات"); return; }
    if (ePin && ePin.length < 4) { setEErr("الرقم السري يجب أن يكون 4 أحرف على الأقل"); return; }
    if (ePin && ePin !== ePin2) { setEErr("الرقم السري وتأكيده غير متطابقين"); return; }
    setEErr("");
    const body: Record<string, string> = { name: eName.trim(), username: eUser.trim() };
    if (ePin) body.pin = ePin;
    mgUpdate.mutate({ id: editMgr.id, body });
  };

  /* ── Companies filtering ─── */
  const filtered = companies.filter(co => {
    const q = search.trim().toLowerCase();
    return (!q || co.name.toLowerCase().includes(q) || (co.admin_email ?? "").toLowerCase().includes(q))
        && (statusFilter === "all" || co.status === statusFilter);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const expiryInfo = (co: Company) => {
    const formatted = new Date(co.end_date).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
    if (co.daysRemaining < 0)  return { text: `❌ انتهى: ${formatted}`,  color: C.danger };
    if (co.daysRemaining <= 7) return { text: `⚠️ ينتهي: ${formatted}`, color: C.warning };
    return { text: `ينتهي: ${formatted}`, color: C.success };
  };

  /* ── Stats cards ─── */
  const activePercent = stats?.total ? Math.round((stats.active / stats.total) * 100) : 0;
  const statCards = [
    { label: "إجمالي الشركات", value: stats?.total ?? 0, icon: "🏢", color: C.orange,  sub: `${activePercent}% نشطة`     },
    { label: "نشطة",           value: stats?.active ?? 0, icon: "✅", color: C.success, sub: "اشتراك فعّال"                },
    { label: "تجريبية",        value: stats?.trial ?? 0,  icon: "⏳", color: C.warning, sub: "فترة تجريبية"               },
    { label: "منتهية",         value: stats?.expired ?? 0,icon: "❌", color: C.danger,  sub: "تجاوزت التاريخ"             },
    { label: "موقوفة",         value: stats?.suspended ?? 0,icon:"⛔",color: C.muted,   sub: "معطّلة"                     },
    { label: "المستخدمون",     value: stats?.totalUsers ?? 0,icon:"👥",color: C.blue,   sub: "إجمالي الحسابات"            },
  ];

  const STATUS_FILTERS = [
    { key: "all", label: "الكل" }, { key: "active", label: "نشطة" },
    { key: "trial", label: "تجريبية" }, { key: "suspended", label: "موقوفة" },
    { key: "expired", label: "منتهية" },
  ];

  const today = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.text }}>

      {/* ── Modals ─── */}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="حذف الشركة"
          body={<>هل أنت متأكد من حذف شركة <strong style={{ color: C.text }}>"{deleteTarget.name}"</strong>؟<br />
            <span style={{ color: C.danger, fontSize: "13px" }}>سيتم حذف جميع البيانات المرتبطة بها نهائياً ولا يمكن التراجع عن هذا الإجراء.</span></>}
          loading={coDelete.isPending} error={deleteCoErr}
          onConfirm={() => coDelete.mutate(deleteTarget.id)}
          onCancel={() => { setDeleteTarget(null); setDeleteCoErr(""); }}
        />
      )}

      {deleteMgr && (
        <ConfirmDeleteModal
          title="حذف المدير"
          body={<>هل أنت متأكد من حذف المدير <strong style={{ color: C.text }}>"{deleteMgr.name}"</strong>؟<br />
            <span style={{ color: C.danger, fontSize: "13px" }}>لا يمكن التراجع عن هذا الإجراء.</span></>}
          loading={mgDelete.isPending} error={deleteMgrErr}
          onConfirm={() => mgDelete.mutate(deleteMgr.id)}
          onCancel={() => { setDeleteMgr(null); setDeleteMgrErr(""); }}
        />
      )}

      {showAddMgr && (
        <Modal title="➕ إضافة مدير عام جديد" onClose={() => { setShowAddMgr(false); resetAddForm(); }}>
          <DarkInput label="الاسم الكامل" value={mgName} onChange={setMgName} placeholder="مثال: محمد العلي" required />
          <DarkInput label="اسم المستخدم" value={mgUser} onChange={setMgUser} placeholder="بدون مسافات" required hint="لا يحتوي على مسافات" />
          <DarkInput label="الرقم السري" value={mgPin} onChange={setMgPin} type="password" placeholder="4 أحرف على الأقل" required />
          <DarkInput label="تأكيد الرقم السري" value={mgPin2} onChange={setMgPin2} type="password" placeholder="أعد كتابة الرقم السري" required />
          {mgErr && <div style={{ padding: "10px 14px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: "13px", color: C.danger, marginBottom: "14px" }}>⚠️ {mgErr}</div>}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handleAddMgr} disabled={mgCreate.isPending}
              style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", background: C.orange, color: "#fff", fontSize: "14px", fontWeight: 800, cursor: mgCreate.isPending ? "not-allowed" : "pointer", fontFamily: FONT, opacity: mgCreate.isPending ? 0.7 : 1 }}>
              {mgCreate.isPending ? "جاري الإضافة..." : "إضافة المدير"}
            </button>
            <button onClick={() => { setShowAddMgr(false); resetAddForm(); }}
              style={{ flex: 1, padding: "12px", borderRadius: "10px", border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              إلغاء
            </button>
          </div>
        </Modal>
      )}

      {editMgr && (
        <Modal title="✏️ تعديل بيانات المدير" onClose={() => { setEditMgr(null); resetEditForm(); }}>
          <DarkInput label="الاسم الكامل" value={eName} onChange={setEName} placeholder="الاسم الكامل" required />
          <DarkInput label="اسم المستخدم" value={eUser} onChange={setEUser} placeholder="بدون مسافات" required />
          <DarkInput label="الرقم السري الجديد" value={ePin} onChange={setEPin} type="password" placeholder="اتركه فارغاً إذا لم تريد تغييره" hint="اختياري — فارغ يعني عدم التغيير" />
          {ePin && <DarkInput label="تأكيد الرقم السري الجديد" value={ePin2} onChange={setEPin2} type="password" placeholder="أعد كتابة الرقم السري الجديد" />}
          {eErr && <div style={{ padding: "10px 14px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: "13px", color: C.danger, marginBottom: "14px" }}>⚠️ {eErr}</div>}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handleEditMgr} disabled={mgUpdate.isPending}
              style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", background: C.orange, color: "#fff", fontSize: "14px", fontWeight: 800, cursor: mgUpdate.isPending ? "not-allowed" : "pointer", fontFamily: FONT, opacity: mgUpdate.isPending ? 0.7 : 1 }}>
              {mgUpdate.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
            <button onClick={() => { setEditMgr(null); resetEditForm(); }}
              style={{ flex: 1, padding: "12px", borderRadius: "10px", border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              إلغاء
            </button>
          </div>
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ── Sticky Header ─── */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "64px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.orangeDim, border: "1px solid rgba(249,115,22,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🛡️</div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: C.text, lineHeight: 1.2 }}>لوحة تحكم المدير العام</div>
            <div style={{ fontSize: "11px", color: C.muted }}>{today}</div>
          </div>
        </div>
        <button onClick={logout}
          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", color: C.muted, padding: "8px 18px", cursor: "pointer", fontSize: "13px", fontWeight: 700, fontFamily: FONT, transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.color = C.danger; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
        >تسجيل الخروج</button>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Tab bar ─── */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "28px" }}>
          {([
            { key: "companies", label: "🏢 الشركات المسجلة" },
            { key: "managers",  label: "👑 المديرون العامون" },
            { key: "backups",   label: "💾 النسخ الاحتياطية" },
            { key: "settings",  label: "⚙️ إعدادات النظام"  },
          ] as const).map(tab => {
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "10px 22px", borderRadius: "12px", fontSize: "14px", fontWeight: 800,
                  cursor: "pointer", fontFamily: FONT, transition: "all 0.18s",
                  border: active ? "none" : `1.5px solid ${C.border}`,
                  background: active ? C.orange : "transparent",
                  color: active ? "#fff" : C.muted,
                  boxShadow: active ? `0 4px 16px rgba(249,115,22,0.3)` : "none",
                }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════
            TAB: COMPANIES
            ══════════════════════════════ */}
        {activeTab === "companies" && (
          <>
            {/* Stats cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "16px", marginBottom: "32px" }}>
              {statCards.map(s => (
                <div key={s.label}
                  style={{ background: C.card, borderRadius: "16px", border: `1px solid ${C.border}`, borderBottom: `3px solid ${s.color}`, padding: "22px 18px 18px", textAlign: "center", transition: "all 0.2s", cursor: "default" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = `0 8px 30px ${s.color}22`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ fontSize: "24px", marginBottom: "10px" }}>{s.icon}</div>
                  <div style={{ fontSize: "3rem", fontWeight: 900, color: s.color, lineHeight: 1 }}>
                    <AnimatedNumber target={s.value} />
                  </div>
                  <div style={{ fontSize: "12px", color: C.text, marginTop: "8px", fontWeight: 700 }}>{s.label}</div>
                  <div style={{ fontSize: "11px", color: C.muted, marginTop: "3px" }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Companies table card */}
            <div style={{ background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`, overflow: "hidden" }}>

              {/* Header */}
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ fontSize: "16px", fontWeight: 800, color: C.text, margin: 0 }}>الشركات المسجّلة</h2>
                  <p style={{ fontSize: "12px", color: C.muted, margin: "2px 0 0" }}>عرض {filtered.length} من {companies.length} شركة</p>
                </div>
                <button onClick={() => setShowCreate(v => !v)}
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", background: showCreate ? "transparent" : C.orange, color: showCreate ? C.muted : "#fff", border: showCreate ? `1px solid ${C.border}` : "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all 0.18s", flexShrink: 0 }}>
                  <span style={{ fontSize: "15px" }}>{showCreate ? "✕" : "+"}</span>
                  <span>{showCreate ? "إلغاء" : "شركة جديدة"}</span>
                </button>
              </div>

              {/* Search + filter */}
              <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
                  <span style={{ position: "absolute", top: "50%", right: "12px", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>🔍</span>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن شركة…"
                    style={{ width: "100%", boxSizing: "border-box", padding: "9px 38px 9px 14px", borderRadius: "10px", border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: "13px", fontFamily: FONT, outline: "none", transition: "border-color 0.2s" }}
                    onFocus={e => { e.currentTarget.style.borderColor = C.orange; }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {STATUS_FILTERS.map(f => {
                    const active = statusFilter === f.key;
                    return (
                      <button key={f.key} onClick={() => setStatusFilter(f.key)}
                        style={{ padding: "7px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all 0.15s", border: active ? "none" : `1px solid ${C.border}`, background: active ? C.orange : "transparent", color: active ? "#fff" : C.muted }}>
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Create form */}
              {showCreate && (
                <div style={{ padding: "20px 24px", background: "rgba(249,115,22,0.06)", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
                    <div style={{ flex: "2 1 200px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px" }}>اسم الشركة *</label>
                      <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="مثال: شركة الأمل التجارية"
                        style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px", fontSize: "14px", outline: "none", fontFamily: FONT, boxSizing: "border-box", background: C.bg, color: C.text, transition: "border-color 0.2s" }}
                        onFocus={e => { e.currentTarget.style.borderColor = C.orange; }}
                        onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
                      />
                    </div>
                    <div style={{ flex: "1 1 130px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px" }}>نوع الاشتراك</label>
                      <select value={newPlan} onChange={e => setNewPlan(e.target.value)} style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px", background: C.bg, color: C.text, fontFamily: FONT }}>
                        <option value="trial">تجريبي</option>
                        <option value="basic">أساسي</option>
                        <option value="professional">احترافي</option>
                        <option value="paid">مدفوع</option>
                      </select>
                    </div>
                    <div style={{ flex: "1 1 110px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px" }}>المدة (أيام)</label>
                      <select value={newDays} onChange={e => setNewDays(Number(e.target.value))} style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px", background: C.bg, color: C.text, fontFamily: FONT }}>
                        {[7, 14, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} يوم</option>)}
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        if (!newName.trim()) return;
                        coMutate.mutate(
                          { url: "/api/super/companies", method: "POST", body: { name: newName.trim(), plan_type: newPlan, duration_days: newDays } },
                          { onSuccess: () => { setShowCreate(false); setNewName(""); setNewPlan("trial"); setNewDays(14); showToast("تم إنشاء الشركة بنجاح"); } },
                        );
                      }}
                      disabled={!newName.trim() || coMutate.isPending}
                      style={{ padding: "10px 22px", borderRadius: "10px", border: "none", background: newName.trim() ? C.orange : C.border, color: "#fff", fontSize: "14px", fontWeight: 700, cursor: newName.trim() ? "pointer" : "default", fontFamily: FONT, flexShrink: 0, transition: "filter 0.15s" }}>
                      {coMutate.isPending ? "جاري الإنشاء..." : "إنشاء الشركة"}
                    </button>
                  </div>
                </div>
              )}

              {/* Table body */}
              {coLoading ? (
                <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>جاري التحميل...</div>
              ) : paged.length === 0 ? (
                <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>
                  {search || statusFilter !== "all" ? "لا توجد نتائج مطابقة للبحث" : "لا توجد شركات مسجّلة بعد"}
                </div>
              ) : (
                <div>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 100px 150px 60px 60px 24px", gap: "8px", padding: "10px 24px", background: "rgba(249,115,22,0.08)", borderBottom: `1px solid ${C.border}`, fontSize: "11px", fontWeight: 700, color: C.orange, alignItems: "center" }}>
                    <div>#</div><div>الشركة</div>
                    <div style={{ textAlign: "center" }}>الحالة</div>
                    <div>تاريخ الانتهاء</div>
                    <div style={{ textAlign: "center" }}>مستخدمين</div>
                    <div style={{ textAlign: "center" }}>الخطة</div>
                    <div />
                  </div>

                  {paged.map((co, idx) => {
                    const isExpanded = expandedId === co.id;
                    const st = STATUS[co.status] ?? STATUS.active;
                    const isOdd = idx % 2 === 1;
                    const expiry = expiryInfo(co);
                    return (
                      <div key={co.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <div
                          onClick={() => setExpandedId(isExpanded ? null : co.id)}
                          style={{ display: "grid", gridTemplateColumns: "44px 1fr 100px 150px 60px 60px 24px", gap: "8px", padding: "14px 24px", alignItems: "center", cursor: "pointer", transition: "background 0.15s", background: isOdd ? "rgba(15,23,42,0.4)" : "transparent" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(249,115,22,0.05)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isOdd ? "rgba(15,23,42,0.4)" : "transparent"; }}
                        >
                          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.orangeDim, border: "1px solid rgba(249,115,22,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 900, color: C.orange, flexShrink: 0 }}>#{co.id}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{co.name}</div>
                            <div style={{ fontSize: "11px", color: C.muted, direction: "ltr", textAlign: "right" }}>{co.admin_email ?? "—"}</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <span style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}`, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, display: "inline-block" }}>{st.label}</span>
                          </div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: expiry.color, lineHeight: 1.5 }}>{expiry.text}</div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: C.orange }}>{co.userCount}</div>
                            <div style={{ fontSize: "10px", color: C.muted }}>مستخدم</div>
                          </div>
                          <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, color: C.muted }}>{translatePlan(co.plan_type)}</div>
                          <div style={{ fontSize: "11px", color: C.muted, transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)", textAlign: "center" }}>▶</div>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: "16px 24px 20px", background: "rgba(15,23,42,0.6)", borderTop: `1px solid ${C.border}` }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                              {!co.is_active && <ActionBtn label="تفعيل الشركة" icon="✅" color={C.success} onClick={() => coMutate.mutate({ url: `/api/super/companies/${co.id}/activate` })} />}
                              {co.is_active && <ActionBtn label="إيقاف الشركة" icon="⛔" color={C.danger} onClick={() => coMutate.mutate({ url: `/api/super/companies/${co.id}/suspend` })} />}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <select value={extendDays[co.id] ?? 7} onChange={e => setExtendDays(prev => ({ ...prev, [co.id]: Number(e.target.value) }))} onClick={e => e.stopPropagation()}
                                  style={{ border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 10px", fontSize: "13px", background: C.card, color: C.text, fontFamily: FONT }}>
                                  {[7, 14, 30, 90, 365].map(d => <option key={d} value={d}>{d} يوم</option>)}
                                </select>
                                <ActionBtn label="تمديد" icon="⏳" color={C.warning} onClick={() => coMutate.mutate({ url: `/api/super/companies/${co.id}/extend`, body: { days: extendDays[co.id] ?? 7, plan_type: "paid" } })} />
                              </div>
                              <ActionBtn label="⭐ ترقية إلى مدفوع" icon="" color={C.orange} onClick={() => coMutate.mutate({ url: `/api/super/companies/${co.id}`, method: "PUT", body: { plan_type: "paid" } })} />
                              <button onClick={e => { e.stopPropagation(); setDeleteCoErr(""); setDeleteTarget(co); }}
                                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", border: "1.5px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: C.danger, fontSize: "13px", fontWeight: 700, cursor: "pointer", transition: "all 0.15s", fontFamily: FONT }}
                                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                              >🗑️ <span>حذف الشركة</span></button>
                              <div style={{ fontSize: "12px", color: C.muted, marginRight: "auto" }}>تسجيل: {new Date(co.created_at).toLocaleDateString("ar-EG")}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "12px", color: C.muted }}>عرض {((safePage - 1) * PER_PAGE) + 1}–{Math.min(safePage * PER_PAGE, filtered.length)} من {filtered.length} شركة</span>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <PageBtn label="السابق" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} />
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPage(p)}
                        style={{ width: "32px", height: "32px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all 0.15s", border: p === safePage ? "none" : `1px solid ${C.border}`, background: p === safePage ? C.orange : "transparent", color: p === safePage ? "#fff" : C.muted }}>
                        {p}
                      </button>
                    ))}
                    <PageBtn label="التالي" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════
            TAB: MANAGERS
            ══════════════════════════════ */}
        {activeTab === "managers" && (
          <div style={{ background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`, overflow: "hidden" }}>

            {/* Header */}
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 800, color: C.text, margin: 0 }}>المديرون العامون</h2>
                <p style={{ fontSize: "12px", color: C.muted, margin: "2px 0 0" }}>{managers.length} مدير عام مسجّل</p>
              </div>
              <button onClick={() => { resetAddForm(); setShowAddMgr(true); }}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "10px", background: C.orange, color: "#fff", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                <span>➕</span><span>مدير عام جديد</span>
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 140px 160px 90px 1fr", gap: "8px", padding: "10px 24px", background: "rgba(249,115,22,0.08)", borderBottom: `1px solid ${C.border}`, fontSize: "11px", fontWeight: 700, color: C.orange, alignItems: "center" }}>
              <div>#</div>
              <div>الاسم</div>
              <div>اسم المستخدم</div>
              <div>آخر دخول</div>
              <div style={{ textAlign: "center" }}>الحالة</div>
              <div style={{ textAlign: "center" }}>الإجراءات</div>
            </div>

            {mgLoading ? (
              <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>جاري التحميل...</div>
            ) : managers.length === 0 ? (
              <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>لا يوجد مديرون عامون مسجّلون</div>
            ) : (
              managers.map((m, idx) => {
                const isMe = m.id === user?.id;
                const isOdd = idx % 2 === 1;
                const isActive = m.active !== false;
                const lastLogin = m.last_login
                  ? new Date(m.last_login).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" })
                  : "لم يسجل بعد";

                return (
                  <div key={m.id} style={{ borderBottom: `1px solid ${C.border}`, background: isOdd ? "rgba(15,23,42,0.4)" : "transparent" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 140px 160px 90px 1fr", gap: "8px", padding: "14px 24px", alignItems: "center" }}>
                      {/* ID badge */}
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.orangeDim, border: "1px solid rgba(249,115,22,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 900, color: C.orange, flexShrink: 0 }}>#{m.id}</div>

                      {/* Name */}
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: C.text }}>
                          {m.name}
                          {isMe && <span style={{ marginRight: "8px", fontSize: "10px", fontWeight: 700, color: C.orange, background: C.orangeDim, border: `1px solid rgba(249,115,22,0.3)`, padding: "2px 8px", borderRadius: "10px" }}>أنت</span>}
                        </div>
                        {m.email && <div style={{ fontSize: "11px", color: C.muted }}>{m.email}</div>}
                      </div>

                      {/* Username */}
                      <div style={{ fontSize: "13px", fontWeight: 600, color: C.muted, direction: "ltr" }}>@{m.username}</div>

                      {/* Last login */}
                      <div style={{ fontSize: "12px", color: m.last_login ? C.success : C.muted }}>{lastLogin}</div>

                      {/* Status */}
                      <div style={{ textAlign: "center" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, display: "inline-block",
                          background: isActive ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.1)",
                          color: isActive ? C.success : C.muted,
                          border: `1px solid ${isActive ? "rgba(34,197,94,0.3)" : "rgba(148,163,184,0.2)"}`,
                        }}>
                          {isActive ? "نشط" : "موقوف"}
                        </span>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                        {/* Edit */}
                        <button onClick={() => openEdit(m)}
                          style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", border: `1.5px solid ${C.orange}44`, background: `${C.orange}18`, color: C.orange, fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all 0.15s" }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${C.orange}30`; }}
                          onMouseLeave={e => { e.currentTarget.style.background = `${C.orange}18`; }}
                        >✏️ تعديل</button>

                        {/* Toggle */}
                        {!isMe && (
                          <button onClick={() => mgToggle.mutate(m.id)}
                            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", border: `1.5px solid ${isActive ? C.danger : C.success}44`, background: isActive ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: isActive ? C.danger : C.success, fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = "0.8"; }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                          >
                            {isActive ? "⛔ إيقاف" : "✅ تفعيل"}
                          </button>
                        )}

                        {/* Delete */}
                        {!isMe && (
                          <button onClick={() => { setDeleteMgrErr(""); setDeleteMgr(m); }}
                            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", border: "1.5px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: C.danger, fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: FONT, transition: "all 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                          >🗑️ حذف</button>
                        )}

                        {isMe && <span style={{ fontSize: "11px", color: C.muted, alignSelf: "center" }}>لا يمكن تعديل الحساب الحالي هنا</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ══════════════════════════════
            TAB: BACKUPS
            ══════════════════════════════ */}
        {activeTab === "backups" && (
          <div>
            {/* Header card */}
            <div style={{
              background: C.card, borderRadius: "16px", border: `1px solid ${C.border}`,
              padding: "20px 24px", marginBottom: "20px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px",
            }}>
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 800, color: C.text, margin: "0 0 4px" }}>النسخ الاحتياطية للقاعدة</h2>
                <p style={{ fontSize: "12px", color: C.muted, margin: 0 }}>
                  النسخ الاحتياطي التلقائي يعمل يومياً الساعة 3:00 صباحاً •{" "}
                  {backupData ? `${backupData.total} نسخة متوفرة` : "جاري التحميل..."}
                </p>
              </div>
              <button
                onClick={() => { void triggerBackup(); }}
                disabled={creatingBackup}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "10px 20px", borderRadius: "10px", border: "none",
                  background: creatingBackup ? C.border : C.orange, color: "#fff",
                  fontSize: "14px", fontWeight: 800, cursor: creatingBackup ? "not-allowed" : "pointer",
                  fontFamily: FONT, transition: "filter 0.15s", flexShrink: 0,
                }}
              >
                💾 {creatingBackup ? "جاري الإنشاء..." : "إنشاء نسخة احتياطية الآن"}
              </button>
            </div>

            {/* Backups table */}
            <div style={{ background: C.card, borderRadius: "16px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
              {/* Column headers */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 100px 180px",
                gap: "8px", padding: "10px 24px",
                background: "rgba(249,115,22,0.08)", borderBottom: `1px solid ${C.border}`,
                fontSize: "11px", fontWeight: 700, color: C.orange,
              }}>
                <div>اسم الملف</div>
                <div style={{ textAlign: "center" }}>الحجم</div>
                <div style={{ textAlign: "center" }}>التاريخ</div>
              </div>

              {!backupData ? (
                <div style={{ padding: "48px", textAlign: "center", color: C.muted }}>جاري التحميل...</div>
              ) : backupData.backups.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: C.muted }}>
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>💾</div>
                  <div>لا توجد نسخ احتياطية بعد</div>
                  <div style={{ fontSize: "12px", marginTop: "6px" }}>اضغط "إنشاء نسخة احتياطية الآن" للبدء</div>
                </div>
              ) : backupData.backups.map((b, idx) => (
                <div key={b.filename} style={{
                  display: "grid", gridTemplateColumns: "1fr 100px 180px",
                  gap: "8px", padding: "12px 24px", alignItems: "center",
                  borderBottom: idx < backupData.backups.length - 1 ? `1px solid ${C.border}` : "none",
                  background: idx % 2 === 1 ? "rgba(15,23,42,0.4)" : "transparent",
                }}>
                  <div style={{ fontSize: "13px", color: C.text, fontFamily: "monospace", wordBreak: "break-all" }}>
                    {b.filename}
                  </div>
                  <div style={{ fontSize: "12px", color: C.muted, textAlign: "center" }}>{b.size_mb} MB</div>
                  <div style={{ fontSize: "12px", color: C.muted, textAlign: "center" }}>
                    {new Date(b.created_at).toLocaleString("ar-EG", {
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            TAB: SETTINGS
            ══════════════════════════════ */}
        {activeTab === "settings" && (
          <div style={{ maxWidth: "560px" }}>
            <div style={{ background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`, padding: "28px 32px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 800, color: C.text, margin: "0 0 6px" }}>معلومات التواصل للدعم</h2>
              <p style={{ fontSize: "12px", color: C.muted, margin: "0 0 24px" }}>
                تُستخدم هذه المعلومات في صفحة انتهاء الاشتراك وفي شريط التنبيه للمستخدمين
              </p>

              <DarkInput
                label="رقم واتساب للدعم"
                value={supportWa}
                onChange={setSupportWa}
                placeholder="مثال: 966501234567"
                hint="أدخل الرقم كاملاً مع رمز الدولة بدون + أو مسافات"
              />

              <DarkInput
                label="البريد الإلكتروني للدعم"
                value={supportEmail}
                onChange={setSupportEmail}
                placeholder="support@example.com"
                type="email"
              />

              <button
                onClick={() => { void saveSupportSettings(); }}
                disabled={settingSaving}
                style={{
                  width: "100%", padding: "12px", borderRadius: "10px",
                  border: "none", background: settingSaving ? C.border : C.orange,
                  color: "#fff", fontSize: "14px", fontWeight: 800,
                  cursor: settingSaving ? "not-allowed" : "pointer", fontFamily: FONT,
                  transition: "filter 0.15s", marginTop: "8px",
                }}
              >
                {settingSaving ? "جاري الحفظ..." : "💾 حفظ الإعدادات"}
              </button>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes sa-fade-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}
