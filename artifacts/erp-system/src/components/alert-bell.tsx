import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useAppSettings } from "@/contexts/app-settings";

interface Alert {
  id: number;
  type: string;
  severity: string;
  message: string;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TYPE_ICONS: Record<string, string> = {
  low_stock:        "📦",
  customer_debt:    "👤",
  supplier_payable: "🏭",
  cash_low:         "💰",
  health:           "🩺",
};

export function AlertBell() {
  const [alerts, setAlerts]     = useState<Alert[]>([]);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const dropdownRef             = useRef<HTMLDivElement>(null);
  const { settings }            = useAppSettings();
  const isDark                  = (settings.theme ?? "dark") === "dark";

  const unread = alerts.filter(a => !a.is_read).length;

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/api/alerts`);
      if (res.ok) setAlerts(await res.json());
    } catch { /* silent */ }
  }, []);

  // Poll every 60 seconds
  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function markRead(id: number) {
    await authFetch(`${BASE}/api/alerts/mark-read/${id}`, { method: "POST" });
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
  }

  async function markAllRead() {
    setLoading(true);
    await authFetch(`${BASE}/api/alerts/mark-all-read`, { method: "POST" });
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    setLoading(false);
  }

  async function runChecks() {
    setLoading(true);
    try {
      await authFetch(`${BASE}/api/alerts/run-checks`, { method: "POST" });
      await fetchAlerts();
    } finally {
      setLoading(false);
    }
  }

  const bgPanel  = isDark ? "#1a2236" : "#ffffff";
  const border   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)";
  const textMain = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.85)";
  const textSub  = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.45)";
  const rowHover = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "relative",
          padding: "7px",
          borderRadius: "10px",
          border: `1px solid ${border}`,
          background: open
            ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)")
            : "transparent",
          cursor: "pointer",
          color: textMain,
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="التنبيهات"
      >
        <Bell style={{ width: 16, height: 16 }} />
        {unread > 0 && (
          <span style={{
            position: "absolute",
            top: -4,
            left: -4,
            minWidth: 17,
            height: 17,
            borderRadius: 9,
            background: unread > 0 && alerts.some(a => !a.is_read && a.severity === "CRITICAL") ? "#ef4444" : "#f59e0b",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            lineHeight: 1,
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: 340,
          maxHeight: 460,
          borderRadius: 14,
          background: bgPanel,
          border: `1px solid ${border}`,
          boxShadow: isDark
            ? "0 16px 48px rgba(0,0,0,0.60)"
            : "0 8px 32px rgba(0,0,0,0.12)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          direction: "rtl",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: textMain }}>التنبيهات</span>
              {unread > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "1px 7px",
                  borderRadius: 9, background: "rgba(245,158,11,0.15)", color: "#f59e0b"
                }}>
                  {unread} غير مقروءة
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={runChecks}
                disabled={loading}
                style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 7,
                  border: `1px solid ${border}`, background: "transparent",
                  color: textSub, cursor: "pointer",
                }}
                title="تحديث التنبيهات"
              >
                🔄 فحص
              </button>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={loading}
                  style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 7,
                    border: `1px solid ${border}`, background: "transparent",
                    color: textSub, cursor: "pointer",
                  }}
                >
                  قراءة الكل
                </button>
              )}
            </div>
          </div>

          {/* Alert List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {alerts.length === 0 ? (
              <div style={{
                padding: "32px 16px", textAlign: "center",
                color: textSub, fontSize: 13,
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                لا توجد تنبيهات
              </div>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  onClick={() => !alert.is_read && markRead(alert.id)}
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${border}`,
                    background: alert.is_read ? "transparent" : (
                      isDark ? "rgba(245,158,11,0.04)" : "rgba(245,158,11,0.05)"
                    ),
                    cursor: alert.is_read ? "default" : "pointer",
                    transition: "background 0.15s",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                  onMouseEnter={e => {
                    if (!alert.is_read) (e.currentTarget as HTMLDivElement).style.background = rowHover;
                  }}
                  onMouseLeave={e => {
                    if (!alert.is_read) (e.currentTarget as HTMLDivElement).style.background =
                      isDark ? "rgba(245,158,11,0.04)" : "rgba(245,158,11,0.05)";
                    else (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {/* Severity dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", marginTop: 5, shrink: 0,
                    background: alert.severity === "CRITICAL" ? "#ef4444" : "#f59e0b",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: textMain,
                      lineHeight: 1.4, wordBreak: "break-word",
                    }}>
                      {TYPE_ICONS[alert.type] || "⚠️"} {alert.message}
                    </div>
                    <div style={{
                      marginTop: 3, display: "flex", gap: 8, alignItems: "center",
                    }}>
                      <span style={{
                        fontSize: 10, padding: "1px 6px", borderRadius: 6, fontWeight: 600,
                        background: alert.severity === "CRITICAL"
                          ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                        color: alert.severity === "CRITICAL" ? "#ef4444" : "#f59e0b",
                      }}>
                        {alert.severity === "CRITICAL" ? "حرجي" : "تحذير"}
                      </span>
                      <span style={{ fontSize: 10, color: textSub }}>
                        {new Date(alert.created_at).toLocaleString("ar-EG", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                      {!alert.is_read && (
                        <span style={{ fontSize: 10, color: "#f59e0b", marginRight: "auto" }}>
                          ● جديد
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
