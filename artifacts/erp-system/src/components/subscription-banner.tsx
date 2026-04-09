/**
 * SubscriptionBanner — warning strip when subscription nears expiry.
 * • 8-14 days  → yellow banner (#FEF3C7)
 * • 1-7 days   → orange banner (#FED7AA) with ⚠️ icon
 * • 0 or less  → nothing (SubscriptionExpired page takes over)
 * • super_admin → never shown
 * Dismissed per login session (resets on next login).
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (path: string) => `${BASE}${path}`;

interface SubStatus {
  unlimited?: boolean;
  days_left?: number;
  company_name?: string;
  plan_type?: string;
  is_active?: boolean;
  is_expiring_soon?: boolean;
  is_expired?: boolean;
}

interface SupportSettings {
  support_whatsapp?: string;
  support_email?: string;
}

const POLL_MS = 5 * 60 * 1000;

export function SubscriptionBanner() {
  const { user } = useAuth();
  const [status,    setStatus]    = useState<SubStatus | null>(null);
  const [support,   setSupport]   = useState<SupportSettings>({});
  const [dismissed, setDismissed] = useState(false);

  async function fetchStatus() {
    try {
      const token = localStorage.getItem("erp_auth_token");
      if (!token) return;
      const res = await fetch(api("/api/auth/subscription"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: SubStatus = await res.json();
      setStatus(data);
    } catch { /* silent */ }
  }

  async function fetchSupport() {
    try {
      const token = localStorage.getItem("erp_auth_token");
      if (!token) return;
      const res = await fetch(api("/api/settings/system"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as Record<string, string>;
      setSupport({
        support_whatsapp: data["support_whatsapp"] ?? "",
        support_email:    data["support_email"] ?? "",
      });
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchStatus();
    fetchSupport();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (!user || user.role === "super_admin") return null;
  if (!status || status.unlimited)          return null;
  if (dismissed)                            return null;

  const days = status.days_left ?? 0;

  if (days <= 0 || !status.is_expiring_soon) return null;

  const isOrange = days <= 7;
  const bg       = isOrange ? "#FED7AA" : "#FEF3C7";
  const text     = isOrange ? "#7C2D12" : "#78350F";
  const border   = isOrange ? "#FB923C" : "#FCD34D";

  const contactHref = support.support_whatsapp
    ? `https://wa.me/${support.support_whatsapp.replace(/\D/g, "")}`
    : support.support_email
      ? `mailto:${support.support_email}`
      : null;

  return (
    <div
      dir="rtl"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "12px", padding: "10px 18px",
        background: bg, borderBottom: `1.5px solid ${border}`,
        color: text, fontSize: "13px", fontWeight: 600,
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
        {isOrange && <span style={{ fontSize: "16px" }}>⚠️</span>}
        <span>
          {isOrange
            ? `⚠️ ينتهي اشتراك ${status.company_name ?? ""} خلال ${days} ${days === 1 ? "يوم" : "أيام"} — تواصل معنا للتجديد`
            : `ينتهي اشتراك ${status.company_name ?? ""} خلال ${days} يوم`}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {contactHref && (
          <a
            href={contactHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "5px 14px", borderRadius: "8px",
              background: isOrange ? "#EA580C" : "#D97706",
              color: "#fff", fontSize: "12px", fontWeight: 700,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            تواصل للتجديد
          </a>
        )}
        <button
          onClick={() => setDismissed(true)}
          aria-label="إغلاق"
          style={{ background: "none", border: "none", cursor: "pointer", color: text, opacity: 0.7, padding: "2px" }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
