import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CurrencyCode = "EGP" | "SAR" | "AED" | "USD" | "KWD" | "BHD";
export type FontFamily = "Tajawal" | "Cairo" | "Almarai" | "Changa" | "Inter";
export type AccentColor = "amber" | "emerald" | "violet" | "sky" | "rose" | "orange";
export type FontSize = "sm" | "md" | "lg" | "xl";
export type Theme = "dark" | "light";
export type NumberFormat = "western" | "arabic-indic";

export interface AppSettings {
  currency: CurrencyCode;
  numberFormat: NumberFormat;
  fontFamily: FontFamily;
  fontSize: FontSize;
  accentColor: AccentColor;
  companyName: string;
  companySlogan: string;
  customLogo: string;
  loginBg: string;
  loginBgImage: string;
  /* ─── إعدادات المظهر المتقدمة ─── */
  customAccentHex: string;   // "" = استخدم اللون المحدد مسبقاً، "#rrggbb" = لون مخصص
  borderWidth: number;       // 0.5 — 4 بكسل
  fontWeightNormal: number;  // 400 | 500 | 600 | 700
  iconSize: number;          // 16 — 36 بكسل
  theme: Theme;              // "dark" | "light"
}

export const FONT_SIZES: Record<FontSize, { label: string; base: string; cssVal: string }> = {
  sm: { label: "صغير",   base: "13px", cssVal: "0.8125rem" },
  md: { label: "متوسط",  base: "15px", cssVal: "0.9375rem" },
  lg: { label: "كبير",   base: "17px", cssVal: "1.0625rem" },
  xl: { label: "كبير جداً", base: "19px", cssVal: "1.1875rem" },
};

const DEFAULTS: AppSettings = {
  currency: "EGP",
  numberFormat: "western",
  fontFamily: "Tajawal",
  fontSize: "md",
  accentColor: "amber",
  companyName: "Halal Tech",
  companySlogan: "الحلال = البركة",
  customLogo: "",
  loginBg: "default",
  loginBgImage: "",
  customAccentHex: "",
  borderWidth: 1,
  fontWeightNormal: 400,
  iconSize: 24,
  theme: "dark",
};

/* ─── تحويل Hex إلى HSL ─── */
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const STORAGE_KEY = "halal_erp_settings";

interface SettingsCtx {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULTS,
  update: () => {},
  reset: () => {},
});

export const CURRENCIES: Record<CurrencyCode, { label: string; symbol: string; locale: string }> = {
  EGP: { label: "جنيه مصري", symbol: "ج.م", locale: "ar-EG" },
  SAR: { label: "ريال سعودي", symbol: "ر.س", locale: "ar-SA" },
  AED: { label: "درهم إماراتي", symbol: "د.إ", locale: "ar-AE" },
  USD: { label: "دولار أمريكي", symbol: "$", locale: "en-US" },
  KWD: { label: "دينار كويتي", symbol: "د.ك", locale: "ar-KW" },
  BHD: { label: "دينار بحريني", symbol: "د.ب", locale: "ar-BH" },
};

export const FONTS: Record<FontFamily, { label: string; googleUrl: string }> = {
  Tajawal: { label: "تجوال", googleUrl: "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" },
  Cairo: { label: "القاهرة", googleUrl: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;700;800&display=swap" },
  Almarai: { label: "المرعى", googleUrl: "https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&display=swap" },
  Changa: { label: "تشانجا", googleUrl: "https://fonts.googleapis.com/css2?family=Changa:wght@400;500;700;800&display=swap" },
  Inter: { label: "Inter", googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" },
};

export const ACCENT_COLORS: Record<AccentColor, { label: string; primary: string; ring: string; bg: string }> = {
  amber:   { label: "ذهبي",   primary: "37 91% 55%",  ring: "37 91% 55%",  bg: "37 91% 55% / 0.15" },
  emerald: { label: "زمردي",  primary: "160 84% 39%", ring: "160 84% 39%", bg: "160 84% 39% / 0.15" },
  violet:  { label: "بنفسجي", primary: "262 83% 58%", ring: "262 83% 58%", bg: "262 83% 58% / 0.15" },
  sky:     { label: "سماوي",  primary: "199 89% 48%", ring: "199 89% 48%", bg: "199 89% 48% / 0.15" },
  rose:    { label: "وردي",   primary: "330 81% 60%", ring: "330 81% 60%", bg: "330 81% 60% / 0.15" },
  orange:  { label: "برتقالي", primary: "25 95% 53%", ring: "25 95% 53%",  bg: "25 95% 53% / 0.15" },
};

const LOGIN_BACKGROUNDS: Record<string, string> = {
  default: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0a0f 100%)",
  midnight: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  forest: "linear-gradient(135deg, #0a1628 0%, #0d2137 50%, #0a1628 100%)",
  sunset: "linear-gradient(135deg, #1a0a0a 0%, #2d0f1f 50%, #1a0a0a 100%)",
  ocean: "linear-gradient(135deg, #0a1628 0%, #0d2137 50%, #0a0f1a 100%)",
};

export const LOGIN_BG_OPTIONS = [
  { key: "default", label: "افتراضي" },
  { key: "midnight", label: "منتصف الليل" },
  { key: "forest", label: "الغابة" },
  { key: "sunset", label: "الغروب" },
  { key: "ocean", label: "المحيط" },
];

function applySettings(s: AppSettings) {
  const root = document.documentElement;

  // Font family — applied to html so rem units + Tailwind inherit correctly
  const fontDef = FONTS[s.fontFamily];
  root.style.setProperty("--erp-font", `'${s.fontFamily}', sans-serif`);
  root.style.fontFamily = `'${s.fontFamily}', sans-serif`;
  document.body.style.fontFamily = `'${s.fontFamily}', sans-serif`;

  // Font size — set on html so all rem-based Tailwind classes scale correctly
  const sizeVal = FONT_SIZES[s.fontSize ?? "md"].cssVal;
  root.style.setProperty("--erp-font-size", sizeVal);
  root.style.fontSize = sizeVal;
  document.body.style.fontSize = sizeVal;

  // Load Google Font
  const existingLink = document.getElementById("erp-font-link");
  if (existingLink) existingLink.remove();
  const link = document.createElement("link");
  link.id = "erp-font-link";
  link.rel = "stylesheet";
  link.href = fontDef.googleUrl;
  document.head.appendChild(link);

  // Accent color — اللون المخصص يتجاوز الألوان المحددة مسبقاً
  if (s.customAccentHex && /^#[0-9a-fA-F]{6}$/.test(s.customAccentHex)) {
    const hsl = hexToHsl(s.customAccentHex);
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--ring", hsl);
  } else {
    const accent = ACCENT_COLORS[s.accentColor];
    root.style.setProperty("--primary", accent.primary);
    root.style.setProperty("--ring", accent.ring);
  }

  // Border width — سماكة الحدود
  root.style.setProperty("--erp-border-width", `${s.borderWidth ?? 1}px`);

  // Font weight — سماكة النص
  const fw = String(s.fontWeightNormal ?? 400);
  root.style.setProperty("--erp-font-weight", fw);
  document.body.style.fontWeight = fw;

  // Icon size — حجم الأيقونات
  root.style.setProperty("--erp-icon-size", `${s.iconSize ?? 24}px`);

  // Theme — dark / light
  if ((s.theme ?? "dark") === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
    root.setAttribute("data-theme", "dark");
  }
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  const update = (patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSettings(DEFAULTS);
  };

  return <Ctx.Provider value={{ settings, update, reset }}>{children}</Ctx.Provider>;
}

export function useAppSettings() {
  return useContext(Ctx);
}

export function formatCurrencyWithSettings(amount: number | undefined | null, currency: CurrencyCode): string {
  if (amount === undefined || amount === null) return `0.00 ${CURRENCIES[currency].symbol}`;
  const cur = CURRENCIES[currency];
  try {
    return new Intl.NumberFormat(cur.locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur.symbol}`;
  }
}

export function getLoginBgStyle(bgKey: string): string {
  return LOGIN_BACKGROUNDS[bgKey] || LOGIN_BACKGROUNDS.default;
}
