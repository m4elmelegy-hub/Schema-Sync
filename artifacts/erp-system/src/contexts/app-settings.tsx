import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CurrencyCode = "EGP" | "SAR" | "AED" | "USD" | "KWD" | "BHD";
export type FontFamily = "Tajawal" | "Cairo" | "Almarai" | "Changa";
export type AccentColor = "amber" | "emerald" | "violet" | "sky" | "rose" | "orange";
export type FontSize = "sm" | "md" | "lg" | "xl";

export interface AppSettings {
  currency: CurrencyCode;
  fontFamily: FontFamily;
  fontSize: FontSize;
  accentColor: AccentColor;
  companyName: string;
  companySlogan: string;
  customLogo: string;
  loginBg: string;
  loginBgImage: string;
}

export const FONT_SIZES: Record<FontSize, { label: string; base: string; cssVal: string }> = {
  sm: { label: "صغير",   base: "13px", cssVal: "0.8125rem" },
  md: { label: "متوسط",  base: "15px", cssVal: "0.9375rem" },
  lg: { label: "كبير",   base: "17px", cssVal: "1.0625rem" },
  xl: { label: "كبير جداً", base: "19px", cssVal: "1.1875rem" },
};

const DEFAULTS: AppSettings = {
  currency: "EGP",
  fontFamily: "Tajawal",
  fontSize: "md",
  accentColor: "amber",
  companyName: "Halal Tech",
  companySlogan: "الحلال = البركة",
  customLogo: "",
  loginBg: "default",
  loginBgImage: "",
};

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

  // Font family
  const fontDef = FONTS[s.fontFamily];
  root.style.setProperty("--erp-font", `'${s.fontFamily}', sans-serif`);
  document.body.style.fontFamily = `'${s.fontFamily}', sans-serif`;

  // Font size
  const sizeVal = FONT_SIZES[s.fontSize ?? "md"].cssVal;
  root.style.setProperty("--erp-font-size", sizeVal);
  document.body.style.fontSize = sizeVal;

  // Load Google Font
  const existingLink = document.getElementById("erp-font-link");
  if (existingLink) existingLink.remove();
  const link = document.createElement("link");
  link.id = "erp-font-link";
  link.rel = "stylesheet";
  link.href = fontDef.googleUrl;
  document.head.appendChild(link);

  // Accent color
  const accent = ACCENT_COLORS[s.accentColor];
  root.style.setProperty("--primary", accent.primary);
  root.style.setProperty("--ring", accent.ring);
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
