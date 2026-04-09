import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { useLocation } from "wouter";
import { translateRole } from "@/lib/roles";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface ErpUser {
  id: number; name: string; username: string;
  pinLength: number; role: string; active: boolean;
}

const FEATURES = [
  { icon: "⚡", label: "مبيعات فورية", desc: "نقطة بيع سريعة وسهلة" },
  { icon: "📊", label: "تقارير ذكية",  desc: "تحليلات مالية شاملة"  },
  { icon: "🔒", label: "أمان تام",      desc: "صلاحيات متعددة المستويات" },
  { icon: "🏪", label: "إدارة المخزون", desc: "تتبع دقيق للمنتجات"  },
];

export default function Login() {
  const { login }       = useAuth();
  const { settings }    = useAppSettings();
  const [, setLocation] = useLocation();

  const [mode, setMode]         = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [pin, setPin]           = useState("");
  const [showPin, setShowPin]   = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [focused, setFocused]   = useState<"username" | "pin" | null>(null);

  /* ── 2FA state ─── */
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken,   setTempToken]   = useState("");
  const [totpCode,    setTotpCode]    = useState("");
  const [totpLoading, setTotpLoading] = useState(false);

  const handleRegisterSuccess = useCallback((
    user: { id: number; name: string; username: string; role: string; active?: boolean; warehouse_id?: number | null; safe_id?: number | null; permissions?: Record<string, boolean> },
    token: string
  ) => {
    login(user, token);
    setLocation("/");
  }, [login, setLocation]);

  const usernameRef = useRef<HTMLInputElement>(null);
  const pinRef      = useRef<HTMLInputElement>(null);

  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  /* company_id: read from localStorage (set after login) or URL param, default 1 */
  const storedCompanyId = typeof window !== "undefined"
    ? (Number(new URLSearchParams(window.location.search).get("company_id")) ||
       Number(localStorage.getItem("erp_company_id")) || 1)
    : 1;

  const { data: users = [] } = useQuery<ErpUser[]>({
    queryKey: ["/api/auth/users", storedCompanyId],
    queryFn: () =>
      fetch(api(`/api/auth/users?company_id=${storedCompanyId}`)).then((r) => {
        if (!r.ok) throw new Error("فشل جلب المستخدمين");
        return r.json();
      }),
  });

  const activeUsers = users.filter((u) => u.active !== false);

  useEffect(() => { setTimeout(() => usernameRef.current?.focus(), 400); }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = username.trim();
    if (!trimmed) { setError("أدخل اسم المستخدم"); usernameRef.current?.focus(); return; }
    if (!pin)     { setError("أدخل الرقم السري");  pinRef.current?.focus(); return; }

    const matchedUser = activeUsers.find(
      (u) => u.username.toLowerCase() === trimmed.toLowerCase() || u.name === trimmed
    );
    if (!matchedUser) { setError("اسم المستخدم غير موجود"); usernameRef.current?.focus(); return; }

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
      const responseData = await res.json() as {
        requires_2fa?: boolean; temp_token?: string; message?: string;
        user?: { id: number; name: string; username: string; role: string; active?: boolean; warehouse_id?: number | null; safe_id?: number | null; permissions?: Record<string, boolean>; company_id?: number | null };
        token?: string;
      };

      /* ── 2FA required — switch to TOTP step ─── */
      if (responseData.requires_2fa && responseData.temp_token) {
        setTempToken(responseData.temp_token);
        setRequires2FA(true);
        setLoading(false);
        return;
      }

      const { user: authedUser, token } = responseData as {
        user: { id: number; name: string; username: string; role: string; active?: boolean; warehouse_id?: number | null; safe_id?: number | null; permissions?: Record<string, boolean>; company_id?: number | null };
        token: string;
      };
      if (authedUser.role === "cashier" || authedUser.role === "salesperson") {
        if (!authedUser.warehouse_id) {
          setError("هذا المستخدم غير مرتبط بمخزن — راجع المدير");
          setLoading(false); return;
        }
        if (!authedUser.safe_id) {
          setError("هذا المستخدم غير مرتبط بخزنة — راجع المدير");
          setLoading(false); return;
        }
      }
      /* Store company_id for future login-page user-list fetches */
      if (authedUser.company_id) {
        localStorage.setItem("erp_company_id", String(authedUser.company_id));
      }
      login(authedUser, token);
      setLocation("/");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [username, pin, activeUsers, login, setLocation]);

  const handleTotpSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) { setError("أدخل 6 أرقام"); return; }
    setTotpLoading(true); setError("");
    try {
      const res = await fetch(api("/api/auth/2fa/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temp_token: tempToken, totp_code: totpCode }),
      });
      const data = await res.json() as {
        token?: string; refreshToken?: string;
        user?: { id: number; name: string; username: string; role: string; company_id?: number | null };
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        setError(data.error ?? "رمز التحقق غير صحيح");
        setTotpCode("");
        return;
      }
      login(data.user as Parameters<typeof login>[0], data.token);
      setLocation("/");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setTotpLoading(false);
    }
  }, [totpCode, tempToken, login, setLocation]);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "row-reverse",
        fontFamily: "inherit",
        background: "#f8faff",
      }}
    >
      {/* ════════════════════════════════════════════════════
          BRAND PANEL  (dark blue → purple, RTL = left side)
      ════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:flex"
        style={{
          width: "46%",
          position: "relative",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background:
            "linear-gradient(145deg, #0f0c29 0%, #1a1040 25%, #302b63 60%, #24243e 100%)",
        }}
      >
        {/* ── Glowing animated blobs ───────────────────── */}
        <div className="lp-blob lp-blob-1" />
        <div className="lp-blob lp-blob-2" />
        <div className="lp-blob lp-blob-3" />

        {/* ── Subtle dot-grid ──────────────────────────── */}
        <div
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 80% 80% at 50% 50%, #000 60%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 80% at 50% 50%, #000 60%, transparent 100%)",
          }}
        />

        {/* ── Frosted inner glow ring ───────────────────── */}
        <div
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "500px", height: "500px",
            borderRadius: "50%",
            border: "1px solid rgba(167,139,250,0.12)",
            pointerEvents: "none",
          }}
        />

        {/* ── Content ───────────────────────────────────── */}
        <div
          className="relative z-10 flex flex-col items-center text-center px-12"
          style={{ maxWidth: "400px" }}
          dir="rtl"
        >
          {/* Logo */}
          <div
            style={{
              width: "100px", height: "100px",
              borderRadius: "28px",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
              border: "1.5px solid rgba(255,255,255,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "28px",
              boxShadow:
                "0 0 0 1px rgba(251,191,36,0.2)," +
                "0 0 40px rgba(251,191,36,0.25)," +
                "0 20px 60px rgba(0,0,0,0.5)," +
                "inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <img
              src={logoSrc}
              alt="Logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const p = (e.target as HTMLImageElement).parentElement;
                if (p) p.innerHTML = '<span style="font-size:44px">🏪</span>';
              }}
              style={{ width: "64px", height: "64px", objectFit: "contain", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))" }}
            />
          </div>

          {/* Company name */}
          <h1
            style={{
              fontSize: "34px", fontWeight: 900, color: "#fff",
              marginBottom: "10px", letterSpacing: "-0.5px",
              textShadow: "0 2px 24px rgba(167,139,250,0.4)",
              lineHeight: 1.1,
            }}
          >
            {settings.companyName || "Halal Tech ERP"}
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontSize: "15px", color: "rgba(196,181,253,0.85)",
              marginBottom: "44px", lineHeight: 1.7,
            }}
          >
            {settings.companySlogan || "أدِر عملك باحترافية وثقة كاملة"}
          </p>

          {/* Feature pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
            {FEATURES.map((f) => (
              <div
                key={f.label}
                style={{
                  display: "flex", alignItems: "center", gap: "14px",
                  background: "rgba(255,255,255,0.06)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "16px",
                  padding: "14px 18px",
                  textAlign: "right",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              >
                <span style={{
                  fontSize: "24px", flexShrink: 0,
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
                }}>
                  {f.icon}
                </span>
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#e2d9f3" }}>{f.label}</div>
                  <div style={{ fontSize: "12px", color: "rgba(196,181,253,0.65)", marginTop: "2px" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Version badge */}
        <div
          style={{
            position: "absolute", bottom: "24px",
            fontSize: "11px", color: "rgba(196,181,253,0.3)",
            letterSpacing: "0.14em", fontWeight: 500,
          }}
        >
          HALAL TECH ERP v2.0
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          FORM PANEL  (right in LTR, left in RTL)
      ════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          minHeight: "100vh",
          background:
            "linear-gradient(160deg, #f8faff 0%, #eff3ff 50%, #f3f0ff 100%)",
        }}
      >
        {/* Mobile logo */}
        <div
          className="flex lg:hidden flex-col items-center"
          style={{ marginBottom: "32px" }}
        >
          <div
            style={{
              width: "72px", height: "72px",
              borderRadius: "20px",
              background: "linear-gradient(145deg, #1a1040, #302b63)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "12px",
              boxShadow:
                "0 0 32px rgba(167,139,250,0.3)," +
                "0 8px 24px rgba(0,0,0,0.2)",
            }}
          >
            <img
              src={logoSrc}
              alt="Logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const p = (e.target as HTMLImageElement).parentElement;
                if (p) p.innerHTML = '<span style="font-size:32px">🏪</span>';
              }}
              style={{ width: "48px", height: "48px", objectFit: "contain" }}
            />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#1e1b4b" }}>
            {settings.companyName || "Halal Tech ERP"}
          </div>
        </div>

        {/* ── Card ──────────────────────────────────────── */}
        <div
          style={{
            width: "100%",
            maxWidth: "460px",
            background: "#fff",
            borderRadius: "24px",
            border: "1px solid rgba(200,185,255,0.65)",
            boxShadow:
              "0 0 0 1px rgba(167,139,250,0.10)," +
              "0 4px 8px rgba(0,0,0,0.04)," +
              "0 28px 100px rgba(99,57,206,0.14)," +
              "0 8px 48px rgba(0,0,0,0.08)," +
              "0 0 80px rgba(167,139,250,0.07)",
            padding: "44px 40px",
          }}
        >
          {/* ── 2FA Step ─── */}
          {requires2FA ? (
            <form onSubmit={handleTotpSubmit} noValidate>
              <div style={{ marginBottom: "28px", textAlign: "center" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔐</div>
                <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#0f0c29", marginBottom: "8px" }}>التحقق الثنائي</h2>
                <p style={{ fontSize: "13px", color: "#7c6fa0", lineHeight: 1.6 }}>
                  افتح تطبيق <strong>Google Authenticator</strong> أو <strong>Authy</strong><br />وأدخل الرمز المكون من 6 أرقام
                </p>
              </div>

              {error && (
                <div style={{ padding: "10px 14px", borderRadius: "10px", marginBottom: "16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444", fontSize: "13px", fontWeight: 700, textAlign: "center" }}>
                  {error}
                </div>
              )}

              <input
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && totpCode.length === 6) void handleTotpSubmit(e as unknown as React.FormEvent); }}
                placeholder="• • • • • •"
                inputMode="numeric"
                autoFocus
                style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "1.5px solid rgba(124,58,237,0.3)", fontSize: "32px", letterSpacing: "14px", textAlign: "center", fontFamily: "monospace", color: "#0f0c29", background: "#fdfbff", outline: "none", boxSizing: "border-box", marginBottom: "16px" }}
                maxLength={6}
              />

              <button type="submit" disabled={totpLoading || totpCode.length !== 6}
                className="lp-btn-primary"
                style={{ width: "100%", padding: "14px", borderRadius: "14px", border: "none", background: totpCode.length === 6 ? "linear-gradient(135deg, #f97316, #ea580c)" : "#e5e7eb", color: totpCode.length === 6 ? "#fff" : "#9ca3af", fontSize: "15px", fontWeight: 800, cursor: totpCode.length !== 6 ? "not-allowed" : "pointer", marginBottom: "14px" }}>
                {totpLoading ? "جاري التحقق..." : "تحقق →"}
              </button>

              <button type="button" onClick={() => { setRequires2FA(false); setTempToken(""); setTotpCode(""); setError(""); setPin(""); }}
                style={{ width: "100%", padding: "10px", borderRadius: "12px", border: "1px solid #e0d9f0", background: "transparent", color: "#7c6fa0", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                ← رجوع لإدخال الرقم السري
              </button>
            </form>
          ) : (
            <>
          {/* Tab toggle */}
          <div
            style={{
              display: "flex",
              background: "#f1f0ff",
              borderRadius: "14px",
              padding: "5px",
              marginBottom: "36px",
              gap: "5px",
            }}
          >
            {([["login", "تسجيل الدخول"], ["register", "حساب جديد"]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: "10px",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  background: mode === m
                    ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
                    : "transparent",
                  color: mode === m ? "#fff" : "#7c6fa0",
                  boxShadow: mode === m
                    ? "0 4px 12px rgba(99,57,206,0.3), 0 1px 4px rgba(0,0,0,0.1)"
                    : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <LoginForm
              users={activeUsers}
              username={username} setUsername={setUsername}
              pin={pin} setPin={setPin}
              showPin={showPin} setShowPin={setShowPin}
              error={error} setError={setError}
              loading={loading}
              focused={focused} setFocused={setFocused}
              usernameRef={usernameRef} pinRef={pinRef}
              onSubmit={handleSubmit}
            />
          ) : (
            <RegisterForm onSuccess={handleRegisterSuccess} onSwitch={() => setMode("login")} />
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <p
          style={{
            marginTop: "28px",
            fontSize: "12px",
            color: "#a89cc8",
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        >
          {settings.companyName || "Halal Tech ERP"} &copy; {new Date().getFullYear()}
          &nbsp;·&nbsp; جميع الحقوق محفوظة
        </p>
      </div>

      {/* ════════════════════════════════════════════════════
          Global styles
      ════════════════════════════════════════════════════ */}
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
        @keyframes lp-float-1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%     { transform: translate(30px,-40px) scale(1.08); }
          66%     { transform: translate(-20px,20px) scale(0.95); }
        }
        @keyframes lp-float-2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%     { transform: translate(-40px,30px) scale(1.1); }
          70%     { transform: translate(20px,-20px) scale(0.92); }
        }
        @keyframes lp-float-3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%     { transform: translate(20px,40px) scale(1.06); }
        }
        @keyframes lp-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .lp-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          pointer-events: none;
        }
        .lp-blob-1 {
          width: 420px; height: 420px;
          top: -120px; right: -80px;
          background: radial-gradient(circle, rgba(124,58,237,0.45) 0%, transparent 70%);
          animation: lp-float-1 12s ease-in-out infinite;
        }
        .lp-blob-2 {
          width: 360px; height: 360px;
          bottom: -100px; left: -80px;
          background: radial-gradient(circle, rgba(79,70,229,0.4) 0%, transparent 70%);
          animation: lp-float-2 15s ease-in-out infinite;
        }
        .lp-blob-3 {
          width: 260px; height: 260px;
          top: 45%; left: 30%;
          background: radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 70%);
          animation: lp-float-3 10s ease-in-out infinite;
        }

        /* Input base */
        .lp-input {
          transition: border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
        }
        .lp-input:focus {
          outline: none;
          border-color: #7c3aed !important;
          box-shadow: 0 0 0 4px rgba(124,58,237,0.18), 0 4px 20px rgba(124,58,237,0.10) !important;
          background: #fdfbff !important;
        }

        /* Primary button */
        .lp-btn-primary {
          position: relative;
          overflow: hidden;
          transition: transform 0.18s cubic-bezier(.34,1.56,.64,1),
                      box-shadow 0.20s ease,
                      filter 0.18s ease;
        }
        .lp-btn-primary::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(255,255,255,0.22) 40%,
            rgba(255,255,255,0.36) 50%,
            rgba(255,255,255,0.22) 60%,
            transparent 100%
          );
          transform: translateX(-150%);
          transition: transform 0s;
          pointer-events: none;
        }
        .lp-btn-primary:hover:not(:disabled)::after {
          transform: translateX(150%);
          transition: transform 0.55s ease;
        }
        .lp-btn-primary:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 16px 40px rgba(99,57,206,0.55), 0 4px 16px rgba(0,0,0,0.12) !important;
          filter: brightness(1.06);
        }
        .lp-btn-primary:active:not(:disabled) {
          transform: translateY(0) scale(0.97);
          box-shadow: 0 4px 12px rgba(99,57,206,0.28) !important;
          filter: brightness(0.96);
        }
        .lp-btn-primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        @keyframes lp-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .lp-spinner {
          animation: lp-spin 0.75s linear infinite;
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   LOGIN FORM
────────────────────────────────────────────────────────── */
interface LoginFormProps {
  users: ErpUser[];
  username: string; setUsername: (v: string) => void;
  pin: string; setPin: (v: string) => void;
  showPin: boolean; setShowPin: (v: boolean) => void;
  error: string; setError: (v: string) => void;
  loading: boolean;
  focused: "username" | "pin" | null; setFocused: (v: "username" | "pin" | null) => void;
  usernameRef: React.RefObject<HTMLInputElement | null>;
  pinRef:      React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
}

function LoginForm({
  users, username, setUsername, pin, setPin, showPin, setShowPin,
  error, setError, loading, focused, setFocused, usernameRef, pinRef, onSubmit,
}: LoginFormProps) {

  const matchedUser = users.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase() || u.name === username.trim()
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
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{
          fontSize: "26px", fontWeight: 900, color: "#0f0c29",
          marginBottom: "8px", letterSpacing: "-0.4px", lineHeight: 1.2,
        }}>
          مرحباً بك 👋
        </h2>
        <p style={{ fontSize: "14px", color: "#7c6fa0", lineHeight: 1.6 }}>
          سجّل دخولك للوصول إلى لوحة التحكم
        </p>
      </div>

      {/* ── Username ─────────────────────────────────── */}
      <div style={{ marginBottom: "18px" }}>
        <label style={{
          display: "block", fontSize: "13px", fontWeight: 700,
          color: "#3b2d6e", marginBottom: "8px",
        }}>
          اسم المستخدم
        </label>
        <div style={{ position: "relative" }}>
          {/* Icon */}
          <span style={{
            position: "absolute", top: "50%", right: "16px",
            transform: "translateY(-50%)",
            fontSize: "17px",
            color: focused === "username" ? "#7c3aed" : "#c4b5fd",
            pointerEvents: "none",
            transition: "color 0.2s",
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
              padding: "15px 50px 15px 46px",
              borderRadius: "14px",
              border: `1.5px solid ${focused === "username" ? "#7c3aed" : "#e5e0f8"}`,
              fontSize: "14.5px", color: "#0f0c29",
              background: loading ? "#f9f8ff" : "#fefcff",
              fontFamily: "inherit",
              direction: "rtl",
              height: "54px",
            }}
          />
          {/* Match indicator */}
          {username.trim() && (
            <span style={{
              position: "absolute", top: "50%", left: "16px",
              transform: "translateY(-50%)",
              fontSize: "15px",
            }}>
              {matchedUser ? "✅" : "❌"}
            </span>
          )}
        </div>

        {/* Matched user pill */}
        {matchedUser && (
          <div style={{
            marginTop: "8px",
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 14px",
            background: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
            border: "1px solid #ddd6fe",
            borderRadius: "12px",
            fontSize: "12.5px", color: "#5b21b6",
          }}>
            <span style={{
              background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
              color: "#fff",
              width: "28px", height: "28px",
              borderRadius: "8px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: 800, flexShrink: 0,
            }}>
              {matchedUser.name.charAt(0)}
            </span>
            <span style={{ fontWeight: 600 }}>{matchedUser.name}</span>
            <span style={{
              marginRight: "auto",
              background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
              color: "#fff",
              borderRadius: "7px",
              padding: "2px 10px",
              fontSize: "11px", fontWeight: 700,
            }}>
              {translateRole(matchedUser.role)}
            </span>
          </div>
        )}
      </div>

      {/* ── PIN ──────────────────────────────────────── */}
      <div style={{ marginBottom: "22px" }}>
        <label style={{
          display: "block", fontSize: "13px", fontWeight: 700,
          color: "#3b2d6e", marginBottom: "8px",
        }}>
          الرقم السري
        </label>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", top: "50%", right: "16px",
            transform: "translateY(-50%)",
            fontSize: "17px",
            color: focused === "pin" ? "#7c3aed" : "#c4b5fd",
            pointerEvents: "none",
            transition: "color 0.2s",
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
            onChange={(e) => { setPin(e.target.value); setError(""); }}
            onFocus={() => setFocused("pin")}
            onBlur={() => setFocused(null)}
            className="lp-input"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "15px 50px 15px 50px",
              borderRadius: "14px",
              border: `1.5px solid ${focused === "pin" ? "#7c3aed" : "#e5e0f8"}`,
              fontSize: "14.5px", color: "#0f0c29",
              background: loading ? "#f9f8ff" : "#fefcff",
              fontFamily: "inherit",
              direction: "ltr",
              letterSpacing: pin && !showPin ? "0.35em" : "normal",
              height: "54px",
            }}
          />
          {/* Show/hide */}
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            tabIndex={-1}
            style={{
              position: "absolute", top: "50%", left: "16px",
              transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: "17px", color: "#c4b5fd", padding: "2px",
              lineHeight: 1, transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#7c3aed")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#c4b5fd")}
            title={showPin ? "إخفاء" : "إظهار"}
          >
            {showPin ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────── */}
      {error && (
        <div
          ref={errorRef}
          style={{
            marginBottom: "18px",
            display: "flex", alignItems: "center", gap: "10px",
            padding: "12px 16px",
            background: "#fff5f5",
            border: "1.5px solid #fecaca",
            borderRadius: "12px",
            fontSize: "13.5px", color: "#dc2626",
            fontWeight: 600,
          }}
        >
          <span style={{ flexShrink: 0, fontSize: "16px" }}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Submit button ─────────────────────────────── */}
      <button
        type="submit"
        disabled={loading}
        className="lp-btn-primary"
        style={{
          width: "100%",
          height: "54px",
          borderRadius: "14px",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: "15.5px", fontWeight: 800,
          color: "#fff",
          background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 50%, #7c3aed 100%)",
          boxShadow: "0 6px 20px rgba(99,57,206,0.35), 0 2px 6px rgba(0,0,0,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          marginBottom: "22px",
          letterSpacing: "0.02em",
        }}
      >
        {loading ? (
          <>
            <span
              className="lp-spinner"
              style={{
                width: "20px", height: "20px",
                border: "2.5px solid rgba(255,255,255,0.25)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                display: "inline-block",
              }}
            />
            <span>جاري التحقق...</span>
          </>
        ) : (
          <span>دخول إلى النظام ←</span>
        )}
      </button>

      {/* ── Quick-select chips ────────────────────────── */}
      {users.length > 0 && (
        <div>
          <div style={{
            fontSize: "12px", color: "#a89cc8", textAlign: "center",
            marginBottom: "12px", fontWeight: 500,
          }}>
            اختر مستخدماً بسرعة
          </div>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center",
          }}>
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { setUsername(u.username); pinRef.current?.focus(); }}
                style={{
                  padding: "7px 14px",
                  borderRadius: "20px",
                  border: `1.5px solid ${username === u.username ? "#7c3aed" : "#e5e0f8"}`,
                  background: username === u.username
                    ? "linear-gradient(135deg,#ede9fe,#ddd6fe)"
                    : "#fafaf8",
                  color: username === u.username ? "#5b21b6" : "#7c6fa0",
                  fontSize: "12.5px", fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (username !== u.username) {
                    e.currentTarget.style.borderColor = "#c4b5fd";
                    e.currentTarget.style.color = "#5b21b6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (username !== u.username) {
                    e.currentTarget.style.borderColor = "#e5e0f8";
                    e.currentTarget.style.color = "#7c6fa0";
                  }
                }}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

/* ──────────────────────────────────────────────────────────
   REGISTER FORM — SaaS company + admin signup
────────────────────────────────────────────────────────── */
const BASE_REGISTER = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiReg = (p: string) => `${BASE_REGISTER}${p}`;

interface RegisterFormProps {
  onSuccess: (user: { id: number; name: string; username: string; role: string; active?: boolean; warehouse_id?: number | null; safe_id?: number | null; permissions?: Record<string, boolean> }, token: string) => void;
  onSwitch: () => void;
}

function RegisterForm({ onSuccess, onSwitch }: RegisterFormProps) {
  const [companyName, setCompanyName] = useState("");
  const [adminName,   setAdminName]   = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirmPw,   setConfirmPw]   = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [success,     setSuccess]     = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;
    const el = errorRef.current;
    if (el) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = "lp-shake 0.5s ease"; }
  }, [error]);

  const inputStyle = (active: boolean) => ({
    width: "100%", boxSizing: "border-box" as const,
    padding: "13px 16px",
    borderRadius: "12px",
    border: `1.5px solid ${active ? "#7c3aed" : "#e5e0f8"}`,
    fontSize: "14px", color: "#0f0c29",
    background: "#fefcff", fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxShadow: active ? "0 0 0 4px rgba(124,58,237,0.12)" : "none",
    height: "48px",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!companyName.trim()) { setError("اسم الشركة مطلوب"); return; }
    if (!adminName.trim())   { setError("اسم المسؤول مطلوب"); return; }
    if (!email.includes("@")) { setError("بريد إلكتروني صحيح مطلوب"); return; }
    if (password.length < 6)  { setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (password !== confirmPw) { setError("كلمتا المرور غير متطابقتين"); return; }

    setLoading(true);
    try {
      const res = await fetch(apiReg("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName, admin_name: adminName, email, password }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || "فشل إنشاء الحساب")); return; }
      setSuccess(true);
      setTimeout(() => {
        const { token, user } = data as { token: string; user: { id: number; name: string; username: string; role: string; active?: boolean; warehouse_id?: number | null; safe_id?: number | null; permissions?: Record<string, boolean> } };
        onSuccess(user, token);
      }, 900);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }} dir="rtl">
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>🎉</div>
        <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#0f0c29", marginBottom: "10px" }}>
          تم إنشاء حسابك بنجاح!
        </h3>
        <p style={{ fontSize: "14px", color: "#7c6fa0" }}>جاري تسجيل الدخول...</p>
      </div>
    );
  }

  const fields = [
    { id: "company", label: "اسم الشركة", value: companyName, setter: setCompanyName, type: "text",     icon: "🏢", placeholder: "شركة المليجي للتجارة" },
    { id: "admin",   label: "اسم المسؤول", value: adminName,  setter: setAdminName,  type: "text",     icon: "👤", placeholder: "صالح محمد" },
    { id: "email",   label: "البريد الإلكتروني", value: email, setter: setEmail,     type: "email",    icon: "📧", placeholder: "admin@company.com" },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate dir="rtl">
      <div style={{ marginBottom: "26px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#0f0c29", marginBottom: "6px", letterSpacing: "-0.3px" }}>
          أنشئ حسابك الآن
        </h2>
        <p style={{ fontSize: "13px", color: "#7c6fa0", lineHeight: 1.6 }}>
          تجربة مجانية 7 أيام — لا تحتاج بطاقة ائتمان
        </p>
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "14px" }}>
        {fields.map((f) => {
          const [focused, setFocused] = [false, (_v: boolean) => {}];
          return (
            <div key={f.id}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#3b2d6e", marginBottom: "6px" }}>
                {f.label}
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", top: "50%", right: "14px", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>{f.icon}</span>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  placeholder={f.placeholder}
                  required
                  className="lp-input"
                  style={{ ...inputStyle(focused), paddingRight: "42px" }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  dir={f.id === "email" ? "ltr" : "rtl"}
                />
              </div>
            </div>
          );
        })}

        {/* Password field */}
        <div>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#3b2d6e", marginBottom: "6px" }}>كلمة المرور</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", top: "50%", right: "14px", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>🔑</span>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 أحرف على الأقل"
              required
              className="lp-input"
              style={{ ...inputStyle(false), paddingRight: "42px", paddingLeft: "44px", direction: "ltr" }}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1}
              style={{ position: "absolute", top: "50%", left: "14px", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "15px", color: "#c4b5fd", lineHeight: 1 }}>
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        {/* Confirm password */}
        <div>
          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#3b2d6e", marginBottom: "6px" }}>تأكيد كلمة المرور</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", top: "50%", right: "14px", transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none" }}>✅</span>
            <input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="أعد كتابة كلمة المرور"
              required
              className="lp-input"
              style={{ ...inputStyle(false), paddingRight: "42px", direction: "ltr" }}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div ref={errorRef} style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px", padding: "11px 14px", background: "#fff5f5", border: "1.5px solid #fecaca", borderRadius: "10px", fontSize: "13px", color: "#dc2626", fontWeight: 600 }}>
          <span style={{ flexShrink: 0 }}>⚠️</span><span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={loading} className="lp-btn-primary"
        style={{ width: "100%", height: "50px", borderRadius: "14px", border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 50%, #7c3aed 100%)", boxShadow: "0 6px 20px rgba(99,57,206,0.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "16px", fontFamily: "inherit" }}>
        {loading ? (
          <><span className="lp-spinner" style={{ width: "18px", height: "18px", border: "2.5px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} /><span>جاري الإنشاء...</span></>
        ) : <span>إنشاء الحساب مجاناً ←</span>}
      </button>

      {/* Switch to login */}
      <button type="button" onClick={onSwitch}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#7c6fa0", fontFamily: "inherit", fontWeight: 600 }}>
        لديك حساب بالفعل؟ <span style={{ color: "#6d28d9", fontWeight: 800 }}>سجّل الدخول</span>
      </button>
    </form>
  );
}
