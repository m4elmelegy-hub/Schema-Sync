import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { useLocation } from "wouter";
import { animate, createTimeline, stagger } from "animejs";
import { Shield, LogIn } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

interface ErpUser {
  id: number;
  name: string;
  username: string;
  pin: string;
  role: string;
  active: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير",
  manager: "مشرف",
  cashier: "كاشير",
  salesperson: "مندوب مبيعات",
};

const SHAPES = [
  { id: "s1", size: 340, x: "-8%",  y: "-10%", opacity: 0.07, dur: 8000,  dx: 35,  dy: 25,  solid: false },
  { id: "s2", size: 220, x: "68%",  y: "58%",  opacity: 0.05, dur: 13000, dx: -28, dy: 32,  solid: true  },
  { id: "s3", size: 100, x: "22%",  y: "68%",  opacity: 0.09, dur: 7200,  dx: 18,  dy: -22, solid: true  },
  { id: "s4", size: 64,  x: "72%",  y: "9%",   opacity: 0.13, dur: 9500,  dx: -22, dy: 18,  solid: false },
  { id: "s5", size: 190, x: "82%",  y: "72%",  opacity: 0.06, dur: 11500, dx: 22,  dy: -28, solid: true  },
  { id: "s6", size: 82,  x: "48%",  y: "18%",  opacity: 0.09, dur: 6800,  dx: -18, dy: 22,  solid: false },
  { id: "s7", size: 420, x: "88%",  y: "-8%",  opacity: 0.04, dur: 16000, dx: 12,  dy: 16,  solid: false },
  { id: "s8", size: 128, x: "8%",   y: "82%",  opacity: 0.07, dur: 10500, dx: 28,  dy: -18, solid: true  },
];

export default function Login() {
  const { login } = useAuth();
  const { settings } = useAppSettings();
  const [, setLocation] = useLocation();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pinFocused, setPinFocused] = useState(false);
  const [userFocused, setUserFocused] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false);

  const { data: users = [] } = useQuery<ErpUser[]>({
    queryKey: ["/api/settings/users"],
    queryFn: () => fetch(api("/api/settings/users")).then((r) => r.json()),
  });

  const activeUsers = users.filter((u) => u.active !== false);
  const selectedUser = activeUsers.find((u) => String(u.id) === selectedUserId);
  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;

  /* ── 1. Entrance animation ─────────────────────────────────────── */
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const tl = createTimeline();

    tl.add("#login-brand", {
      translateX: ["-100%", "0%"],
      opacity: [0, 1],
      duration: 900,
      easing: "easeOutExpo",
    });

    tl.add(
      "#login-form-panel",
      {
        translateX: ["60px", "0px"],
        opacity: [0, 1],
        duration: 850,
        easing: "easeOutExpo",
      },
      100
    );

    tl.add(
      "#login-logo",
      {
        scale: [0.4, 1],
        rotate: ["-15deg", "0deg"],
        opacity: [0, 1],
        duration: 700,
        easing: "easeOutBack",
      },
      380
    );

    tl.add(
      ".brand-text",
      {
        translateY: [28, 0],
        opacity: [0, 1],
        delay: stagger(130),
        duration: 600,
        easing: "easeOutExpo",
      },
      560
    );

    tl.add(
      ".form-field",
      {
        translateY: [22, 0],
        opacity: [0, 1],
        delay: stagger(90),
        duration: 520,
        easing: "easeOutExpo",
      },
      650
    );
  }, []);

  /* ── 2. Floating shapes continuous loop ────────────────────────── */
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".bg-shape");
    els.forEach((el, i) => {
      const s = SHAPES[i];
      if (!s) return;
      animate(el, {
        translateX: [0, s.dx, s.dx * 0.4, -s.dx * 0.5, 0],
        translateY: [0, s.dy * 0.5, s.dy, s.dy * 0.3, 0],
        rotate: i % 2 === 0 ? [0, 18, 0, -12, 0] : [0, -14, 8, -6, 0],
        scale: [1, 1 + 0.04 * (i % 3), 1 - 0.02 * (i % 2), 1],
        duration: s.dur,
        loop: true,
        easing: "easeInOutSine",
      });
    });
  }, []);

  /* ── 3. Error shake animation ──────────────────────────────────── */
  useEffect(() => {
    if (!error) return;
    animate("#login-error", {
      translateX: [0, -9, 9, -7, 7, -4, 4, -2, 2, 0],
      duration: 520,
      easing: "easeInOutSine",
    });
  }, [error]);

  /* ── 4. Button hover ───────────────────────────────────────────── */
  const handleBtnEnter = useCallback(() => {
    if (!btnRef.current) return;
    animate(btnRef.current, {
      scale: [1, 1.03],
      duration: 180,
      easing: "easeOutCubic",
    });
    const shimmer = btnRef.current.querySelector<HTMLElement>(".btn-shimmer");
    if (shimmer) {
      animate(shimmer, {
        translateX: ["-110%", "210%"],
        duration: 640,
        easing: "easeInOutSine",
      });
    }
  }, []);

  const handleBtnLeave = useCallback(() => {
    if (!btnRef.current) return;
    animate(btnRef.current, {
      scale: [1.03, 1],
      duration: 180,
      easing: "easeOutCubic",
    });
  }, []);

  /* ── Login logic ───────────────────────────────────────────────── */
  const handleLogin = async () => {
    if (!selectedUser) { setError("اختر المستخدم أولاً"); return; }
    if (!pin) { setError("أدخل الرقم السري"); return; }
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 380));
    if (selectedUser.pin !== pin) {
      setError("الرقم السري غير صحيح");
      setPin("");
      setLoading(false);
      return;
    }
    animate("#login-form-panel", {
      scale: [1, 0.97, 1],
      opacity: [1, 0.7, 1],
      duration: 320,
      easing: "easeOutCubic",
    });
    login({
      id: selectedUser.id,
      name: selectedUser.name,
      username: selectedUser.username,
      role: selectedUser.role,
    });
    setLocation("/");
  };

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex overflow-hidden" style={{ direction: "ltr" }}>

      {/* ═══════════════════════════════════════════════════════════
          LEFT PANEL — Branding + Animated Shapes
      ═══════════════════════════════════════════════════════════ */}
      <div
        id="login-brand"
        className="hidden lg:flex w-[58%] relative flex-col items-center justify-center overflow-hidden"
        style={{ background: "#080808" }}
      >
        {/* Radial gradient wash */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 28% 38%, rgba(245,158,11,0.13) 0%, transparent 58%)," +
              "radial-gradient(ellipse at 78% 72%, rgba(180,83,9,0.09) 0%, transparent 55%)," +
              "radial-gradient(ellipse at 60% 10%, rgba(245,158,11,0.06) 0%, transparent 40%)",
          }}
        />

        {/* Subtle grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(245,158,11,0.04) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(245,158,11,0.04) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        {/* ── Floating geometric shapes ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {SHAPES.map((s, i) => (
            <div
              key={s.id}
              className="bg-shape absolute"
              style={{
                width: s.size,
                height: s.size,
                left: s.x,
                top: s.y,
                opacity: s.opacity,
                borderRadius: i % 4 === 0 ? "28%" : i % 4 === 1 ? "50%" : i % 4 === 2 ? "38%" : "50%",
                background: s.solid
                  ? `radial-gradient(circle at 35% 35%, rgba(245,158,11,0.9), rgba(180,83,9,0.4), transparent 70%)`
                  : "transparent",
                border: !s.solid
                  ? `${Math.max(1.5, s.size / 55)}px solid rgba(245,158,11,0.65)`
                  : "none",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>

        {/* Top edge glow */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        {/* Bottom edge glow */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        {/* Right divider */}
        <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-amber-500/30 to-transparent" />

        {/* ── Brand content ── */}
        <div className="relative z-10 text-center px-16 max-w-lg" dir="rtl">
          {/* Animated logo */}
          <div id="login-logo" className="flex justify-center mb-10">
            <div className="relative">
              <div
                className="w-32 h-32 rounded-[28px] flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(180,83,9,0.10) 100%)",
                  border: "1.5px solid rgba(245,158,11,0.35)",
                  boxShadow:
                    "0 0 60px rgba(245,158,11,0.18), 0 0 120px rgba(245,158,11,0.07), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <img
                  src={logoSrc}
                  alt={settings.companyName}
                  className="w-22 h-22 object-contain"
                  style={{ width: "5.5rem", height: "5.5rem" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div
                className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  border: "2px solid #080808",
                  boxShadow: "0 0 16px rgba(16,185,129,0.5)",
                }}
              >
                <Shield className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          <h1 className="brand-text text-5xl font-black text-white mb-3 tracking-tight leading-snug">
            {settings.companyName}
          </h1>
          <p className="brand-text text-amber-400/65 text-xl mb-14 font-medium tracking-wide">
            {settings.companySlogan || "نظام إدارة متكامل"}
          </p>

          {/* Feature pills */}
          <div className="brand-text flex flex-wrap justify-center gap-2 mb-14">
            {[
              { icon: "⚡", label: "مبيعات فورية" },
              { icon: "📊", label: "تقارير ذكية" },
              { icon: "🔒", label: "أمان تام" },
              { icon: "🔧", label: "إدارة المخزون" },
            ].map((f) => (
              <span
                key={f.label}
                className="px-4 py-1.5 rounded-full text-sm font-medium"
                style={{
                  background: "rgba(245,158,11,0.07)",
                  border: "1px solid rgba(245,158,11,0.18)",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                {f.icon} {f.label}
              </span>
            ))}
          </div>

          <p className="brand-text text-white/12 text-xs tracking-[0.25em] uppercase font-medium">
            Halal Tech ERP v2.0
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          RIGHT PANEL — Login Form
      ═══════════════════════════════════════════════════════════ */}
      <div
        id="login-form-panel"
        className="flex-1 flex flex-col items-center justify-center p-8 relative"
        dir="rtl"
        style={{
          background:
            "linear-gradient(160deg, #0e0e0e 0%, #111 60%, #0a0a0a 100%)",
        }}
      >
        {/* Subtle corner glow */}
        <div
          className="absolute bottom-0 left-0 w-64 h-64 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at bottom left, rgba(245,158,11,0.05) 0%, transparent 70%)",
          }}
        />

        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-10">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.2)",
            }}
          >
            <img
              src={logoSrc}
              alt={settings.companyName}
              className="w-14 h-14 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <h1 className="text-2xl font-black text-white">{settings.companyName}</h1>
        </div>

        {/* ── Form card ── */}
        <div className="w-full max-w-[340px]">

          {/* Header */}
          <div className="form-field mb-9">
            <h2 className="text-3xl font-black text-white mb-1.5">مرحباً بك</h2>
            <p className="text-white/28 text-sm">سجّل دخولك للمتابعة</p>
          </div>

          {/* ── Floating-label User select ── */}
          <div className="form-field mb-5">
            <div className="relative">
              <label
                className="absolute pointer-events-none transition-all duration-200 font-medium"
                style={{
                  top: userFocused || selectedUserId ? "9px" : "50%",
                  transform:
                    userFocused || selectedUserId
                      ? "translateY(0)"
                      : "translateY(-50%)",
                  right: "14px",
                  fontSize: userFocused || selectedUserId ? "10px" : "13px",
                  color: userFocused
                    ? "#F59E0B"
                    : "rgba(255,255,255,0.32)",
                  zIndex: 2,
                  letterSpacing: "0.02em",
                }}
              >
                المستخدم
              </label>
              <select
                className="w-full appearance-none outline-none cursor-pointer transition-all duration-200"
                style={{
                  paddingTop: "22px",
                  paddingBottom: "10px",
                  paddingRight: "14px",
                  paddingLeft: "36px",
                  borderRadius: "16px",
                  background: userFocused
                    ? "rgba(245,158,11,0.06)"
                    : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${
                    userFocused
                      ? "rgba(245,158,11,0.55)"
                      : "rgba(255,255,255,0.07)"
                  }`,
                  boxShadow: userFocused
                    ? "0 0 0 4px rgba(245,158,11,0.07), 0 4px 24px rgba(245,158,11,0.06)"
                    : "none",
                  color: selectedUserId ? "#fff" : "transparent",
                  fontSize: "14px",
                  fontFamily: "inherit",
                }}
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setPin("");
                  setError("");
                }}
                onFocus={() => setUserFocused(true)}
                onBlur={() => setUserFocused(false)}
              >
                <option value="" className="bg-gray-900 text-white">
                  — اختر اسمك —
                </option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id} className="bg-gray-900 text-white">
                    {u.name} — {ROLE_LABELS[u.role] || u.role}
                  </option>
                ))}
              </select>
              <span
                className="absolute pointer-events-none text-white/25 text-xs"
                style={{ left: "14px", top: "50%", transform: "translateY(-50%)" }}
              >
                ▾
              </span>
            </div>
          </div>

          {/* ── Floating-label PIN input ── */}
          <div className="form-field mb-5">
            <div className="relative">
              <label
                className="absolute pointer-events-none transition-all duration-200 font-medium"
                style={{
                  top: pinFocused || pin ? "9px" : "50%",
                  transform:
                    pinFocused || pin ? "translateY(0)" : "translateY(-50%)",
                  right: "14px",
                  fontSize: pinFocused || pin ? "10px" : "13px",
                  color: pinFocused ? "#F59E0B" : "rgba(255,255,255,0.32)",
                  zIndex: 2,
                  letterSpacing: "0.02em",
                }}
              >
                الرقم السري
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="current-password"
                className="w-full text-center outline-none transition-all duration-200"
                style={{
                  paddingTop: "22px",
                  paddingBottom: "10px",
                  paddingLeft: "14px",
                  paddingRight: "14px",
                  borderRadius: "16px",
                  background: pinFocused
                    ? "rgba(245,158,11,0.06)"
                    : "rgba(255,255,255,0.03)",
                  border: `1.5px solid ${
                    pinFocused
                      ? "rgba(245,158,11,0.55)"
                      : "rgba(255,255,255,0.07)"
                  }`,
                  boxShadow: pinFocused
                    ? "0 0 0 4px rgba(245,158,11,0.07), 0 4px 24px rgba(245,158,11,0.06)"
                    : "none",
                  color: "#fff",
                  fontSize: pin ? "24px" : "14px",
                  letterSpacing: pin ? "0.55em" : "normal",
                  fontFamily: "inherit",
                }}
                placeholder=""
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError("");
                }}
                onFocus={() => setPinFocused(true)}
                onBlur={() => setPinFocused(false)}
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div
              id="login-error"
              className="form-field mb-4 flex items-center gap-2.5 text-xs rounded-2xl px-4 py-3"
              style={{
                background: "rgba(239,68,68,0.07)",
                border: "1px solid rgba(239,68,68,0.22)",
                color: "#f87171",
              }}
            >
              <span className="text-base leading-none">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Submit button ── */}
          <div className="form-field">
            <button
              ref={btnRef}
              type="button"
              disabled={loading || !selectedUserId || !pin}
              onClick={handleLogin}
              onMouseEnter={handleBtnEnter}
              onMouseLeave={handleBtnLeave}
              className="w-full flex items-center justify-center gap-2.5 font-bold text-sm relative overflow-hidden transition-opacity duration-200 disabled:opacity-38 disabled:cursor-not-allowed"
              style={{
                paddingTop: "15px",
                paddingBottom: "15px",
                borderRadius: "16px",
                background:
                  "linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)",
                color: "#080808",
                boxShadow:
                  "0 6px 28px rgba(245,158,11,0.28), 0 2px 8px rgba(245,158,11,0.12)",
              }}
            >
              {/* Shimmer layer */}
              <span
                className="btn-shimmer absolute inset-0 pointer-events-none"
                style={{
                  transform: "translateX(-110%)",
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)",
                }}
              />

              {loading ? (
                <span
                  className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{
                    borderColor: "rgba(8,8,8,0.25)",
                    borderTopColor: "#080808",
                  }}
                />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{loading ? "جاري التحقق..." : "دخول"}</span>
            </button>
          </div>

          {selectedUser?.pin === "0000" && (
            <p className="form-field text-white/18 text-xs text-center mt-4">
              الرقم السري الافتراضي: 0000
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="absolute bottom-5 text-white/10 text-xs tracking-widest">
          Halal Tech ERP v2.0
        </p>
      </div>
    </div>
  );
}
