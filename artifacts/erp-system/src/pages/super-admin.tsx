/**
 * Super Admin Dashboard — manage all SaaS companies
 * Only accessible to users with role = "super_admin"
 */
import { useState, useCallback } from "react";
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

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

const C = {
  bg:       "#0F172A",
  card:     "#1E293B",
  cardHov:  "#253147",
  border:   "#334155",
  orange:   "#F97316",
  orangeDim:"rgba(249,115,22,0.15)",
  text:     "#F8FAFC",
  muted:    "#94A3B8",
  success:  "#22C55E",
  danger:   "#EF4444",
  warning:  "#F59E0B",
};

export default function SuperAdmin() {
  const { user, token, logout }   = useAuth();
  const [, setLocation] = useLocation();
  const qc              = useQueryClient();
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [extendDays,    setExtendDays]    = useState<Record<number, number>>({});
  const [showCreate,    setShowCreate]    = useState(false);
  const [newName,       setNewName]       = useState("");
  const [newPlan,       setNewPlan]       = useState("trial");
  const [newDays,       setNewDays]       = useState(14);

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

  const handleCreate = () => {
    if (!newName.trim()) return;
    mutate.mutate(
      { url: "/api/super/companies", method: "POST", body: { name: newName.trim(), plan_type: newPlan, days: newDays } },
      { onSuccess: () => { setShowCreate(false); setNewName(""); setNewPlan("trial"); setNewDays(14); } },
    );
  };

  const today = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const statCards = [
    { label: "إجمالي الشركات", value: stats?.total ?? "—",      icon: "🏢", color: C.orange   },
    { label: "نشطة",            value: stats?.active ?? "—",      icon: "✅", color: C.success  },
    { label: "تجريبية",         value: stats?.trial ?? "—",       icon: "⏳", color: C.warning  },
    { label: "منتهية",          value: stats?.expired ?? "—",     icon: "❌", color: C.danger   },
    { label: "موقوفة",          value: stats?.suspended ?? "—",   icon: "⛔", color: C.muted    },
    { label: "المستخدمون",      value: stats?.totalUsers ?? "—",  icon: "👥", color: C.orange   },
  ];

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Tajawal','Cairo',sans-serif", color: C.text }}>

      {/* ── Header ─── */}
      <div style={{
        background: C.card,
        borderBottom: `1px solid ${C.border}`,
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "64px",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "36px", height: "36px",
            borderRadius: "10px",
            background: C.orangeDim,
            border: `1px solid rgba(249,115,22,0.3)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px",
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
            cursor: "pointer", fontSize: "13px", fontWeight: 700,
            fontFamily: "inherit", transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.color = C.danger; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
        >
          تسجيل الخروج
        </button>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Stats cards ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: "16px", marginBottom: "32px" }}>
          {statCards.map(s => (
            <div
              key={s.label}
              style={{
                background: C.card,
                borderRadius: "16px",
                border: `1px solid ${C.border}`,
                padding: "20px 18px",
                textAlign: "center",
                transition: "all 0.2s",
                cursor: "default",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${s.color}55`; e.currentTarget.style.boxShadow = `0 0 20px ${s.color}22`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ fontSize: "26px", marginBottom: "8px" }}>{s.icon}</div>
              <div style={{ fontSize: "30px", fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: "12px", color: C.muted, marginTop: "6px", fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Companies table ─── */}
        <div style={{ background: C.card, borderRadius: "20px", border: `1px solid ${C.border}`, overflow: "hidden" }}>

          {/* Table header */}
          <div style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 800, color: C.text, margin: 0 }}>الشركات المسجّلة</h2>
              <p style={{ fontSize: "12px", color: C.muted, margin: "2px 0 0" }}>{companies.length} شركة</p>
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
                fontFamily: "inherit", transition: "all 0.18s",
              }}
              onMouseEnter={e => { if (!showCreate) e.currentTarget.style.filter = "brightness(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
            >
              <span style={{ fontSize: "15px" }}>{showCreate ? "✕" : "+"}</span>
              <span>{showCreate ? "إلغاء" : "شركة جديدة"}</span>
            </button>
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
                      background: C.bg, color: C.text,
                      transition: "border-color 0.2s",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = C.orange; }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>
                <div style={{ flex: "1 1 130px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px" }}>نوع الاشتراك</label>
                  <select
                    value={newPlan}
                    onChange={e => setNewPlan(e.target.value)}
                    style={{
                      width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px",
                      padding: "10px 12px", fontSize: "14px",
                      background: C.bg, color: C.text, fontFamily: "inherit",
                    }}
                  >
                    <option value="trial">تجريبي</option>
                    <option value="basic">أساسي</option>
                    <option value="professional">احترافي</option>
                    <option value="paid">مدفوع</option>
                  </select>
                </div>
                <div style={{ flex: "1 1 110px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px" }}>المدة (أيام)</label>
                  <select
                    value={newDays}
                    onChange={e => setNewDays(Number(e.target.value))}
                    style={{
                      width: "100%", border: `1.5px solid ${C.border}`, borderRadius: "10px",
                      padding: "10px 12px", fontSize: "14px",
                      background: C.bg, color: C.text, fontFamily: "inherit",
                    }}
                  >
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
                  onMouseEnter={e => { if (newName.trim()) e.currentTarget.style.filter = "brightness(1.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
                >
                  {mutate.isPending ? "جاري الإنشاء..." : "إنشاء الشركة"}
                </button>
              </div>
            </div>
          )}

          {/* Table body */}
          {isLoading ? (
            <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>جاري التحميل...</div>
          ) : companies.length === 0 ? (
            <div style={{ padding: "60px", textAlign: "center", color: C.muted }}>لا توجد شركات مسجّلة بعد</div>
          ) : (
            <div>
              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 100px 72px 60px 24px",
                gap: "12px",
                padding: "10px 24px",
                background: "rgba(249,115,22,0.08)",
                borderBottom: `1px solid ${C.border}`,
                fontSize: "11px", fontWeight: 700, color: C.orange,
                alignItems: "center",
              }}>
                <div>#</div>
                <div>الشركة</div>
                <div style={{ textAlign: "center" }}>الحالة</div>
                <div style={{ textAlign: "center" }}>المتبقي</div>
                <div style={{ textAlign: "center" }}>مستخدمين</div>
                <div />
              </div>

              {companies.map((co, idx) => {
                const isExpanded = expandedId === co.id;
                const days       = co.daysRemaining;
                const st         = STATUS[co.status] ?? STATUS.active;
                const isOdd      = idx % 2 === 1;

                return (
                  <div key={co.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : co.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 1fr 100px 72px 60px 24px",
                        gap: "12px",
                        padding: "14px 24px",
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "background 0.15s",
                        background: isOdd ? "rgba(15,23,42,0.4)" : "transparent",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(249,115,22,0.05)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isOdd ? "rgba(15,23,42,0.4)" : "transparent"; }}
                    >
                      {/* ID badge */}
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "10px",
                        background: C.orangeDim, border: `1px solid rgba(249,115,22,0.25)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 900, color: C.orange, flexShrink: 0,
                      }}>
                        #{co.id}
                      </div>

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
                          padding: "3px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700,
                          display: "inline-block",
                        }}>
                          {st.label}
                        </span>
                      </div>

                      {/* Days remaining */}
                      <div style={{ textAlign: "center" }}>
                        <div style={{
                          fontSize: "15px", fontWeight: 900,
                          color: days < 0 ? C.danger : days < 3 ? C.warning : C.success,
                        }}>
                          {days < 0 ? "منتهي" : `${days}ي`}
                        </div>
                        <div style={{ fontSize: "10px", color: C.muted }}>متبقي</div>
                      </div>

                      {/* User count */}
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: C.orange }}>{co.userCount}</div>
                        <div style={{ fontSize: "10px", color: C.muted }}>مستخدم</div>
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
                      <div style={{
                        padding: "16px 24px 20px",
                        background: "rgba(15,23,42,0.6)",
                        borderTop: `1px solid ${C.border}`,
                      }}>
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
                              onChange={(e) => setExtendDays(prev => ({ ...prev, [co.id]: Number(e.target.value) }))}
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

                          <ActionBtn label="ترقية إلى Paid" icon="⭐" color={C.orange}
                            onClick={() => mutate.mutate({
                              url: `/api/super/companies/${co.id}`,
                              method: "PUT",
                              body: { plan_type: "paid" },
                            })} />

                          <div style={{ fontSize: "12px", color: C.muted, marginRight: "auto" }}>
                            تسجيل: {new Date(co.created_at).toLocaleDateString("ar-EG")}
                            &nbsp;·&nbsp;
                            انتهاء: {co.end_date}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
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
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}
