/**
 * Super Admin Dashboard — manage all SaaS companies
 * Only accessible to users with role = "super_admin"
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

interface Company {
  id: number;
  name: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  admin_email: string | null;
  daysRemaining: number;
  status: "active" | "trial" | "expired" | "suspended";
  userCount: number;
  created_at: string;
}

interface Stats {
  total: number; active: number; trial: number;
  expired: number; suspended: number; totalUsers: number;
}

const STATUS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  active:    { bg: "rgba(34,197,94,0.12)",  text: "#22C55E", border: "rgba(34,197,94,0.3)",  label: "نشط"    },
  trial:     { bg: "rgba(249,115,22,0.12)", text: "#F97316", border: "rgba(249,115,22,0.3)", label: "تجريبي" },
  expired:   { bg: "rgba(239,68,68,0.12)",  text: "#EF4444", border: "rgba(239,68,68,0.3)",  label: "منتهي"  },
  suspended: { bg: "rgba(148,163,184,0.1)", text: "#94A3B8", border: "rgba(148,163,184,0.2)",label: "موقوف"  },
};

const PLAN_LABELS: Record<string, string> = {
  trial: "تجريبي", basic: "أساسي", professional: "احترافي",
  pro: "احترافي", paid: "مدفوع",
};
const translatePlan = (p: string) => PLAN_LABELS[p] ?? p;

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const C = {
  bg:       "#0F172A",
  card:     "#1E293B",
  border:   "#334155",
  orange:   "#F97316",
  orangeDim:"rgba(249,115,22,0.15)",
  text:     "#F8FAFC",
  muted:    "#94A3B8",
  success:  "#22C55E",
  danger:   "#EF4444",
  warning:  "#F59E0B",
  blue:     "#3B82F6",
};

const PER_PAGE = 10;

/* ── Animated counter ──────────────────────────────── */
function AnimatedNumber({ target }: { target: number | string }) {
  const [display, setDisplay] = useState<number | string>(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (typeof target !== "number") { setDisplay(target); return; }
    const start = 0; const duration = 700;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (target - start) * eased));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target]);

  return <>{display}</>;
}

/* ── Confirm Delete Modal ──────────────────────────── */
function DeleteModal({ company, onConfirm, onCancel, loading, error }: {
  company: Company; onConfirm: () => void; onCancel: () => void; loading: boolean; error: string;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      <div dir="rtl" style={{
        background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`,
        padding: "32px", maxWidth: "440px", width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        fontFamily: "'Tajawal','Cairo',sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0,
          }}>🗑️</div>
          <h3 style={{ fontSize: "18px", fontWeight: 900, color: C.text, margin: 0 }}>حذف الشركة</h3>
        </div>

        <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.8, marginBottom: "8px" }}>
          هل أنت متأكد من حذف شركة <span style={{ color: C.text, fontWeight: 700 }}>"{company.name}"</span>؟
        </p>
        <p style={{ fontSize: "13px", color: C.danger, lineHeight: 1.7, marginBottom: "24px" }}>
          سيتم حذف جميع البيانات المرتبطة بها نهائياً ولا يمكن التراجع عن هذا الإجراء.
        </p>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: "10px",
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            fontSize: "13px", color: C.danger, marginBottom: "16px",
          }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1, padding: "12px", borderRadius: "10px", border: "none",
              background: loading ? "#6b2020" : C.danger, color: "#fff",
              fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "filter 0.15s", opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "جاري الحذف..." : "نعم، احذف"}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1, padding: "12px", borderRadius: "10px",
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.muted, fontSize: "14px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */
export default function SuperAdmin() {
  const { user, token, logout } = useAuth();
  const [, setLocation]  = useLocation();
  const qc               = useQueryClient();

  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [extendDays,  setExtendDays]  = useState<Record<number, number>>({});
  const [showCreate,  setShowCreate]  = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newPlan,     setNewPlan]     = useState("trial");
  const [newDays,     setNewDays]     = useState(14);

  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState<string>("all");
  const [page,        setPage]        = useState(1);

  const [deleteTarget,setDeleteTarget]= useState<Company | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [toast,       setToast]       = useState<string | null>(null);

  if (user?.role !== "super_admin") {
    setLocation("/");
    return null;
  }

  const fetcher = useCallback((url: string) =>
    fetch(api(url), { headers: authHeaders(token ?? "") }).then(r => {
      if (!r.ok) throw new Error("فشل جلب البيانات");
      return r.json();
    }), [token]);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/super/stats"],
    queryFn: () => fetcher("/api/super/stats"),
    staleTime: 30_000,
  });

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/super/companies"],
    queryFn: () => fetcher("/api/super/companies"),
    staleTime: 30_000,
  });

  const mutate = useMutation({
    mutationFn: ({ url, method = "POST", body }: { url: string; method?: string; body?: object }) =>
      fetch(api(url), {
        method,
        headers: authHeaders(token ?? ""),
        body: body ? JSON.stringify(body) : undefined,
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/companies"] });
      qc.invalidateQueries({ queryKey: ["/api/super/stats"] });
    },
  });

  const deleteMutate = useMutation({
    mutationFn: (id: number) =>
      fetch(api(`/api/super/companies/${id}`), {
        method: "DELETE",
        headers: authHeaders(token ?? ""),
      }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "فشل الحذف");
        return data;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/super/companies"] });
      qc.invalidateQueries({ queryKey: ["/api/super/stats"] });
      setDeleteTarget(null);
      setDeleteError("");
      showToast("تم حذف الشركة بنجاح");
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    mutate.mutate(
      { url: "/api/super/companies", method: "POST", body: { name: newName.trim(), plan_type: newPlan, days: newDays } },
      { onSuccess: () => { setShowCreate(false); setNewName(""); setNewPlan("trial"); setNewDays(14); showToast("تم إنشاء الشركة بنجاح"); } },
    );
  };

  /* ── Filter + search ─── */
  const filtered = companies.filter(co => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      co.name.toLowerCase().includes(q) ||
      (co.admin_email ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || co.status === statusFilter;
    return matchSearch && matchStatus;
  });

  /* ── Pagination ─── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  /* ── Expiry display ─── */
  const expiryInfo = (co: Company) => {
    const days = co.daysRemaining;
    const formatted = new Date(co.end_date).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
    if (days < 0)  return { text: `❌ انتهى: ${formatted}`, color: C.danger };
    if (days <= 7) return { text: `⚠️ ينتهي: ${formatted}`, color: C.warning };
    return { text: `ينتهي: ${formatted}`, color: C.success };
  };

  /* ── Stats cards ─── */
  const activePercent = stats?.total ? Math.round((stats.active / stats.total) * 100) : 0;
  const statCards = [
    { label: "إجمالي الشركات", value: stats?.total ?? 0,        icon: "🏢", color: C.orange,  sub: `${activePercent}% نشطة` },
    { label: "نشطة",            value: stats?.active ?? 0,        icon: "✅", color: C.success, sub: "اشتراك فعّال" },
    { label: "تجريبية",         value: stats?.trial ?? 0,         icon: "⏳", color: C.warning, sub: "فترة تجريبية" },
    { label: "منتهية",          value: stats?.expired ?? 0,       icon: "❌", color: C.danger,  sub: "تجاوزت التاريخ" },
    { label: "موقوفة",          value: stats?.suspended ?? 0,     icon: "⛔", color: C.muted,   sub: "معطّلة" },
    { label: "المستخدمون",      value: stats?.totalUsers ?? 0,    icon: "👥", color: C.blue,    sub: "إجمالي الحسابات" },
  ];

  const today = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const STATUS_FILTERS = [
    { key: "all",       label: "الكل"    },
    { key: "active",    label: "نشطة"    },
    { key: "trial",     label: "تجريبية" },
    { key: "suspended", label: "موقوفة"  },
    { key: "expired",   label: "منتهية"  },
  ];

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Tajawal','Cairo',sans-serif", color: C.text }}>

      {/* ── Delete modal ─── */}
      {deleteTarget && (
        <DeleteModal
          company={deleteTarget}
          loading={deleteMutate.isPending}
          error={deleteError}
          onConfirm={() => deleteMutate.mutate(deleteTarget.id)}
          onCancel={() => { setDeleteTarget(null); setDeleteError(""); }}
        />
      )}

      {/* ── Toast ─── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          background: "#1a2e1a", border: "1px solid rgba(34,197,94,0.4)",
          borderRadius: "12px", padding: "12px 24px",
          fontSize: "14px", fontWeight: 700, color: C.success,
          zIndex: 2000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "sa-fade-in 0.3s ease",
        }}>
          ✅ {toast}
        </div>
      )}

      {/* ── Header ─── */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "64px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: C.orangeDim, border: "1px solid rgba(249,115,22,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
          }}>🛡️</div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: C.text, lineHeight: 1.2 }}>لوحة تحكم المدير العام</div>
            <div style={{ fontSize: "11px", color: C.muted }}>{today}</div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: "10px", color: C.muted, padding: "8px 18px",
            cursor: "pointer", fontSize: "13px", fontWeight: 700, fontFamily: "inherit", transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.color = C.danger; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
        >
          تسجيل الخروج
        </button>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Stats cards ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "16px", marginBottom: "32px" }}>
          {statCards.map(s => (
            <div
              key={s.label}
              style={{
                background: C.card, borderRadius: "16px",
                border: `1px solid ${C.border}`,
                borderBottom: `3px solid ${s.color}`,
                padding: "22px 18px 18px",
                textAlign: "center",
                transition: "all 0.2s",
                cursor: "default",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = `0 8px 30px ${s.color}22`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "none";
              }}
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

        {/* ── Companies table ─── */}
        <div style={{ background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`, overflow: "hidden" }}>

          {/* Table header row */}
          <div style={{
            padding: "18px 24px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap",
          }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 800, color: C.text, margin: 0 }}>الشركات المسجّلة</h2>
              <p style={{ fontSize: "12px", color: C.muted, margin: "2px 0 0" }}>
                عرض {filtered.length} من {companies.length} شركة
              </p>
            </div>
            <button
              onClick={() => setShowCreate(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", borderRadius: "10px",
                background: showCreate ? "transparent" : C.orange,
                color: showCreate ? C.muted : "#fff",
                border: showCreate ? `1px solid ${C.border}` : "none",
                fontSize: "13px", fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.18s", flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "15px" }}>{showCreate ? "✕" : "+"}</span>
              <span>{showCreate ? "إلغاء" : "شركة جديدة"}</span>
            </button>
          </div>

          {/* Search + filter bar */}
          <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
              <span style={{ position: "absolute", top: "50%", right: "12px", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن شركة…"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 38px 9px 14px",
                  borderRadius: "10px", border: `1.5px solid ${C.border}`,
                  background: C.bg, color: C.text, fontSize: "13px",
                  fontFamily: "inherit", outline: "none", transition: "border-color 0.2s",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.orange; }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
              />
            </div>

            {/* Status filter pills */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {STATUS_FILTERS.map(f => {
                const active = statusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    style={{
                      padding: "7px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      border: active ? "none" : `1px solid ${C.border}`,
                      background: active ? C.orange : "transparent",
                      color: active ? "#fff" : C.muted,
                    }}
                  >
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
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="مثال: شركة الأمل التجارية"
                    style={{
                      width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px",
                      padding: "10px 14px", fontSize: "14px", outline: "none",
                      fontFamily: "inherit", boxSizing: "border-box",
                      background: C.bg, color: C.text, transition: "border-color 0.2s",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = C.orange; }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>
                <div style={{ flex: "1 1 130px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px" }}>نوع الاشتراك</label>
                  <select value={newPlan} onChange={e => setNewPlan(e.target.value)}
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px", background: C.bg, color: C.text, fontFamily: "inherit" }}>
                    <option value="trial">تجريبي</option>
                    <option value="basic">أساسي</option>
                    <option value="professional">احترافي</option>
                    <option value="paid">مدفوع</option>
                  </select>
                </div>
                <div style={{ flex: "1 1 110px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px" }}>المدة (أيام)</label>
                  <select value={newDays} onChange={e => setNewDays(Number(e.target.value))}
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", fontSize: "14px", background: C.bg, color: C.text, fontFamily: "inherit" }}>
                    {[7, 14, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} يوم</option>)}
                  </select>
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || mutate.isPending}
                  style={{
                    padding: "10px 22px", borderRadius: "10px", border: "none",
                    background: newName.trim() ? C.orange : C.border,
                    color: "#fff", fontSize: "14px", fontWeight: 700,
                    cursor: newName.trim() ? "pointer" : "default",
                    fontFamily: "inherit", flexShrink: 0, transition: "filter 0.15s",
                  }}
                >
                  {mutate.isPending ? "جاري الإنشاء..." : "إنشاء الشركة"}
                </button>
              </div>
            </div>
          )}

          {/* Table body */}
          {isLoading ? (
            <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>جاري التحميل...</div>
          ) : paged.length === 0 ? (
            <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>
              {search || statusFilter !== "all" ? "لا توجد نتائج مطابقة للبحث" : "لا توجد شركات مسجّلة بعد"}
            </div>
          ) : (
            <div>
              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 100px 140px 60px 60px 24px",
                gap: "8px", padding: "10px 24px",
                background: "rgba(249,115,22,0.08)",
                borderBottom: `1px solid ${C.border}`,
                fontSize: "11px", fontWeight: 700, color: C.orange, alignItems: "center",
              }}>
                <div>#</div>
                <div>الشركة</div>
                <div style={{ textAlign: "center" }}>الحالة</div>
                <div>تاريخ الانتهاء</div>
                <div style={{ textAlign: "center" }}>مستخدمين</div>
                <div style={{ textAlign: "center" }}>الخطة</div>
                <div />
              </div>

              {paged.map((co, idx) => {
                const isExpanded = expandedId === co.id;
                const st         = STATUS[co.status] ?? STATUS.active;
                const isOdd      = idx % 2 === 1;
                const expiry     = expiryInfo(co);

                return (
                  <div key={co.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : co.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 1fr 100px 140px 60px 60px 24px",
                        gap: "8px", padding: "14px 24px",
                        alignItems: "center", cursor: "pointer",
                        transition: "background 0.15s",
                        background: isOdd ? "rgba(15,23,42,0.4)" : "transparent",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(249,115,22,0.05)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isOdd ? "rgba(15,23,42,0.4)" : "transparent"; }}
                    >
                      {/* ID badge */}
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "10px",
                        background: C.orangeDim, border: "1px solid rgba(249,115,22,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 900, color: C.orange, flexShrink: 0,
                      }}>#{co.id}</div>

                      {/* Name + email */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {co.name}
                        </div>
                        <div style={{ fontSize: "11px", color: C.muted, direction: "ltr", textAlign: "right" }}>
                          {co.admin_email ?? "—"}
                        </div>
                      </div>

                      {/* Status pill */}
                      <div style={{ textAlign: "center" }}>
                        <span style={{
                          background: st.bg, color: st.text, border: `1px solid ${st.border}`,
                          padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, display: "inline-block",
                        }}>{st.label}</span>
                      </div>

                      {/* Expiry date */}
                      <div style={{ fontSize: "11px", fontWeight: 600, color: expiry.color, lineHeight: 1.5 }}>
                        {expiry.text}
                      </div>

                      {/* User count */}
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: C.orange }}>{co.userCount}</div>
                        <div style={{ fontSize: "10px", color: C.muted }}>مستخدم</div>
                      </div>

                      {/* Plan */}
                      <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, color: C.muted }}>
                        {translatePlan(co.plan_type)}
                      </div>

                      {/* Chevron */}
                      <div style={{
                        fontSize: "11px", color: C.muted,
                        transition: "transform 0.2s",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                        textAlign: "center",
                      }}>▶</div>
                    </div>

                    {/* Expanded actions panel */}
                    {isExpanded && (
                      <div style={{ padding: "16px 24px 20px", background: "rgba(15,23,42,0.6)", borderTop: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                          {!co.is_active && (
                            <ActionBtn label="تفعيل الشركة" icon="✅" color={C.success}
                              onClick={() => mutate.mutate({ url: `/api/super/companies/${co.id}/activate` })} />
                          )}
                          {co.is_active && (
                            <ActionBtn label="إيقاف الشركة" icon="⛔" color={C.danger}
                              onClick={() => mutate.mutate({ url: `/api/super/companies/${co.id}/suspend` })} />
                          )}

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <select
                              value={extendDays[co.id] ?? 7}
                              onChange={e => setExtendDays(prev => ({ ...prev, [co.id]: Number(e.target.value) }))}
                              onClick={e => e.stopPropagation()}
                              style={{
                                border: `1px solid ${C.border}`, borderRadius: "8px",
                                padding: "7px 10px", fontSize: "13px",
                                background: C.card, color: C.text, fontFamily: "inherit",
                              }}
                            >
                              {[7, 14, 30, 90, 365].map(d => <option key={d} value={d}>{d} يوم</option>)}
                            </select>
                            <ActionBtn label="تمديد" icon="⏳" color={C.warning}
                              onClick={() => mutate.mutate({
                                url: `/api/super/companies/${co.id}/extend`,
                                body: { days: extendDays[co.id] ?? 7, plan_type: "paid" },
                              })} />
                          </div>

                          <ActionBtn label="⭐ ترقية إلى مدفوع" icon="" color={C.orange}
                            onClick={() => mutate.mutate({
                              url: `/api/super/companies/${co.id}`,
                              method: "PUT",
                              body: { plan_type: "paid" },
                            })} />

                          {/* Delete button */}
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteError(""); setDeleteTarget(co); }}
                            style={{
                              display: "flex", alignItems: "center", gap: "6px",
                              padding: "8px 14px", borderRadius: "10px",
                              border: `1.5px solid rgba(239,68,68,0.4)`,
                              background: "rgba(239,68,68,0.1)", color: C.danger,
                              fontSize: "13px", fontWeight: 700, cursor: "pointer",
                              transition: "all 0.15s", fontFamily: "'Tajawal','Cairo',sans-serif",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                          >
                            🗑️ <span>حذف الشركة</span>
                          </button>

                          <div style={{ fontSize: "12px", color: C.muted, marginRight: "auto" }}>
                            تسجيل: {new Date(co.created_at).toLocaleDateString("ar-EG")}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Pagination ─── */}
          {totalPages > 1 && (
            <div style={{
              padding: "14px 24px", borderTop: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px",
            }}>
              <span style={{ fontSize: "12px", color: C.muted }}>
                عرض {((safePage - 1) * PER_PAGE) + 1}–{Math.min(safePage * PER_PAGE, filtered.length)} من {filtered.length} شركة
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <PageBtn label="السابق" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} />
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: "32px", height: "32px", borderRadius: "8px", fontSize: "13px", fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                      border: p === safePage ? "none" : `1px solid ${C.border}`,
                      background: p === safePage ? C.orange : "transparent",
                      color: p === safePage ? "#fff" : C.muted,
                    }}
                  >{p}</button>
                ))}
                <PageBtn label="التالي" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes sa-fade-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}

function ActionBtn({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex", alignItems: "center", gap: "5px",
        padding: "8px 14px", borderRadius: "10px",
        border: `1.5px solid ${color}44`,
        background: `${color}18`, color,
        fontSize: "13px", fontWeight: 700,
        cursor: "pointer", transition: "all 0.15s",
        fontFamily: "'Tajawal','Cairo',sans-serif",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}30`; e.currentTarget.style.borderColor = `${color}88`; }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}18`; e.currentTarget.style.borderColor = `${color}44`; }}
    >
      {icon && <span>{icon}</span>}<span>{label}</span>
    </button>
  );
}

function PageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
        cursor: disabled ? "default" : "pointer", fontFamily: "'Tajawal','Cairo',sans-serif",
        border: `1px solid ${disabled ? "rgba(51,65,85,0.4)" : "#334155"}`,
        background: "transparent",
        color: disabled ? "rgba(148,163,184,0.3)" : "#94A3B8",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}
