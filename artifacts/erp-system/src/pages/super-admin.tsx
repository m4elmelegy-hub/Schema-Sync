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

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active:    { bg: "#f0fdf4", text: "#16a34a", label: "نشط"      },
  trial:     { bg: "#fefce8", text: "#ca8a04", label: "تجريبي"   },
  expired:   { bg: "#fef2f2", text: "#dc2626", label: "منتهي"    },
  suspended: { bg: "#f3f4f6", text: "#6b7280", label: "موقوف"    },
};

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function SuperAdmin() {
  const { user, token, logout }   = useAuth();
  const [, setLocation] = useLocation();
  const qc              = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [extendDays,  setExtendDays]  = useState<Record<number, number>>({});

  /* Redirect non-super_admin */
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/super/companies"] }); qc.invalidateQueries({ queryKey: ["/api/super/stats"] }); },
  });

  const pillStyle = (status: string) => {
    const c = STATUS_COLORS[status] ?? STATUS_COLORS.active;
    return { background: c.bg, color: c.text, padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, display: "inline-block" };
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f8faff", fontFamily: "inherit" }}>
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg,#0f0c29 0%,#302b63 100%)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "24px" }}>🛡️</div>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 900, color: "#fff" }}>لوحة المدير العام</div>
            <div style={{ fontSize: "12px", color: "rgba(196,181,253,0.7)" }}>SaaS Control Panel</div>
          </div>
        </div>
        <button
          onClick={logout}
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", color: "#fff", padding: "8px 18px", cursor: "pointer", fontSize: "13px", fontWeight: 700 }}
        >
          تسجيل الخروج
        </button>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 24px" }}>
        {/* ── Stats cards ─────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "16px", marginBottom: "28px" }}>
          {[
            { label: "إجمالي الشركات", value: stats?.total ?? "—",   icon: "🏢", color: "#4f46e5" },
            { label: "نشطة",            value: stats?.active ?? "—",   icon: "✅", color: "#16a34a" },
            { label: "تجريبية",         value: stats?.trial ?? "—",    icon: "⏳", color: "#ca8a04" },
            { label: "منتهية",          value: stats?.expired ?? "—",  icon: "⚠️", color: "#dc2626" },
            { label: "موقوفة",          value: stats?.suspended ?? "—",icon: "⛔", color: "#6b7280" },
            { label: "المستخدمون",      value: stats?.totalUsers ?? "—",icon: "👥", color: "#7c3aed" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", padding: "18px 16px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "28px", marginBottom: "6px" }}>{s.icon}</div>
              <div style={{ fontSize: "28px", fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px", fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Companies table ──────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: "20px", border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#111827" }}>الشركات المسجّلة</h2>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>{companies.length} شركة</div>
          </div>

          {isLoading ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#9ca3af" }}>جاري التحميل...</div>
          ) : companies.length === 0 ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#9ca3af" }}>لا توجد شركات مسجّلة بعد</div>
          ) : (
            <div>
              {companies.map((co) => {
                const isExpanded = expandedId === co.id;
                const days = co.daysRemaining;
                const st   = STATUS_COLORS[co.status] ?? STATUS_COLORS.active;
                return (
                  <div key={co.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                    {/* ── Row ── */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : co.id)}
                      style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: "16px", cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* ID badge */}
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 900, color: "#6d28d9", flexShrink: 0 }}>
                        #{co.id}
                      </div>

                      {/* Name + email */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "15px", fontWeight: 800, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{co.name}</div>
                        <div style={{ fontSize: "12px", color: "#9ca3af", direction: "ltr", textAlign: "right" }}>{co.admin_email ?? "—"}</div>
                      </div>

                      {/* Status */}
                      <span style={pillStyle(co.status)}>{st.label}</span>

                      {/* Days */}
                      <div style={{ textAlign: "center", minWidth: "60px" }}>
                        <div style={{ fontSize: "16px", fontWeight: 900, color: days < 0 ? "#dc2626" : days < 3 ? "#ca8a04" : "#16a34a" }}>{days < 0 ? "منتهي" : `${days}ي`}</div>
                        <div style={{ fontSize: "10px", color: "#9ca3af" }}>متبقي</div>
                      </div>

                      {/* Users */}
                      <div style={{ textAlign: "center", minWidth: "44px" }}>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#4f46e5" }}>{co.userCount}</div>
                        <div style={{ fontSize: "10px", color: "#9ca3af" }}>مستخدم</div>
                      </div>

                      {/* Chevron */}
                      <div style={{ fontSize: "12px", color: "#9ca3af", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>▶</div>
                    </div>

                    {/* ── Expanded actions ── */}
                    {isExpanded && (
                      <div style={{ padding: "16px 24px 20px", background: "#f9fafb", borderTop: "1px solid #f3f4f6" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>

                          {/* Activate */}
                          {!co.is_active && (
                            <ActionBtn
                              label="تفعيل الشركة" icon="✅" color="#16a34a"
                              onClick={() => mutate.mutate({ url: `/api/super/companies/${co.id}/activate` })}
                            />
                          )}

                          {/* Suspend */}
                          {co.is_active && (
                            <ActionBtn
                              label="إيقاف الشركة" icon="⛔" color="#dc2626"
                              onClick={() => mutate.mutate({ url: `/api/super/companies/${co.id}/suspend` })}
                            />
                          )}

                          {/* Extend */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <select
                              value={extendDays[co.id] ?? 7}
                              onChange={(e) => setExtendDays(prev => ({ ...prev, [co.id]: Number(e.target.value) }))}
                              style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "7px 10px", fontSize: "13px", background: "#fff" }}
                            >
                              {[7, 14, 30, 90, 365].map(d => <option key={d} value={d}>{d} يوم</option>)}
                            </select>
                            <ActionBtn
                              label="تمديد" icon="⏳" color="#ca8a04"
                              onClick={() => mutate.mutate({
                                url: `/api/super/companies/${co.id}/extend`,
                                body: { days: extendDays[co.id] ?? 7, plan_type: "paid" },
                              })}
                            />
                          </div>

                          {/* Plan upgrade */}
                          <ActionBtn
                            label="ترقية إلى Paid" icon="⭐" color="#7c3aed"
                            onClick={() => mutate.mutate({
                              url: `/api/super/companies/${co.id}`,
                              method: "PUT",
                              body: { plan_type: "paid" },
                            })}
                          />

                          {/* Info */}
                          <div style={{ fontSize: "12px", color: "#6b7280", marginRight: "auto" }}>
                            تسجيل: {new Date(co.created_at).toLocaleDateString("ar-EG")} &nbsp;·&nbsp; انتهاء: {co.end_date}
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
        border: `1.5px solid ${color}22`,
        background: `${color}12`, color,
        fontSize: "13px", fontWeight: 700,
        cursor: "pointer", transition: "all 0.15s",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}22`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = `${color}12`; }}
    >
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}
