import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { useLocation } from "wouter";
import { animate, createTimeline, stagger } from "animejs";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

/* ─── Types ────────────────────────────────────────────────── */
interface ErpUser {
  id: number; name: string; username: string;
  pin: string; role: string; active: boolean;
}
interface Star {
  x: number; y: number; r: number;
  opacity: number; twinklePhase: number;
  twinkleSpeed: number; depth: number;
}
interface Meteor {
  x: number; y: number; vx: number; vy: number;
  trail: Array<{ x: number; y: number }>;
  life: number; maxLife: number;
}

/* ─── Constants ────────────────────────────────────────────── */
const ROLE_LABELS: Record<string, string> = {
  admin: "مدير", manager: "مشرف",
  cashier: "كاشير", salesperson: "مندوب مبيعات",
};

const AVATAR_COLORS: [string, string][] = [
  ["#667eea", "#764ba2"],
  ["#f6d365", "#d97706"],
  ["#4facfe", "#00c9ff"],
  ["#43e97b", "#08d9a0"],
  ["#fa709a", "#fee140"],
  ["#a18cd1", "#fbc2eb"],
];

const BADGES = [
  { icon: "⚡", label: "مبيعات فورية" },
  { icon: "📊", label: "تقارير ذكية" },
  { icon: "🔒", label: "أمان تام" },
  { icon: "🏪", label: "إدارة المخزون" },
];

const KEYS = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
const MAX_PIN_DOTS = 6;
const STAR_COUNT = 260;
const MAX_CONST_DIST = 75;
const PARALLAX_STR = 22;

/* ─── Helpers ──────────────────────────────────────────────── */
function makeStars(w: number, h: number): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.pow(Math.random(), 2) * 2.2 + 0.25,
    opacity: Math.random() * 0.55 + 0.3,
    twinklePhase: Math.random() * Math.PI * 2,
    twinkleSpeed: Math.random() * 0.018 + 0.004,
    depth: Math.random() * 0.82 + 0.18,
  }));
}

/* ════════════════════════════════════════════════════════════
   LOGIN COMPONENT
════════════════════════════════════════════════════════════ */
export default function Login() {
  const { login } = useAuth();
  const { settings } = useAppSettings();
  const [, setLocation] = useLocation();

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"user" | "pin">("user");

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const starsRef    = useRef<Star[]>([]);
  const meteorsRef  = useRef<Meteor[]>([]);
  const rafRef      = useRef<number>(0);
  const mouseRef    = useRef({ x: 0, y: 0 });
  const mountedRef  = useRef(false);
  const cardsAnimRef= useRef(false);
  const lastMeteorRef      = useRef(0);
  const nextMeteorDelayRef = useRef(2500 + Math.random() * 1500);

  /* stale-closure guards */
  const pinRef          = useRef(pin);
  const selectedUserRef = useRef<ErpUser | undefined>(undefined);

  const { data: users = [] } = useQuery<ErpUser[]>({
    queryKey: ["/api/settings/users"],
    queryFn: () =>
      fetch(api("/api/settings/users")).then((r) => {
        if (!r.ok) throw new Error("فشل جلب المستخدمين");
        return r.json();
      }),
  });

  const activeUsers  = users.filter((u) => u.active !== false);
  const selectedUser = activeUsers.find((u) => String(u.id) === selectedUserId);
  const logoSrc      = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;
  const pinLength    = selectedUser ? Math.min(Math.max(selectedUser.pin.length, 4), MAX_PIN_DOTS) : 4;

  pinRef.current          = pin;
  selectedUserRef.current = selectedUser;

  /* ══ 1. Star-field canvas ════════════════════════════════════ */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = devicePixelRatio || 1;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starsRef.current = makeStars(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMouse = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - r.left - r.width  / 2) / r.width,
        y: (e.clientY - r.top  - r.height / 2) / r.height,
      };
    };
    window.addEventListener("mousemove", onMouse);

    const tick = (now: number) => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const stars   = starsRef.current;
      const meteors = meteorsRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      /* — constellation lines — */
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const si = stars[i], sj = stars[j];
          const dx = si.x - sj.x, dy = si.y - sj.y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_CONST_DIST) {
            const alpha = (1 - d / MAX_CONST_DIST) * 0.12;
            ctx.beginPath();
            ctx.moveTo(si.x + mx * PARALLAX_STR * si.depth, si.y + my * PARALLAX_STR * si.depth);
            ctx.lineTo(sj.x + mx * PARALLAX_STR * sj.depth, sj.y + my * PARALLAX_STR * sj.depth);
            ctx.strokeStyle = `rgba(160,170,220,${alpha})`;
            ctx.lineWidth = 0.45;
            ctx.stroke();
          }
        }
      }

      /* — stars — */
      stars.forEach((s) => {
        s.twinklePhase += s.twinkleSpeed;
        const tw = Math.sin(s.twinklePhase) * 0.28 + 0.72;
        const px = s.x + mx * PARALLAX_STR * s.depth;
        const py = s.y + my * PARALLAX_STR * s.depth;

        /* glow for brighter stars */
        if (s.r > 1.1) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, s.r * 4);
          g.addColorStop(0, `rgba(190,210,255,${s.opacity * 0.18 * tw})`);
          g.addColorStop(1, "rgba(190,210,255,0)");
          ctx.beginPath();
          ctx.arc(px, py, s.r * 4, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(px, py, s.r * tw, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(215,225,255,${s.opacity * tw})`;
        ctx.fill();
      });

      /* — spawn meteors every 2-4 s — */
      if (now - lastMeteorRef.current > nextMeteorDelayRef.current) {
        lastMeteorRef.current      = now;
        nextMeteorDelayRef.current = 2000 + Math.random() * 2000;
        const fromTop = Math.random() < 0.6;
        const sx = fromTop ? Math.random() * w * 0.8 : -20;
        const sy = fromTop ? -15 : Math.random() * h * 0.45;
        const spd = 5.5 + Math.random() * 5;
        const ang = ((25 + Math.random() * 35) * Math.PI) / 180;
        meteors.push({
          x: sx, y: sy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          trail: [], life: 0,
          maxLife: 38 + Math.random() * 22,
        });
      }

      /* — draw meteors — */
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 22) m.trail.shift();
        m.x += m.vx; m.y += m.vy; m.life++;

        if (m.life > m.maxLife || m.x > w + 60 || m.y > h + 60) {
          meteors.splice(i, 1); continue;
        }

        const prog  = m.life / m.maxLife;
        const alpha = Math.sin(prog * Math.PI) * 0.92;

        /* trail */
        for (let ti = 1; ti < m.trail.length; ti++) {
          const ta = (ti / m.trail.length) * alpha;
          ctx.beginPath();
          ctx.moveTo(m.trail[ti-1].x, m.trail[ti-1].y);
          ctx.lineTo(m.trail[ti].x,   m.trail[ti].y);
          ctx.strokeStyle = `rgba(200,220,255,${ta * 0.65})`;
          ctx.lineWidth   = (ti / m.trail.length) * 2.2;
          ctx.stroke();
        }

        /* head */
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 4);
        g.addColorStop(0, `rgba(240,245,255,${alpha})`);
        g.addColorStop(1, "rgba(160,200,255,0)");
        ctx.beginPath();
        ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  /* ══ 2. Entrance choreography ════════════════════════════════ */
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const tl = createTimeline();

    /* brand panel slides from left */
    tl.add("#lp-brand", {
      translateX: ["-100%", "0%"],
      opacity: [0, 1],
      duration: 900,
      easing: "easeOutExpo",
    });

    /* logo bounce */
    tl.add("#lp-logo", {
      scale: [0, 1.18, 0.95, 1.04, 1],
      opacity: [0, 1],
      duration: 800,
      easing: "easeOutElastic(1, .6)",
    }, 150);

    /* title */
    tl.add("#lp-title", {
      translateY: [28, 0],
      opacity: [0, 1],
      duration: 600,
      easing: "easeOutExpo",
    }, 480);

    /* tagline */
    tl.add("#lp-tagline", {
      translateY: [18, 0],
      opacity: [0, 1],
      duration: 500,
      easing: "easeOutExpo",
    }, 650);

    /* badges stagger spring */
    tl.add(".lp-badge", {
      translateY: [20, 0],
      opacity: [0, 1],
      scale: [0.82, 1.06, 1],
      delay: stagger(90),
      duration: 420,
      easing: "easeOutBack",
    }, 800);

    /* right panel */
    tl.add("#lp-panel", {
      translateX: ["4%", "0%"],
      opacity: [0, 1],
      duration: 700,
      easing: "easeOutExpo",
    }, 100);

  }, []);

  /* ══ 2b. Cards cascade — runs once when users load ═══════════ */
  useEffect(() => {
    if (activeUsers.length === 0 || cardsAnimRef.current) return;
    cardsAnimRef.current = true;
    setTimeout(() =>
      animate(".account-card", {
        translateX: [24, 0],
        opacity: [0, 1],
        delay: stagger(100),
        duration: 480,
        easing: "easeOutExpo",
      }), 200
    );
  }, [activeUsers.length]);

  /* ══ 3. Error shake ══════════════════════════════════════════ */
  useEffect(() => {
    if (!error) return;
    animate("#lp-error", {
      translateX: [0, -10, 10, -8, 8, -5, 5, -3, 3, 0],
      duration: 560,
      easing: "easeInOutSine",
    });
    animate(".pin-dot", {
      scale: [1, 1.3, 0.85, 1],
      delay: stagger(40),
      duration: 380,
      easing: "easeOutBack",
    });
  }, [error]);

  /* ══ 4. Keyboard support ═════════════════════════════════════ */
  useEffect(() => {
    if (step !== "pin") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKeyPress(e.key);
      else if (e.key === "Backspace") handleKeyPress("⌫");
      else if (e.key === "Enter") handleKeyPress("✓");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, pin, loading]);

  /* ══ Step transitions ════════════════════════════════════════ */
  const selectUser = (id: string) => {
    setSelectedUserId(id);
    setError(""); setPin("");
    animate("#lp-user-step", {
      translateX: [0, 36], opacity: [1, 0], duration: 250, easing: "easeInCubic",
      onComplete: () => {
        setStep("pin");
        requestAnimationFrame(() =>
          animate("#lp-pin-step", {
            translateX: [-36, 0], opacity: [0, 1], duration: 320, easing: "easeOutCubic",
          })
        );
      },
    });
  };

  const backToUser = () => {
    animate("#lp-pin-step", {
      translateX: [0, 36], opacity: [1, 0], duration: 250, easing: "easeInCubic",
      onComplete: () => {
        setStep("user"); setPin(""); setError("");
        requestAnimationFrame(() =>
          animate("#lp-user-step", {
            translateX: [-36, 0], opacity: [0, 1], duration: 320, easing: "easeOutCubic",
          })
        );
      },
    });
  };

  /* ══ PIN key press ═══════════════════════════════════════════ */
  const handleKeyPress = useCallback((key: string) => {
    if (loading) return;
    if (key === "⌫") { setPin((p) => p.slice(0, -1)); setError(""); return; }
    if (key === "✓") { triggerLogin(); return; }
    setPin((prev) => {
      if (prev.length >= MAX_PIN_DOTS) return prev;
      const next = prev + key;
      setError("");
      const idx = next.length - 1;
      requestAnimationFrame(() => {
        const dot = document.querySelector(`.pin-dot-${idx}`);
        if (dot) animate(dot as HTMLElement, { scale: [0.3, 1.4, 1], duration: 280, easing: "easeOutBack" });
      });
      return next;
    });
  }, [loading]);

  /* ══ Key button with bounce ══════════════════════════════════ */
  const handleKeyBtn = useCallback((key: string, el: HTMLElement) => {
    animate(el, { scale: [0.87, 1.06, 1], duration: 200, easing: "easeOutBack" });
    handleKeyPress(key);
  }, [handleKeyPress]);

  /* ══ Login logic ═════════════════════════════════════════════ */
  const triggerLogin = async () => {
    const currentUser = selectedUserRef.current;
    const currentPin  = pinRef.current;
    if (!currentUser) { setError("اختر المستخدم أولاً"); return; }
    if (!currentPin)  { setError("أدخل الرقم السري");   return; }
    if (loading) return;

    setLoading(true); setError("");
    await new Promise((r) => setTimeout(r, 440));

    if (currentUser.pin !== currentPin) {
      setError("الرقم السري غير صحيح");
      setPin(""); setLoading(false);
      return;
    }

    /* success exit */
    animate("#lp-panel", { scale: [1, 1.02, 1], duration: 300, easing: "easeOutCubic" });
    setTimeout(() =>
      animate("#lp-panel", {
        translateX: ["0%", "6%"], opacity: [1, 0], duration: 300, easing: "easeInCubic",
        onComplete: () => {
          login({ id: currentUser.id, name: currentUser.name, username: currentUser.username, role: currentUser.role });
          setLocation("/");
        },
      }), 280
    );
  };

  /* ══ Render ══════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex overflow-hidden" style={{ direction: "ltr", background: "#05050b" }}>

      {/* ════════ LEFT — Star-field brand panel ════════ */}
      <div
        id="lp-brand"
        className="hidden lg:flex w-[52%] relative flex-col items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(160deg, #07070f 0%, #05050a 100%)" }}
      >
        {/* Star canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Ambient light washes */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background:
            "radial-gradient(ellipse 60% 55% at 28% 35%, rgba(100,80,200,0.09) 0%, transparent 70%)," +
            "radial-gradient(ellipse 50% 45% at 74% 72%, rgba(245,158,11,0.07) 0%, transparent 60%)," +
            "radial-gradient(ellipse 40% 35% at 55% 8%,  rgba(130,100,220,0.05) 0%, transparent 55%)",
        }} />

        {/* Subtle grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage:
            "linear-gradient(rgba(120,100,200,0.025) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(120,100,200,0.025) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }} />

        {/* Right edge separator */}
        <div className="absolute top-0 right-0 bottom-0 w-px"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(245,158,11,0.22) 30%, rgba(245,158,11,0.22) 70%, transparent)" }} />
        <div className="absolute top-0 right-0 bottom-0 w-12 pointer-events-none"
          style={{ background: "linear-gradient(to left, rgba(5,5,11,0.5), transparent)" }} />

        {/* Brand content */}
        <div className="relative z-10 text-center px-14 max-w-[480px]" dir="rtl">

          {/* Logo */}
          <div id="lp-logo" className="flex justify-center mb-9" style={{ opacity: 0 }}>
            <div className="relative">
              {/* Pulse rings */}
              <div className="absolute inset-0 rounded-[28px] pointer-events-none"
                style={{
                  animation: "lp-ring1 3s ease-in-out infinite",
                  border: "1.5px solid rgba(245,158,11,0.22)",
                  transform: "scale(1.12)",
                }} />
              <div className="absolute inset-0 rounded-[28px] pointer-events-none"
                style={{
                  animation: "lp-ring2 3s ease-in-out infinite 0.8s",
                  border: "1px solid rgba(245,158,11,0.12)",
                  transform: "scale(1.28)",
                }} />
              <img
                src={logoSrc}
                alt="Logo"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                style={{
                  width: "100px", height: "100px",
                  borderRadius: "28px",
                  objectFit: "contain",
                  background: "rgba(255,255,255,0.04)",
                  border: "1.5px solid rgba(245,158,11,0.28)",
                  boxShadow: "0 0 40px rgba(245,158,11,0.14), 0 12px 40px rgba(0,0,0,0.5)",
                }}
              />
            </div>
          </div>

          {/* Company name */}
          <h1 id="lp-title" className="font-black mb-3 leading-tight" style={{
            opacity: 0,
            fontSize: "clamp(26px, 3.2vw, 42px)",
            color: "#fff",
            textShadow: "0 2px 24px rgba(245,158,11,0.2)",
            letterSpacing: "-0.5px",
          }}>
            {settings.companyName || "Halal Tech"}
          </h1>

          {/* Tagline */}
          <p id="lp-tagline" style={{ opacity: 0, fontSize: "14px", color: "rgba(255,255,255,0.38)", marginBottom: "32px", letterSpacing: "0.4px" }}>
            {settings.companySlogan || "نظام إدارة متكامل لمحلات صيانة الجوال"}
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2.5 justify-center">
            {BADGES.map((b) => (
              <div
                key={b.label}
                className="lp-badge"
                style={{
                  opacity: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "100px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.62)",
                  background: "rgba(255,255,255,0.042)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span>{b.icon}</span>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Version tag */}
        <p className="absolute bottom-5 text-[10px] tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.1)" }}>
          HALAL TECH ERP v2.0
        </p>
      </div>

      {/* ════════ RIGHT — Accounts + PIN panel ════════ */}
      <div
        id="lp-panel"
        className="flex-1 flex flex-col items-center justify-center relative"
        style={{
          opacity: 0,
          background: "linear-gradient(160deg, #09090f 0%, #070710 100%)",
          minHeight: "100vh",
        }}
      >
        {/* Subtle top glow */}
        <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent, rgba(245,158,11,0.18), transparent)" }} />

        <div className="w-full max-w-[420px] px-7 py-12" dir="rtl">

          {/* ─── STEP: User selection ─── */}
          {step === "user" && (
            <div id="lp-user-step">
              <div className="mb-8">
                <h2 className="text-[22px] font-black text-white mb-1.5">مرحباً بك 👋</h2>
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)" }}>
                  اختر حسابك للمتابعة
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {activeUsers.map((user, idx) => {
                  const [c1, c2] = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  return (
                    <AccountCard
                      key={user.id}
                      user={user}
                      colorFrom={c1}
                      colorTo={c2}
                      onSelect={() => selectUser(String(user.id))}
                    />
                  );
                })}

                {activeUsers.length === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>
                    جاري تحميل الحسابات…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── STEP: PIN entry ─── */}
          {step === "pin" && (
            <div id="lp-pin-step">

              {/* Header row: back + user chip */}
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={backToUser}
                  className="back-btn"
                  style={{
                    width: "38px", height: "38px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.35)",
                    fontSize: "17px",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    transition: "background 0.15s, color 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    el.style.background = "rgba(255,255,255,0.07)";
                    el.style.color = "rgba(255,255,255,0.75)";
                    animate(el, { translateX: [0, 4, -2, 3, 0], duration: 420, easing: "easeOutBack" });
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.background = "rgba(255,255,255,0.04)";
                    el.style.color = "rgba(255,255,255,0.35)";
                  }}
                >
                  →
                </button>

                {selectedUser && (
                  <div className="flex items-center gap-2.5">
                    <div style={{
                      width: "38px", height: "38px", borderRadius: "12px",
                      background: `linear-gradient(135deg, ${AVATAR_COLORS[activeUsers.indexOf(selectedUser) % AVATAR_COLORS.length][0]}, ${AVATAR_COLORS[activeUsers.indexOf(selectedUser) % AVATAR_COLORS.length][1]})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "15px", fontWeight: 800, color: "#fff",
                      flexShrink: 0,
                    }}>
                      {selectedUser.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{selectedUser.name}</div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{ROLE_LABELS[selectedUser.role] || selectedUser.role}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* PIN heading */}
              <div className="mb-6">
                <h2 style={{ fontSize: "21px", fontWeight: 900, color: "#fff", marginBottom: "4px" }}>الرقم السري</h2>
                <p style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.3)" }}>
                  اضغط على الأرقام أدناه
                  {selectedUser?.pin === "0000" && <span style={{ color: "rgba(245,158,11,0.5)" }}> · الافتراضي: 0000</span>}
                </p>
              </div>

              {/* PIN dots */}
              <div className="flex justify-center gap-4 mb-6" dir="ltr">
                {Array.from({ length: pinLength }).map((_, i) => {
                  const filled = i < pin.length;
                  return (
                    <div
                      key={i}
                      className={`pin-dot pin-dot-${i}`}
                      style={{
                        width: "14px", height: "14px", borderRadius: "50%",
                        background: filled
                          ? "linear-gradient(135deg, #F59E0B, #D97706)"
                          : "rgba(255,255,255,0.08)",
                        border: filled ? "none" : "1.5px solid rgba(255,255,255,0.12)",
                        boxShadow: filled
                          ? "0 0 16px rgba(245,158,11,0.65), 0 0 32px rgba(245,158,11,0.2)"
                          : "none",
                        transition: "background 0.15s, box-shadow 0.15s",
                      }}
                    />
                  );
                })}
              </div>

              {/* Error */}
              {error && (
                <div
                  id="lp-error"
                  className="mb-5 flex items-center gap-2 rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    color: "#f87171", fontSize: "12.5px",
                  }}
                >
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              {/* Loading overlay */}
              {loading && (
                <div className="flex items-center justify-center gap-3 mb-5 py-2"
                  style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px" }}>
                  <span
                    className="animate-spin rounded-full"
                    style={{
                      width: "18px", height: "18px", flexShrink: 0,
                      border: "2px solid rgba(245,158,11,0.18)",
                      borderTopColor: "#F59E0B",
                      display: "inline-block",
                    }}
                  />
                  جاري التحقق…
                </div>
              )}

              {/* PIN keypad */}
              <div className="grid grid-cols-3 gap-2.5" dir="ltr">
                {KEYS.map((key) => {
                  const isConfirm  = key === "✓";
                  const isDelete   = key === "⌫";
                  const confirmOn  = isConfirm && pin.length > 0;

                  return (
                    <button
                      key={key}
                      disabled={loading}
                      onClick={(e) => handleKeyBtn(key, e.currentTarget)}
                      style={{
                        height: "56px",
                        borderRadius: "16px",
                        fontWeight: 700,
                        fontSize: isConfirm || isDelete ? "18px" : "21px",
                        background: confirmOn
                          ? "linear-gradient(135deg, #F59E0B 0%, #D97706 60%, #B45309 100%)"
                          : isConfirm
                          ? "rgba(245,158,11,0.05)"
                          : isDelete
                          ? "rgba(239,68,68,0.06)"
                          : "rgba(255,255,255,0.04)",
                        border: confirmOn
                          ? "1.5px solid rgba(245,158,11,0.5)"
                          : isConfirm
                          ? "1.5px solid rgba(245,158,11,0.12)"
                          : isDelete
                          ? "1.5px solid rgba(239,68,68,0.15)"
                          : "1.5px solid rgba(255,255,255,0.06)",
                        color: confirmOn
                          ? "#060608"
                          : isConfirm
                          ? "rgba(245,158,11,0.35)"
                          : isDelete
                          ? "#f87171"
                          : "rgba(255,255,255,0.82)",
                        boxShadow: confirmOn
                          ? "0 6px 24px rgba(245,158,11,0.3), 0 2px 8px rgba(245,158,11,0.15)"
                          : "none",
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.5 : 1,
                        transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {loading && isConfirm ? (
                        <span className="animate-spin rounded-full" style={{
                          width: "20px", height: "20px",
                          border: "2.5px solid rgba(6,6,8,0.15)",
                          borderTopColor: "#060608",
                          display: "inline-block",
                        }} />
                      ) : key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom version on mobile */}
        <p className="lg:hidden absolute bottom-5 text-[10px] tracking-widest" style={{ color: "rgba(255,255,255,0.1)" }}>
          HALAL TECH ERP v2.0
        </p>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes lp-ring1 {
          0%, 100% { opacity: 0.7; transform: scale(1.12); }
          50%       { opacity: 0.3; transform: scale(1.22); }
        }
        @keyframes lp-ring2 {
          0%, 100% { opacity: 0.4; transform: scale(1.28); }
          50%       { opacity: 0.1; transform: scale(1.42); }
        }
        @keyframes lp-breathe {
          0%, 100% { box-shadow: 0 0 0 0 transparent, 0 8px 32px rgba(245,158,11,0.18); }
          50%       { box-shadow: 0 0 0 6px rgba(245,158,11,0.06), 0 12px 40px rgba(245,158,11,0.28); }
        }
        @keyframes lp-shimmer {
          0%   { transform: translateX(-110%); }
          100% { transform: translateX(110%); }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ACCOUNT CARD — sub-component
════════════════════════════════════════════════════════════ */
interface AccountCardProps {
  user: ErpUser;
  colorFrom: string;
  colorTo: string;
  onSelect: () => void;
}

const ROLE_LABELS_MAP: Record<string, string> = {
  admin: "مدير", manager: "مشرف",
  cashier: "كاشير", salesperson: "مندوب مبيعات",
};

function AccountCard({ user, colorFrom, colorTo, onSelect }: AccountCardProps) {
  const cardRef    = useRef<HTMLDivElement>(null);
  const shimmerRef = useRef<HTMLDivElement>(null);
  const arrowRef   = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);

  const handleEnter = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform   = "translateY(-5px)";
    el.style.borderColor = "rgba(245,158,11,0.3)";
    el.style.boxShadow   = "0 16px 48px rgba(245,158,11,0.14), 0 4px 16px rgba(0,0,0,0.4)";

    /* shimmer sweep */
    if (shimmerRef.current) {
      animate(shimmerRef.current, {
        translateX: ["-110%", "110%"],
        duration: 540,
        easing: "easeInOutSine",
      });
    }

    /* elastic arrow */
    if (arrowRef.current) {
      animate(arrowRef.current, {
        translateX: [0, -6, 2, -4, 0],
        duration: 480,
        easing: "easeOutElastic(1, .5)",
      });
    }
  };

  const handleLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform   = "translateY(0)";
    el.style.borderColor = "rgba(255,255,255,0.07)";
    el.style.boxShadow   = "none";
  };

  const handleClick = () => {
    setPressed(true);
    const el = cardRef.current;
    if (el) animate(el, { scale: [1, 0.97, 1.01, 1], duration: 240, easing: "easeOutBack" });
    setTimeout(() => { setPressed(false); onSelect(); }, 180);
  };

  return (
    <div
      ref={cardRef}
      className="account-card"
      onClick={handleClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        borderRadius: "18px",
        padding: "16px 18px",
        background: pressed
          ? "rgba(255,255,255,0.06)"
          : "rgba(255,255,255,0.035)",
        border: "1.5px solid rgba(255,255,255,0.07)",
        transition: "transform 0.22s cubic-bezier(.22,.68,0,1.5), box-shadow 0.22s ease, border-color 0.22s, background 0.12s",
        userSelect: "none",
        opacity: 0,
      }}
    >
      {/* Shimmer overlay */}
      <div
        ref={shimmerRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.055) 50%, transparent 65%)",
          transform: "translateX(-110%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: "14px" }}>
        {/* Avatar + online dot */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: "54px", height: "54px",
            borderRadius: "16px",
            background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", fontWeight: 900, color: "#fff",
            boxShadow: `0 6px 20px ${colorFrom}40`,
          }}>
            {user.name.charAt(0)}
          </div>

          {/* Online dot */}
          <div style={{
            position: "absolute",
            bottom: "2px", left: "2px",
            width: "12px", height: "12px",
            borderRadius: "50%",
            background: "#22c55e",
            border: "2.5px solid #07070f",
            boxShadow: "0 0 8px rgba(34,197,94,0.7)",
          }} />
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", lineHeight: 1.25, marginBottom: "3px" }}>
            {user.name}
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.38)", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: "100px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: "11px",
            }}>
              {ROLE_LABELS_MAP[user.role] || user.role}
            </span>
          </div>
        </div>

        {/* Elastic arrow */}
        <div ref={arrowRef} style={{ color: "rgba(255,255,255,0.18)", fontSize: "20px", flexShrink: 0 }}>
          ←
        </div>
      </div>
    </div>
  );
}
