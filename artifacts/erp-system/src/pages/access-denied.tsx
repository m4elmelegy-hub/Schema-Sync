import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { ShieldOff, ArrowRight } from "lucide-react";

export default function AccessDenied() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      dir="rtl"
      style={{ background: "radial-gradient(ellipse at 50% 50%, #0d0d18 0%, #070709 100%)" }}
    >
      <div
        className="text-center px-8 py-12 rounded-3xl max-w-md w-full mx-4"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(239,68,68,0.18)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1.5px solid rgba(239,68,68,0.25)",
          }}
        >
          <ShieldOff className="w-9 h-9 text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black text-white mb-2">صلاحية مرفوضة</h1>
        <p className="text-white/40 text-sm mb-2">
          ليس لديك صلاحية للوصول إلى هذه الصفحة
        </p>

        {user && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mb-8"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.18)",
              color: "rgba(245,158,11,0.8)",
            }}
          >
            <span>دورك الحالي:</span>
            <span className="font-bold">{ROLE_LABELS[user.role] || user.role}</span>
          </div>
        )}

        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-2xl font-bold text-sm transition-all"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
          }}
        >
          <ArrowRight className="w-4 h-4" />
          العودة للرئيسية
        </button>
      </div>
    </div>
  );
}
