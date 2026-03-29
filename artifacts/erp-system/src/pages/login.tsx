import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useAppSettings } from "@/contexts/app-settings";
import { useLocation } from "wouter";
import { animate, createTimeline, stagger } from "animejs";
import { Shield } from "lucide-react";

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

/* ── Particle network ─────────────────────────────────────── */
const PARTICLE_COUNT = 55;
const MAX_LINK_DIST = 130;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
}

function makeParticles(w: number, h: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: Math.random() * 1.8 + 0.8,
  }));
}

/* ── Background shape definitions ───────────────────────────── */
const BG_SHAPES = [
  { size: 320, x: "-5%",  y: "-8%",  opacity: 0.06, dur: 9000,  dx: 30,  dy: 22,  solid: false, rIdx: 0 },
  { size: 200, x: "70%",  y: "60%",  opacity: 0.05, dur: 14000, dx: -24, dy: 28,  solid: true,  rIdx: 1 },
  { size: 90,  x: "20%",  y: "70%",  opacity: 0.08, dur: 7500,  dx: 16,  dy: -20, solid: true,  rIdx: 2 },
  { size: 56,  x: "74%",  y: "10%",  opacity: 0.12, dur: 10000, dx: -20, dy: 16,  solid: false, rIdx: 3 },
  { size: 170, x: "84%",  y: "74%",  opacity: 0.05, dur: 12000, dx: 20,  dy: -24, solid: true,  rIdx: 0 },
  { size: 72,  x: "50%",  y: "16%",  opacity: 0.08, dur: 7000,  dx: -16, dy: 20,  solid: false, rIdx: 1 },
  { size: 400, x: "90%",  y: "-6%",  opacity: 0.03, dur: 17000, dx: 10,  dy: 14,  solid: false, rIdx: 2 },
];

/* ── PIN keypad layout ───────────────────────────────────────── */
const KEYS = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
const MAX_PIN_DOTS = 6;

export default function Login() {
  const { login } = useAuth();
  const { settings } = useAppSettings();
  const [, setLocation] = useLocation();

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"user" | "pin">("user");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(false);

  // Refs to always hold current values — fixes stale closure in useCallback
  const pinRef = useRef(pin);
  const selectedUserRef = useRef<ErpUser | undefined>(undefined);

  const { data: users = [] } = useQuery<ErpUser[]>({
    queryKey: ["/api/settings/users"],
    queryFn: () =>
      fetch(api("/api/settings/users")).then((r) => {
        if (!r.ok) throw new Error("فشل جلب المستخدمين");
        return r.json();
      }),
  });

  const activeUsers = users.filter((u) => u.active !== false);
  const selectedUser = activeUsers.find((u) => String(u.id) === selectedUserId);
  const logoSrc = settings.customLogo || `${import.meta.env.BASE_URL}logo.png`;
  const pinLength = selectedUser ? Math.min(Math.max(selectedUser.pin.length, 4), MAX_PIN_DOTS) : 4;

  // Keep refs in sync every render so stale closures always read current values
  pinRef.current = pin;
  selectedUserRef.current = selectedUser;

  /* ── 1. Canvas particle network ──────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particlesRef.current = makeParticles(w, h);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      const ps = particlesRef.current;

      ps.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      });

      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].x - ps[j].x;
          const dy = ps[i].y - ps[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_LINK_DIST) {
            const a = (1 - d / MAX_LINK_DIST) * 0.16;
            ctx.beginPath();
            ctx.moveTo(ps[i].x, ps[i].y);
            ctx.lineTo(ps[j].x, ps[j].y);
            ctx.strokeStyle = `rgba(245,158,11,${a})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      ps.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(245,158,11,0.42)";
        ctx.fill();
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  /* ── 2. Background shape continuous float ─────────────────────── */
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".lp-bg-shape");
    els.forEach((el, i) => {
      const s = BG_SHAPES[i];
      if (!s) return;
      animate(el, {
        translateX: [0, s.dx, s.dx * 0.4, -s.dx * 0.5, 0],
        translateY: [0, s.dy * 0.5, s.dy, s.dy * 0.3, 0],
        rotate: i % 2 === 0 ? [0, 16, 0, -10, 0] : [0, -12, 8, -6, 0],
        scale: [1, 1 + 0.04 * (i % 3), 1 - 0.02 * (i % 2), 1],
        duration: s.dur,
        loop: true,
        easing: "easeInOutSine",
      });
    });
  }, []);

  /* ── 3. Entrance choreography ─────────────────────────────────── */
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const tl = createTimeline();

    tl.add("#lp-brand", {
      translateX: ["-100%", "0%"],
      opacity: [0, 1],
      duration: 950,
      easing: "easeOutExpo",
    });

    tl.add("#lp-card", {
      translateY: [50, 0],
      opacity: [0, 1],
      scale: [0.94, 1],
      duration: 800,
      easing: "easeOutExpo",
    }, 160);

    tl.add("#lp-logo", {
      scale: [0.35, 1],
      rotate: ["-18deg", "0deg"],
      opacity: [0, 1],
      duration: 720,
      easing: "easeOutBack",
    }, 420);

    tl.add(".brand-text", {
      translateY: [30, 0],
      opacity: [0, 1],
      delay: stagger(140),
      duration: 620,
      easing: "easeOutExpo",
    }, 620);

  }, []);

  /* ── 3b. User chips entrance (triggered when users data arrives) ─ */
  const chipsAnimatedRef = useRef(false);
  useEffect(() => {
    if (activeUsers.length === 0 || chipsAnimatedRef.current || step !== "user") return;
    chipsAnimatedRef.current = true;
    requestAnimationFrame(() => {
      animate(".user-chip", {
        translateY: [18, 0],
        opacity: [0, 1],
        scale: [0.9, 1],
        delay: stagger(70),
        duration: 420,
        easing: "easeOutExpo",
      });
    });
  }, [activeUsers, step]);

  /* ── 4. Error shake ───────────────────────────────────────────── */
  useEffect(() => {
    if (!error) return;
    const el = document.querySelector("#lp-error");
    if (el) {
      animate("#lp-error", {
        translateX: [0, -10, 10, -8, 8, -5, 5, -2, 2, 0],
        duration: 540,
        easing: "easeInOutSine",
      });
    }
    animate(".pin-dot", {
      scale: [1, 1.25, 0.85, 1],
      duration: 380,
      delay: stagger(45),
      easing: "easeOutBack",
    });
  }, [error]);

  /* ── 5. Keyboard support ──────────────────────────────────────── */
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

  /* ── Step transition: user → pin ─────────────────────────────── */
  const selectUser = (id: string) => {
    setSelectedUserId(id);
    setError("");
    setPin("");
    animate("#lp-user-step", {
      translateX: [0, -40],
      opacity: [1, 0],
      duration: 280,
      easing: "easeInCubic",
      onComplete: () => {
        setStep("pin");
        requestAnimationFrame(() => {
          animate("#lp-pin-step", {
            translateX: [40, 0],
            opacity: [0, 1],
            duration: 340,
            easing: "easeOutCubic",
          });
        });
      },
    });
  };

  const backToUser = () => {
    animate("#lp-pin-step", {
      translateX: [0, 40],
      opacity: [1, 0],
      duration: 260,
      easing: "easeInCubic",
      onComplete: () => {
        setStep("user");
        setPin("");
        setError("");
        requestAnimationFrame(() => {
          animate("#lp-user-step", {
            translateX: [-40, 0],
            opacity: [0, 1],
            duration: 320,
            easing: "easeOutCubic",
          });
        });
      },
    });
  };

  /* ── PIN key press ────────────────────────────────────────────── */
  const handleKeyPress = useCallback((key: string) => {
    if (loading) return;
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
      setError("");
      return;
    }
    if (key === "✓") {
      triggerLogin();
      return;
    }
    setPin((prev) => {
      if (prev.length >= MAX_PIN_DOTS) return prev;
      const next = prev + key;
      setError("");
      const idx = next.length - 1;
      requestAnimationFrame(() => {
        const dot = document.querySelector(`.pin-dot-${idx}`);
        if (dot) {
          animate(dot as HTMLElement, {
            scale: [0.4, 1.35, 1],
            duration: 300,
            easing: "easeOutBack",
          });
        }
      });
      return next;
    });
  }, [loading]);

  /* ── Key button press with ripple ────────────────────────────── */
  const handleKeyBtn = useCallback((key: string, el: HTMLElement) => {
    animate(el, {
      scale: [0.88, 1.04, 1],
      duration: 220,
      easing: "easeOutBack",
    });
    handleKeyPress(key);
  }, [handleKeyPress]);

  /* ── Login logic ──────────────────────────────────────────────── */
  const triggerLogin = async () => {
    // Read from refs to avoid stale closure (handleKeyPress is memoized with [loading] only)
    const currentUser = selectedUserRef.current;
    const currentPin = pinRef.current;

    if (!currentUser) { setError("اختر المستخدم أولاً"); return; }
    if (!currentPin) { setError("أدخل الرقم السري"); return; }
    if (loading) return;

    setLoading(true);
    setError("");

    await new Promise((r) => setTimeout(r, 460));

    if (currentUser.pin !== currentPin) {
      setError("الرقم السري غير صحيح");
      setPin("");
      setLoading(false);
      return;
    }

    /* Success flash */
    animate("#lp-card", {
      scale: [1, 1.025, 1],
      duration: 320,
      easing: "easeOutCubic",
    });
    animate("#lp-brand", {
      opacity: [1, 0.6, 1],
      duration: 500,
      easing: "easeOutCubic",
    });

    setTimeout(() => {
      animate("#lp-card", {
        scale: [1, 0.94],
        opacity: [1, 0],
        duration: 300,
        easing: "easeInCubic",
        onComplete: () => {
          login({
            id: currentUser.id,
            name: currentUser.name,
            username: currentUser.username,
            role: currentUser.role,
          });
          setLocation("/");
        },
      });
    }, 340);
  };

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div
      className="min-h-screen flex overflow-hidden"
      style={{ direction: "ltr", background: "#070707" }}
    >
      {/* ════════════════════════════════════════════════════════════
          LEFT PANEL — Particle canvas + Brand
      ════════════════════════════════════════════════════════════ */}
      <div
        id="lp-brand"
        className="hidden lg:flex w-[58%] relative flex-col items-center justify-center overflow-hidden"
        style={{ background: "#060606" }}
      >
        {/* Particle canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Floating geometric shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {BG_SHAPES.map((s, i) => {
            const radii = ["28%", "50%", "38%", "50%"];
            return (
              <div
                key={i}
                className="lp-bg-shape absolute"
                style={{
                  width: s.size,
                  height: s.size,
                  left: s.x,
                  top: s.y,
                  opacity: s.opacity,
                  borderRadius: radii[s.rIdx],
                  background: s.solid
                    ? "radial-gradient(circle at 35% 35%, rgba(245,158,11,0.9), rgba(180,83,9,0.4), transparent 70%)"
                    : "transparent",
                  border: !s.solid
                    ? `${Math.max(1.5, s.size / 60)}px solid rgba(245,158,11,0.6)`
                    : "none",
                  transform: "translate(-50%, -50%)",
                }}
              />
            );
          })}
        </div>

        {/* Radial glow wash */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 30% 40%, rgba(245,158,11,0.10) 0%, transparent 55%)," +
              "radial-gradient(ellipse at 76% 72%, rgba(180,83,9,0.07) 0%, transparent 50%)," +
              "radial-gradient(ellipse at 62% 10%, rgba(245,158,11,0.05) 0%, transparent 40%)",
          }}
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(245,158,11,0.032) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(245,158,11,0.032) 1px, transparent 1px)",
            backgroundSize: "58px 58px",
          }}
        />

        {/* Edge glows */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
        <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-amber-500/28 to-transparent" />

        {/* Brand content */}
        <div className="relative z-10 text-center px-16 max-w-lg" dir="rtl">

          {/* Logo with pulsing rings */}
          <div id="lp-logo" className="flex justify-center mb-10">
            <div className="relative">
              {/* Ring 1 */}
              <div
                className="absolute rounded-[36px] animate-ping pointer-events-none"
                style={{
                  inset: "-10px",
                  border: "1.5px solid rgba(245,158,11,0.22)",
                  animationDuration: "2.8s",
                  opacity: 0.7,
                }}
              />
              {/* Ring 2 */}
              <div
                className="absolute rounded-[42px] animate-ping pointer-events-none"
                style={{
                  inset: "-22px",
                  border: "1px solid rgba(245,158,11,0.10)",
                  animationDuration: "3.8s",
                  animationDelay: "0.6s",
                  opacity: 0.5,
                }}
              />

              <div
                className="w-32 h-32 rounded-[30px] flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(145deg, rgba(245,158,11,0.14) 0%, rgba(180,83,9,0.08) 100%)",
                  border: "1.5px solid rgba(245,158,11,0.28)",
                  boxShadow:
                    "0 0 56px rgba(245,158,11,0.14), 0 0 120px rgba(245,158,11,0.06)," +
                    "inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                <img
                  src={logoSrc}
                  alt={settings.companyName}
                  style={{ width: "5.5rem", height: "5.5rem", objectFit: "contain" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>

              {/* Shield badge */}
              <div
                className="absolute -bottom-2 -left-2 w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  border: "2.5px solid #060606",
                  boxShadow: "0 0 20px rgba(16,185,129,0.48)",
                }}
              >
                <Shield className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          <h1 className="brand-text text-5xl font-black text-white mb-3 tracking-tight leading-snug">
            {settings.companyName}
          </h1>
          <p className="brand-text text-amber-400/60 text-xl mb-14 font-medium tracking-wide">
            {settings.companySlogan || "نظام إدارة متكامل"}
          </p>

          {/* Feature pills */}
          <div className="brand-text flex flex-wrap justify-center gap-2 mb-16">
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
                  background: "rgba(245,158,11,0.055)",
                  border: "1px solid rgba(245,158,11,0.15)",
                  color: "rgba(255,255,255,0.48)",
                }}
              >
                {f.icon} {f.label}
              </span>
            ))}
          </div>

          <p className="brand-text text-white/10 text-xs tracking-[0.28em] uppercase">
            Halal Tech ERP v2.0
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          RIGHT PANEL — Glass card login
      ════════════════════════════════════════════════════════════ */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 relative"
        dir="rtl"
        style={{
          background:
            "linear-gradient(160deg, #0c0c0c 0%, #0f0f0f 55%, #090909 100%)",
        }}
      >
        {/* Corner glow */}
        <div
          className="absolute bottom-0 left-0 w-96 h-96 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at bottom left, rgba(245,158,11,0.035) 0%, transparent 65%)",
          }}
        />
        <div
          className="absolute top-0 right-0 w-72 h-72 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at top right, rgba(245,158,11,0.025) 0%, transparent 60%)",
          }}
        />

        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-10">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.18)",
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

        {/* ── Glassmorphism card ── */}
        <div
          id="lp-card"
          className="w-full max-w-[360px] rounded-3xl p-7 relative overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.022)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255,255,255,0.065)",
            boxShadow:
              "0 28px 72px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.3)," +
              "inset 0 1px 0 rgba(255,255,255,0.048)",
          }}
        >
          {/* Top gradient line */}
          <div
            className="absolute top-0 inset-x-0 h-px pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.4) 50%, transparent 100%)",
            }}
          />

          {/* ─── STEP 1: User selection ─────────────────────────────── */}
          {step === "user" && (
            <div id="lp-user-step">
              <div className="mb-7">
                <h2 className="text-[22px] font-black text-white mb-1 leading-tight">
                  أهلاً وسهلاً 👋
                </h2>
                <p className="text-white/28 text-[13px]">اختر حسابك للمتابعة</p>
              </div>

              {activeUsers.length === 0 ? (
                <div className="py-10 text-center">
                  <div
                    className="w-8 h-8 rounded-full border-2 animate-spin mx-auto"
                    style={{
                      borderColor: "rgba(245,158,11,0.15)",
                      borderTopColor: "rgba(245,158,11,0.6)",
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {activeUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => selectUser(String(u.id))}
                      className="user-chip w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-right"
                      style={{
                        background: "rgba(255,255,255,0.028)",
                        border: "1.5px solid rgba(255,255,255,0.055)",
                        outline: "none",
                        cursor: "pointer",
                        opacity: 0,
                        transition: "background 0.18s, border-color 0.18s",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget;
                        el.style.background = "rgba(245,158,11,0.065)";
                        el.style.borderColor = "rgba(245,158,11,0.28)";
                        animate(el, {
                          translateX: [0, -3],
                          duration: 160,
                          easing: "easeOutCubic",
                        });
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget;
                        el.style.background = "rgba(255,255,255,0.028)";
                        el.style.borderColor = "rgba(255,255,255,0.055)";
                        animate(el, {
                          translateX: [-3, 0],
                          duration: 180,
                          easing: "easeOutCubic",
                        });
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-base font-black"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(180,83,9,0.12) 100%)",
                          border: "1px solid rgba(245,158,11,0.2)",
                          color: "#F59E0B",
                        }}
                      >
                        {u.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 text-right min-w-0">
                        <div className="text-[13.5px] font-bold text-white truncate">
                          {u.name}
                        </div>
                        <div className="text-[11px] text-white/28 mt-0.5">
                          {ROLE_LABELS[u.role] || u.role}
                        </div>
                      </div>

                      {/* Arrow */}
                      <span className="text-white/18 text-base flex-shrink-0">←</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: PIN keypad ──────────────────────────────────── */}
          {step === "pin" && (
            <div id="lp-pin-step">
              {/* Back + User info row */}
              <div className="flex items-center gap-3 mb-7">
                <button
                  onClick={backToUser}
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgba(255,255,255,0.38)",
                    fontSize: "18px",
                    cursor: "pointer",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.38)";
                  }}
                >
                  →
                </button>

                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(180,83,9,0.1) 100%)",
                      border: "1px solid rgba(245,158,11,0.18)",
                      color: "#F59E0B",
                    }}
                  >
                    {selectedUser?.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-white leading-tight">
                      {selectedUser?.name}
                    </div>
                    <div className="text-[11px] text-white/28">
                      {ROLE_LABELS[selectedUser?.role || ""] || selectedUser?.role}
                    </div>
                  </div>
                </div>
              </div>

              {/* Heading */}
              <div className="mb-5">
                <h2 className="text-[20px] font-black text-white mb-0.5">
                  الرقم السري
                </h2>
                <p className="text-white/22 text-[12px]">
                  اضغط على الأرقام أدناه
                  {selectedUser?.pin === "0000" && (
                    <span className="text-amber-500/50"> · الافتراضي: 0000</span>
                  )}
                </p>
              </div>

              {/* PIN dots */}
              <div className="flex justify-center gap-3.5 mb-5" dir="ltr">
                {Array.from({ length: pinLength }).map((_, i) => {
                  const filled = i < pin.length;
                  return (
                    <div
                      key={i}
                      className={`pin-dot pin-dot-${i}`}
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: filled
                          ? "linear-gradient(135deg, #F59E0B, #D97706)"
                          : "rgba(255,255,255,0.07)",
                        border: filled
                          ? "none"
                          : "1.5px solid rgba(255,255,255,0.11)",
                        boxShadow: filled
                          ? "0 0 14px rgba(245,158,11,0.55), 0 0 28px rgba(245,158,11,0.18)"
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
                  className="mb-4 flex items-center gap-2 text-[12px] rounded-xl px-3.5 py-2.5"
                  style={{
                    background: "rgba(239,68,68,0.065)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    color: "#f87171",
                  }}
                >
                  <span className="text-sm">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* PIN Keypad */}
              <div className="grid grid-cols-3 gap-2" dir="ltr">
                {KEYS.map((key) => {
                  const isConfirm = key === "✓";
                  const isDelete = key === "⌫";
                  const confirmActive = isConfirm && pin.length > 0;

                  return (
                    <button
                      key={key}
                      disabled={loading && !isDelete}
                      onClick={(e) => handleKeyBtn(key, e.currentTarget)}
                      className="h-[54px] rounded-2xl font-bold flex items-center justify-center select-none"
                      style={{
                        fontSize: isConfirm || isDelete ? "19px" : "21px",
                        background: confirmActive
                          ? "linear-gradient(135deg, #F59E0B 0%, #D97706 55%, #B45309 100%)"
                          : isConfirm
                          ? "rgba(245,158,11,0.04)"
                          : isDelete
                          ? "rgba(239,68,68,0.06)"
                          : "rgba(255,255,255,0.038)",
                        border: confirmActive
                          ? "1.5px solid rgba(245,158,11,0.55)"
                          : isConfirm
                          ? "1.5px solid rgba(245,158,11,0.1)"
                          : isDelete
                          ? "1.5px solid rgba(239,68,68,0.14)"
                          : "1.5px solid rgba(255,255,255,0.055)",
                        color: confirmActive
                          ? "#080808"
                          : isConfirm
                          ? "rgba(245,158,11,0.32)"
                          : isDelete
                          ? "#f87171"
                          : "#ffffffcc",
                        boxShadow: confirmActive
                          ? "0 6px 22px rgba(245,158,11,0.28), 0 2px 8px rgba(245,158,11,0.14)"
                          : "none",
                        cursor: loading && !isDelete ? "not-allowed" : "pointer",
                        opacity: loading && !isDelete && !isConfirm ? 0.5 : 1,
                        transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s",
                      }}
                    >
                      {loading && isConfirm ? (
                        <span
                          className="w-5 h-5 rounded-full border-2 animate-spin"
                          style={{
                            borderColor: "rgba(8,8,8,0.2)",
                            borderTopColor: "#080808",
                          }}
                        />
                      ) : (
                        key
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="absolute bottom-5 text-white/9 text-xs tracking-widest">
          Halal Tech ERP v2.0
        </p>
      </div>
    </div>
  );
}
