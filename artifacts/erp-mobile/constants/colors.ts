// Halal Tech ERP — Mobile Color System
// Light: Clean professional whites + amber gold
// Dark: Deep navy glass-morphism + amber gold (optimized for OLED mobile)

const colors = {
  light: {
    // ── خلفيات ──
    background:      "#F4F6FA",
    foreground:      "#0F172A",
    text:            "#0F172A",
    tint:            "#F59E0B",

    // ── بطاقات ──
    card:            "#FFFFFF",
    cardBorder:      "rgba(0,0,0,0.07)",
    cardForeground:  "#0F172A",

    // ── Primary (ذهبي عنبري) ──
    primary:         "#F59E0B",
    primaryForeground: "#FFFFFF",
    primaryGlow:     "rgba(245,158,11,0.12)",
    primaryBorder:   "rgba(245,158,11,0.35)",

    // ── ثانوي ──
    secondary:       "#F1F5F9",
    secondaryForeground: "#0F172A",

    // ── Muted ──
    muted:           "#F1F5F9",
    mutedForeground: "#64748B",

    // ── Accent (بنفسجي) ──
    accent:          "#7C3AED",
    accentForeground: "#FFFFFF",

    // ── حالات ──
    destructive:     "#EF4444",
    destructiveForeground: "#FFFFFF",
    success:         "#10B981",
    successForeground: "#FFFFFF",
    warning:         "#F59E0B",
    warningForeground: "#FFFFFF",

    // ── الحدود والمدخلات ──
    border:          "#E2E8F0",
    input:           "#F8FAFC",

    // ── الهيدر والتاب بار ──
    headerBg:        "#FFFFFF",
    headerText:      "#0F172A",
    tabBar:          "#FFFFFF",

    // ── الظل ──
    shadow:          "rgba(0,0,0,0.10)",

    // ── سطوح متعددة ──
    surface0:        "#F4F6FA",
    surface1:        "rgba(255,255,255,0.97)",
    surface2:        "rgba(248,250,252,0.98)",
  },

  dark: {
    // ── خلفيات (محسّنة لموبايل - ليست سوداء تماماً) ──
    background:      "#0F1117",
    foreground:      "#F0F7FF",
    text:            "#F0F7FF",
    tint:            "#F59E0B",

    // ── بطاقات (أفتح لتمييز أفضل على الموبايل) ──
    card:            "#1A2035",
    cardBorder:      "rgba(255,255,255,0.09)",
    cardForeground:  "#F0F7FF",

    // ── Primary (ذهبي عنبري) ──
    primary:         "#F59E0B",
    primaryForeground: "#0a0500",
    primaryGlow:     "rgba(245,158,11,0.15)",
    primaryBorder:   "rgba(245,158,11,0.28)",

    // ── ثانوي ──
    secondary:       "#1E2740",
    secondaryForeground: "#F0F7FF",

    // ── Muted ──
    muted:           "#161D30",
    mutedForeground: "#94A3B8",

    // ── Accent (بنفسجي) ──
    accent:          "#7C3AED",
    accentForeground: "#F0F7FF",

    // ── حالات ──
    destructive:     "#EF4444",
    destructiveForeground: "#FFFFFF",
    success:         "#10B981",
    successForeground: "#FFFFFF",
    warning:         "#F59E0B",
    warningForeground: "#0a0500",

    // ── الحدود (أوضح للموبايل) ──
    border:          "#2A3248",
    input:           "#1E2740",

    // ── الهيدر والتاب بار ──
    headerBg:        "#0D1020",
    headerText:      "#F0F7FF",
    tabBar:          "#0D1020",

    // ── الظل ──
    shadow:          "rgba(0,0,0,0.55)",

    // ── سطوح ──
    surface0:        "#0F1117",
    surface1:        "rgba(22,29,48,0.95)",
    surface2:        "rgba(26,32,53,0.98)",
  },

  radius: 16,
};

export default colors;
