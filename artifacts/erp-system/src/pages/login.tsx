import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface ErpUser {
  id: number; name: string; username: string;
  pinLength: number; role: string; active: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير", manager: "مشرف",
  cashier: "كاشير", salesperson: "مندوب مبيعات",
};

const FEATURES = [
  { icon: "⚡", label: "مبيعات فورية", desc: "نقطة بيع سريعة وسهلة" },
  { icon: "📊", label: "تقارير ذكية", desc: "تحليلات مالية شاملة" },
  { icon: "🔒", label: "أمان تام",     desc: "صلاحيات متعددة المستويات" },
  { icon: "🏪", label: "إدارة المخزون", desc: "تتبع دقيق للمنتجات" },
];

export default function Login() {
  const { login }        = useAuth();
  const { settings }     = useAppSettings();
  const [, setLocation]  = useLocation();

  const [mode, setMode]           = useState<"login" | "register">("login");
  const [username, setUsername]   = useState("");
  const [pin, setPin]             = useState("");
  const [showPin, setShowPin]     = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [focused, setFocused]     = useState<"username" | "pin" | null>(null);

  const usernameRef = useRef<HTMLInputElement>(null);
  const pinRef      = useRef<HTMLInputElement>(null);

  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  const { data: users = [] } = useQuery<ErpUser[]>({
    queryKey: ["/api/auth/users"],
    queryFn: () =>
      fetch(api("/api/auth/users")).then((r) => {
        if (!r.ok) throw new Error("فشل جلب المستخدمين");
        return r.json();
      }),
  });

  const activeUsers = users.filter((u) => u.active !== false);

  useEffect(() => {
    setTimeout(() => usernameRef.current?.focus(), 300);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = username.trim();
    if (!trimmed) { setError("أدخل اسم المستخدم"); usernameRef.current?.focus(); return; }
    if (!pin)     { setError("أدخل الرقم السري");  pinRef.current?.focus(); return; }

    const matchedUser = activeUsers.find(
      (u) =>
        u.username.toLowerCase() === trimmed.toLowerCase() ||
        u.name === trimmed
    );

    if (!matchedUser) {
      setError("اسم المستخدم غير موجود");
      usernameRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(api("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: matchedUser.id, pin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "الرقم السري غير صحيح");
        setPin("");
        pinRef.current?.focus();
        return;
      }

      const { user: authedUser, token } = await res.json() as {
        user: { id: number; name: string; username: string; role: string };
        token: string;
      };

      login(authedUser, token);
      setLocation("/");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [username, pin, activeUsers, login, setLocation]);

  return (
    <div className="min-h-screen flex" style={{ direction: "rtl", background: "#f0f4ff" }}>

      {/* ═══════════════════════════════════════════════
          LEFT — Brand panel
      ═══════════════════════════════════════════════ */}
      <div className="hidden lg:flex w-[46%] relative flex-col items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(145deg, #1e40af 0%, #1d4ed8 40%, #2563eb 70%, #3b82f6 100%)" }}>

        {/* Decorative blobs */}
        <div style={{
          position: "absolute", top: "-80px", left: "-80px",
          width: "360px", height: "360px", borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
        }} />
        <div style={{
          position: "absolute", bottom: "-60px", right: "-60px",
          width: "300px", height: "300px", borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
        }} />
        <div style={{
          position: "absolute", top: "40%", left: "60%",
          width: "180px", height: "180px", borderRadius: "50%",
          background: "rgba(255,255,255,0.04)",
        }} />

        {/* Grid pattern */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

        {/* Content */}
        <div className="relative z-10 text-center px-12 max-w-[420px]" dir="rtl">

          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div style={{
              width: "88px", height: "88px", borderRadius: "24px",
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)",
            }}>
              <img
                src={logoSrc}
                alt="Logo"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) parent.innerHTML = '<span style="font-size:38px">🏪</span>';
                }}
                style={{ width: "56px", height: "56px", objectFit: "contain" }}
              />
            </div>
          </div>

          {/* App name */}
          <h1 style={{
            fontSize: "32px", fontWeight: 900, color: "#fff",
            marginBottom: "10px", letterSpacing: "-0.5px",
            textShadow: "0 2px 12px rgba(0,0,0,0.15)",
          }}>
            {settings.companyName || "Halal Tech ERP"}
          </h1>

          {/* Tagline */}
          <p style={{
            fontSize: "15px", color: "rgba(255,255,255,0.75)",
            marginBottom: "40px", lineHeight: 1.6,
          }}>
            {settings.companySlogan || "أدِر عملك باحترافية وثقة كاملة"}
          </p>

          {/* Feature list */}
          <div className="flex flex-col gap-3">
            {FEATURES.map((f) => (
              <div key={f.label} style={{
                display: "flex", alignItems: "center", gap: "14px",
                background: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "14px",
                padding: "12px 16px",
                textAlign: "right",
              }}>
                <span style={{ fontSize: "22px", flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{f.label}</div>
                  <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.6)", marginTop: "1px" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Version badge */}
        <div style={{
          position: "absolute", bottom: "24px",
          fontSize: "11px", color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.12em", fontWeight: 500,
        }}>
          HALAL TECH ERP v2.0
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          RIGHT — Auth form
      ═══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10"
        style={{ background: "#f0f4ff", minHeight: "100vh" }}>

        {/* Mobile logo */}
        <div className="flex lg:hidden flex-col items-center mb-8">
          <div style={{
            width: "64px", height: "64px", borderRadius: "18px",
            background: "linear-gradient(145deg, #1e40af, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: "10px",
            boxShadow: "0 6px 20px rgba(37,99,235,0.3)",
          }}>
            <img
              src={logoSrc}
              alt="Logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) parent.innerHTML = '<span style="font-size:28px">🏪</span>';
              }}
              style={{ width: "42px", height: "42px", objectFit: "contain" }}
            />
          </div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#1e3a8a" }}>
            {settings.companyName || "Halal Tech ERP"}
          </div>
        </div>

        {/* Card */}
        <div style={{
          width: "100%", maxWidth: "440px",
          background: "#fff",
          borderRadius: "24px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(37,99,235,0.08), 0 8px 24px rgba(0,0,0,0.06)",
          padding: "40px 36px",
          border: "1px solid rgba(219,234,254,0.8)",
        }}>

          {/* Tab toggle */}
          <div style={{
            display: "flex",
            background: "#f1f5f9",
            borderRadius: "12px",
            padding: "4px",
            marginBottom: "32px",
            gap: "4px",
          }}>
            {([["login", "تسجيل الدخول"], ["register", "إنشاء حساب"]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: "9px",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  background: mode === m ? "#fff" : "transparent",
                  color: mode === m ? "#1d4ed8" : "#64748b",
                  boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(219,234,254,0.8)" : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <LoginForm
              users={activeUsers}
              username={username}
              setUsername={setUsername}
              pin={pin}
              setPin={setPin}
              showPin={showPin}
              setShowPin={setShowPin}
              error={error}
              setError={setError}
              loading={loading}
              focused={focused}
              setFocused={setFocused}
              usernameRef={usernameRef}
              pinRef={pinRef}
              onSubmit={handleSubmit}
            />
          ) : (
            <RegisterInfo onSwitch={() => setMode("login")} />
          )}
        </div>

        {/* Footer */}
        <p style={{ marginTop: "24px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
          {settings.companyName || "Halal Tech ERP"} &copy; {new Date().getFullYear()}
        </p>
      </div>

      <style>{`
        @keyframes lp-shake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-8px); }
          30%      { transform: translateX(7px); }
          45%      { transform: translateX(-6px); }
          60%      { transform: translateX(5px); }
          75%      { transform: translateX(-3px); }
          90%      { transform: translateX(2px); }
        }
        .lp-input {
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .lp-input:focus {
          outline: none;
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12) !important;
        }
        .lp-btn-primary {
          transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .lp-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(37,99,235,0.35) !important;
        }
        .lp-btn-primary:active:not(:disabled) {
          transform: translateY(0px);
        }
        .lp-btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   LOGIN FORM
──────────────────────────────────────────────────────────── */
interface LoginFormProps {
  users: ErpUser[];
  username: string;
  setUsername: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  showPin: boolean;
  setShowPin: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  loading: boolean;
  focused: "username" | "pin" | null;
  setFocused: (v: "username" | "pin" | null) => void;
  usernameRef: React.RefObject<HTMLInputElement | null>;
  pinRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
}

function LoginForm({
  users, username, setUsername, pin, setPin, showPin, setShowPin,
  error, setError, loading, focused, setFocused, usernameRef, pinRef, onSubmit,
}: LoginFormProps) {

  const matchedUser = users.find(
    (u) =>
      u.username.toLowerCase() === username.trim().toLowerCase() ||
      u.name === username.trim()
  );

  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;
    const el = errorRef.current;
    if (el) {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "lp-shake 0.5s ease";
    }
  }, [error]);

  return (
    <form onSubmit={onSubmit} noValidate>

      {/* Heading */}
      <div style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "6px" }}>
          مرحباً بك 👋
        </h2>
        <p style={{ fontSize: "13.5px", color: "#64748b" }}>
          سجّل دخولك للمتابعة إلى لوحة التحكم
        </p>
      </div>

      {/* Username field */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
          اسم المستخدم
        </label>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", top: "50%", right: "14px",
            transform: "translateY(-50%)",
            fontSize: "16px", color: focused === "username" ? "#3b82f6" : "#94a3b8",
            pointerEvents: "none", transition: "color 0.2s",
          }}>
            👤
          </span>
          <input
            ref={usernameRef}
            type="text"
            value={username}
            autoComplete="username"
            placeholder="أدخل اسم المستخدم"
            disabled={loading}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            onFocus={() => setFocused("username")}
            onBlur={() => setFocused(null)}
            className="lp-input"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 44px 12px 40px",
              borderRadius: "12px",
              border: `1.5px solid ${focused === "username" ? "#3b82f6" : "#e2e8f0"}`,
              fontSize: "14px", color: "#0f172a",
              background: loading ? "#f8fafc" : "#fff",
              fontFamily: "inherit",
              direction: "rtl",
            }}
          />
          {/* User match indicator */}
          {username.trim() && (
            <span style={{
              position: "absolute", top: "50%", left: "14px",
              transform: "translateY(-50%)",
              fontSize: "14px",
            }}>
              {matchedUser ? "✅" : "❌"}
            </span>
          )}
        </div>
        {/* User suggestion */}
        {matchedUser && (
          <div style={{
            marginTop: "6px",
            display: "flex", alignItems: "center", gap: "8px",
            padding: "7px 11px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            fontSize: "12.5px", color: "#1d4ed8",
          }}>
            <span style={{
              background: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
              color: "#fff",
              width: "24px", height: "24px",
              borderRadius: "7px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 800, flexShrink: 0,
            }}>
              {matchedUser.name.charAt(0)}
            </span>
            <span>{matchedUser.name}</span>
            <span style={{
              marginRight: "auto",
              background: "#dbeafe",
              borderRadius: "6px",
              padding: "2px 8px",
              fontSize: "11px", fontWeight: 600,
            }}>
              {ROLE_LABELS[matchedUser.role] || matchedUser.role}
            </span>
          </div>
        )}
      </div>

      {/* PIN / Password field */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
          الرقم السري
        </label>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", top: "50%", right: "14px",
            transform: "translateY(-50%)",
            fontSize: "16px", color: focused === "pin" ? "#3b82f6" : "#94a3b8",
            pointerEvents: "none", transition: "color 0.2s",
          }}>
            🔒
          </span>
          <input
            ref={pinRef}
            type={showPin ? "text" : "password"}
            value={pin}
            autoComplete="current-password"
            placeholder="أدخل الرقم السري"
            disabled={loading}
            inputMode="numeric"
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
            onFocus={() => setFocused("pin")}
            onBlur={() => setFocused(null)}
            className="lp-input"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 44px 12px 44px",
              borderRadius: "12px",
              border: `1.5px solid ${focused === "pin" ? "#3b82f6" : "#e2e8f0"}`,
              fontSize: "14px", color: "#0f172a",
              background: loading ? "#f8fafc" : "#fff",
              fontFamily: "inherit",
              direction: "ltr",
              letterSpacing: pin && !showPin ? "0.3em" : "normal",
            }}
          />
          {/* Show/hide toggle */}
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            tabIndex={-1}
            style={{
              position: "absolute", top: "50%", left: "14px",
              transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: "16px", color: "#94a3b8", padding: "2px",
              lineHeight: 1,
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#3b82f6")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            title={showPin ? "إخفاء" : "إظهار"}
          >
            {showPin ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          ref={errorRef}
          style={{
            marginBottom: "16px",
            display: "flex", alignItems: "center", gap: "8px",
            padding: "11px 14px",
            background: "#fef2f2",
            border: "1.5px solid #fecaca",
            borderRadius: "10px",
            fontSize: "13px", color: "#dc2626",
            fontWeight: 500,
          }}
        >
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="lp-btn-primary"
        style={{
          width: "100%",
          padding: "13px 0",
          borderRadius: "12px",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: "15px", fontWeight: 700,
          color: "#fff",
          background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%)",
          boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          marginBottom: "20px",
        }}
      >
        {loading ? (
          <>
            <span style={{
              width: "18px", height: "18px",
              border: "2.5px solid rgba(255,255,255,0.3)",
              borderTopColor: "#fff",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.8s linear infinite",
            }} />
            جاري التحقق…
          </>
        ) : (
          <>
            <span>تسجيل الدخول</span>
            <span style={{ fontSize: "16px" }}>←</span>
          </>
        )}
      </button>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
        <span style={{ fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>أو</span>
        <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
      </div>

      {/* Users quick-select */}
      {users.length > 0 && (
        <div>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "10px", textAlign: "center" }}>
            اختر حسابك مباشرة
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
            {users.filter((u) => u.active !== false).slice(0, 5).map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={loading}
                onClick={() => { setUsername(u.username); setError(""); pinRef.current?.focus(); }}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "6px 12px 6px 10px",
                  borderRadius: "100px",
                  border: username === u.username ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                  background: username === u.username ? "#eff6ff" : "#f8fafc",
                  cursor: "pointer",
                  fontSize: "12.5px", fontWeight: 600,
                  color: username === u.username ? "#1d4ed8" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                <span style={{
                  width: "22px", height: "22px",
                  borderRadius: "7px",
                  background: "linear-gradient(135deg,#1d4ed8,#60a5fa)",
                  color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 800, flexShrink: 0,
                }}>
                  {u.name.charAt(0)}
                </span>
                {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────
   REGISTER INFO (ERP systems use admin-created accounts)
──────────────────────────────────────────────────────────── */
function RegisterInfo({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "6px" }}>
          إنشاء حساب جديد
        </h2>
        <p style={{ fontSize: "13.5px", color: "#64748b" }}>
          حسابات النظام تُدار من قِبَل المدير
        </p>
      </div>

      {/* Info card */}
      <div style={{
        background: "#eff6ff",
        border: "1.5px solid #bfdbfe",
        borderRadius: "16px",
        padding: "28px 24px",
        marginBottom: "24px",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "14px" }}>🔐</div>
        <p style={{ fontSize: "14px", color: "#1e40af", fontWeight: 600, marginBottom: "8px" }}>
          هذا نظام ERP مؤسسي
        </p>
        <p style={{ fontSize: "13px", color: "#3b82f6", lineHeight: 1.7 }}>
          لا يتاح تسجيل الحسابات بشكل مفتوح.
          <br />
          لإنشاء حساب جديد، تواصل مع مدير النظام
          <br />
          عبر صفحة <strong>الإعدادات ← المستخدمون</strong>.
        </p>
      </div>

      {/* Steps */}
      <div style={{
        background: "#f8fafc",
        borderRadius: "12px",
        padding: "16px",
        marginBottom: "24px",
        textAlign: "right",
      }}>
        {[
          ["1", "تواصل مع المدير"],
          ["2", "يُنشئ المدير حسابك"],
          ["3", "تستلم اسم المستخدم والرقم السري"],
          ["4", "سجّل دخولك 🎉"],
        ].map(([num, text]) => (
          <div key={num} style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "8px 0",
            borderBottom: num !== "4" ? "1px solid #e2e8f0" : "none",
          }}>
            <span style={{
              width: "24px", height: "24px", borderRadius: "8px",
              background: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
              color: "#fff", fontSize: "12px", fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              {num}
            </span>
            <span style={{ fontSize: "13px", color: "#374151" }}>{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onSwitch}
        style={{
          width: "100%", padding: "13px 0",
          borderRadius: "12px",
          border: "1.5px solid #3b82f6",
          background: "transparent",
          cursor: "pointer",
          fontSize: "14px", fontWeight: 700,
          color: "#1d4ed8",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        ← العودة لتسجيل الدخول
      </button>
    </div>
  );
}
