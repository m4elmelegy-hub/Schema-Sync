/**
 * SubscriptionBanner — shows a warning/error strip when the company
 * subscription is about to expire or has already expired.
 *
 * • ≤ 7 days remaining  → amber warning banner
 * • Expired / deactivated → red error banner
 * • No subscription or > 7 days → nothing rendered
 */
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (path: string) => `${BASE}${path}`;

interface SubscriptionStatus {
  hasSubscription: boolean;
  companyName?: string;
  planLabel?: string;
  endDate?: string;
  daysRemaining?: number;
  isActive?: boolean;
  valid?: boolean;
  reason?: string;
}

const WARN_DAYS = 7;
const POLL_MS   = 5 * 60 * 1000; // refresh every 5 minutes

export function SubscriptionBanner() {
  const [status, setStatus]   = useState<SubscriptionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  async function fetchStatus() {
    try {
      const token = localStorage.getItem("erp_auth_token");
      if (!token) return;
      const res = await fetch(api("/api/subscription/status"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: SubscriptionStatus = await res.json();
      setStatus(data);
      setDismissed(false); // reset dismiss on new data
    } catch {
      // silent — banner is non-critical
    }
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (!status?.hasSubscription) return null;

  const days    = status.daysRemaining ?? 0;
  const expired = !status.valid;
  const warning = !expired && days <= WARN_DAYS;

  if (!expired && !warning) return null;
  if (dismissed && warning)  return null; // allow dismiss only for warnings, not errors

  const isRed = expired;

  return (
    <div
      dir="rtl"
      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium shadow-sm
        ${isRed
          ? "bg-red-600/90 text-white border-b border-red-700"
          : "bg-amber-500/90 text-white border-b border-amber-600"
        }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {isRed
            ? status.reason ?? "انتهت صلاحية الاشتراك — تواصل مع المدير لتجديد الخطة"
            : `تنبيه: اشتراك ${status.companyName ?? ""} (${status.planLabel ?? ""}) ينتهي خلال ${days} يوم — يرجى التجديد`}
        </span>
      </div>

      {warning && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="إخفاء التنبيه"
          className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
