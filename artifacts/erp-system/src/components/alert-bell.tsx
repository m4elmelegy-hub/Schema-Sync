/**
 * AlertBell — smart, role-filtered notification center.
 *
 * Fetch strategy (NO polling):
 *   • Fetch list on mount + run daily check once per calendar day.
 *   • Manual refresh button re-fetches the list only.
 *   • Manual "فحص" forces a full run-checks (admin).
 *
 * Filters: Active | Unread | Resolved
 * Per-alert: mark read, resolve (تم الحل)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, RefreshCw, CheckCircle } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useAppSettings } from "@/contexts/app-settings";

interface Alert {
  id: number;
  type: string;
  severity: string;
  message: string;
  reference_id: string | null;
  trigger_mode: string;
  role_target: string | null;
  last_triggered_date: string | null;
  is_read: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: number | null;
  created_at: string;
}

type FilterTab = "active" | "unread" | "resolved";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DAILY_CHECK_KEY = "erp_daily_alert_check";

const TYPE_ICONS: Record<string, string> = {
  low_stock:        "📦",
  customer_debt:    "👤",
  supplier_payable: "🏭",
  cash_low:         "💰",
  health:           "🩺",
};

function todayStr() { return new Date().toISOString().split("T")[0]; }

export function AlertBell() {
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState<FilterTab>("active");
  const dropdownRef               = useRef<HTMLDivElement>(null);
  const { settings }              = useAppSettings();
  const isDark                    = (settings.theme ?? "dark") === "dark";

  /* ── derived counts ─────────────────────────────────────── */
  const active   = allAlerts.filter(a => !a.is_resolved);
  const unread   = active.filter(a => !a.is_read);
  const resolved = allAlerts.filter(a => a.is_resolved);
  const critical = active.filter(a => a.severity === "CRITICAL");

  const badgeCount = unread.length;
  const hasCritical = critical.length > 0;

  /* ── filtered list for the current tab ─────────────────── */
  const displayed: Alert[] = tab === "active"   ? active
                           : tab === "unread"   ? unread
                           : resolved;

  /* ── Fetch list (includes resolved when on resolved tab) ─ */
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/api/alerts?include_resolved=true`);
      if (res.ok) setAllAlerts(await res.json());
    } catch { /* silent */ }
  }, []);

  /* ── Daily check: once per calendar day ────────────────── */
  const runDailyCheckIfNeeded = useCallback(async () => {
    if (localStorage.getItem(DAILY_CHECK_KEY) === todayStr()) return;
    try {
      const res = await authFetch(`${BASE}/api/alerts/daily-check`, { method: "POST" });
      if (res.ok) {
        localStorage.setItem(DAILY_CHECK_KEY, todayStr());
        await fetchAlerts();
      }
    } catch { /* silent */ }
  }, [fetchAlerts]);

  useEffect(() => {
    fetchAlerts();
    runDailyCheckIfNeeded();
  }, [fetchAlerts, runDailyCheckIfNeeded]);

  /* ── Close on outside click ─────────────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Actions ────────────────────────────────────────────── */
  async function markRead(id: number) {
    await authFetch(`${BASE}/api/alerts/mark-read/${id}`, { method: "POST" });
    setAllAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
  }

  async function markAllRead() {
    setLoading(true);
    try {
      await authFetch(`${BASE}/api/alerts/mark-all-read`, { method: "POST" });
      setAllAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    } finally { setLoading(false); }
  }

  async function resolveAlert(id: number) {
    await authFetch(`${BASE}/api/alerts/resolve/${id}`, { method: "POST" });
    setAllAlerts(prev => prev.map(a =>
      a.id === id ? { ...a, is_resolved: true, resolved_at: new Date().toISOString() } : a
    ));
  }

  async function manualRefresh() {
    setLoading(true);
    try { await fetchAlerts(); } finally { setLoading(false); }
  }

  async function forceRunChecks() {
    setLoading(true);
    try {
      await authFetch(`${BASE}/api/alerts/run-checks`, { method: "POST" });
      await fetchAlerts();
    } finally { setLoading(false); }
  }

  /* ── Styles ─────────────────────────────────────────────── */
  const bgPanel  = isDark ? "#161f30" : "#ffffff";
  const border   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)";
  const textMain = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.85)";
  const textSub  = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.42)";
  const rowHover = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  function tabStyle(t: FilterTab) {
    const active = tab === t;
    return {
      fontSize: 11, fontWeight: 600,
      padding: "4px 10px", borderRadius: 7, cursor: "pointer",
      border: "none",
      background: active
        ? (isDark ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.14)")
        : "transparent",
      color: active ? "#f59e0b" : textSub,
      transition: "all 0.15s",
    } as React.CSSProperties;
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>

      {/* ── Bell Button ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "relative", padding: "7px", borderRadius: "10px",
          border: `1px solid ${border}`,
          background: open ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") : "transparent",
          cursor: "pointer", color: textMain,
          transition: "all 0.15s", display: "flex", alignItems: "center",
        }}
        title="التنبيهات"
      >
        <Bell style={{ width: 16, height: 16 }} />
        {badgeCount > 0 && (
          <span style={{
            position: "absolute", top: -4, left: -4,
            minWidth: 17, height: 17, borderRadius: 9,
            background: hasCritical ? "#ef4444" : "#f59e0b",
            color: "#fff", fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
          }}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ──────────────────────────────────── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)",
          left: "50%", transform: "translateX(-50%)",
          width: 360, maxHeight: 520,
          borderRadius: 14, background: bgPanel,
          border: `1px solid ${border}`,
          boxShadow: isDark ? "0 16px 48px rgba(0,0,0,0.65)" : "0 8px 32px rgba(0,0,0,0.13)",
          zIndex: 9999, display: "flex", flexDirection: "column",
          overflow: "hidden", direction: "rtl",
        }}>

          {/* Header row */}
          <div style={{
            padding: "10px 14px 0",
            borderBottom: `1px solid ${border}`,
          }}>
            {/* Title + action buttons */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: textMain }}>التنبيهات</span>
                {/* Badges */}
                {active.length > 0 && (
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600,
                    background: "rgba(245,158,11,0.14)", color: "#f59e0b",
                  }}>
                    {active.length} نشطة
                  </span>
                )}
                {hasCritical && (
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600,
                    background: "rgba(239,68,68,0.15)", color: "#ef4444",
                  }}>
                    {critical.length} حرجية
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={manualRefresh} disabled={loading}
                  title="تحديث القائمة"
                  style={{
                    padding: "3px 7px", borderRadius: 6, border: `1px solid ${border}`,
                    background: "transparent", color: textSub, cursor: "pointer", fontSize: 10,
                    display: "flex", alignItems: "center", gap: 3, opacity: loading ? 0.5 : 1,
                  }}>
                  <RefreshCw style={{ width: 10, height: 10 }} /> تحديث
                </button>
                <button onClick={forceRunChecks} disabled={loading}
                  title="فحص كامل"
                  style={{
                    padding: "3px 7px", borderRadius: 6, border: `1px solid ${border}`,
                    background: "transparent", color: textSub, cursor: "pointer", fontSize: 10,
                    opacity: loading ? 0.5 : 1,
                  }}>
                  🔍 فحص
                </button>
                {unread.length > 0 && (
                  <button onClick={markAllRead} disabled={loading}
                    style={{
                      padding: "3px 7px", borderRadius: 6, border: `1px solid ${border}`,
                      background: "transparent", color: textSub, cursor: "pointer", fontSize: 10,
                      opacity: loading ? 0.5 : 1,
                    }}>
                    قراءة الكل
                  </button>
                )}
              </div>
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 4, paddingBottom: 8 }}>
              <button style={tabStyle("active")} onClick={() => setTab("active")}>
                نشطة ({active.length})
              </button>
              <button style={tabStyle("unread")} onClick={() => setTab("unread")}>
                غير مقروءة ({unread.length})
              </button>
              <button style={tabStyle("resolved")} onClick={() => setTab("resolved")}>
                محلولة ({resolved.length})
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayed.length === 0 ? (
              <div style={{ padding: "36px 16px", textAlign: "center", color: textSub, fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>
                  {tab === "resolved" ? "📋" : "✅"}
                </div>
                {tab === "resolved" ? "لا توجد تنبيهات محلولة" : "لا توجد تنبيهات نشطة"}
              </div>
            ) : (
              displayed.map(alert => (
                <div key={alert.id}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${border}`,
                    background: alert.is_resolved
                      ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)")
                      : alert.is_read
                        ? "transparent"
                        : (isDark ? "rgba(245,158,11,0.05)" : "rgba(245,158,11,0.05)"),
                    display: "flex", gap: 10, alignItems: "flex-start",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.background = rowHover;
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.background = alert.is_resolved
                      ? (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)")
                      : alert.is_read ? "transparent"
                      : (isDark ? "rgba(245,158,11,0.05)" : "rgba(245,158,11,0.05)");
                  }}
                >
                  {/* Dot / resolved icon */}
                  <div style={{ marginTop: 4, flexShrink: 0 }}>
                    {alert.is_resolved ? (
                      <CheckCircle style={{ width: 14, height: 14, color: "#22c55e" }} />
                    ) : (
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", marginTop: 3,
                        background: alert.severity === "CRITICAL" ? "#ef4444" : "#f59e0b",
                      }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Message */}
                    <div style={{
                      fontSize: 12, fontWeight: 600, lineHeight: 1.45,
                      color: alert.is_resolved ? textSub : textMain,
                      wordBreak: "break-word",
                      textDecoration: alert.is_resolved ? "line-through" : "none",
                      opacity: alert.is_resolved ? 0.7 : 1,
                    }}>
                      {TYPE_ICONS[alert.type] ?? "⚠️"} {alert.message}
                    </div>

                    {/* Meta row */}
                    <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 10, padding: "1px 5px", borderRadius: 5, fontWeight: 600,
                        background: alert.severity === "CRITICAL" ? "rgba(239,68,68,0.14)" : "rgba(245,158,11,0.14)",
                        color: alert.severity === "CRITICAL" ? "#ef4444" : "#f59e0b",
                      }}>
                        {alert.severity === "CRITICAL" ? "حرجي" : "تحذير"}
                      </span>
                      <span style={{
                        fontSize: 10, padding: "1px 5px", borderRadius: 5,
                        background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
                        color: textSub,
                      }}>
                        {alert.trigger_mode === "daily" ? "يومي" : "فوري"}
                      </span>
                      <span style={{ fontSize: 10, color: textSub }}>
                        {new Date(alert.created_at).toLocaleString("ar-EG", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                      {!alert.is_read && !alert.is_resolved && (
                        <span style={{ fontSize: 10, color: "#f59e0b", marginRight: "auto" }}>● جديد</span>
                      )}
                      {alert.is_resolved && (
                        <span style={{ fontSize: 10, color: "#22c55e" }}>
                          ✓ {alert.resolved_by ? "محلول يدوياً" : "محلول تلقائياً"}
                        </span>
                      )}
                    </div>

                    {/* Action buttons (only for active alerts) */}
                    {!alert.is_resolved && (
                      <div style={{ marginTop: 6, display: "flex", gap: 5 }}>
                        {!alert.is_read && (
                          <button
                            onClick={() => markRead(alert.id)}
                            style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 5,
                              border: `1px solid ${border}`, background: "transparent",
                              color: textSub, cursor: "pointer",
                            }}>
                            تعليم كمقروء
                          </button>
                        )}
                        <button
                          onClick={() => resolveAlert(alert.id)}
                          style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 5,
                            border: "1px solid rgba(34,197,94,0.35)",
                            background: "rgba(34,197,94,0.08)",
                            color: "#22c55e", cursor: "pointer", fontWeight: 600,
                          }}>
                          ✓ تم الحل
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px",
            borderTop: `1px solid ${border}`,
            fontSize: 10, color: textSub, textAlign: "center",
          }}>
            الفحص اليومي يعمل تلقائياً عند تسجيل الدخول
          </div>
        </div>
      )}
    </div>
  );
}
