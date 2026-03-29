const STORAGE_KEY = "halal_erp_settings";

type CurrencyCode = "EGP" | "SAR" | "AED" | "USD" | "KWD" | "BHD";

const CURRENCY_MAP: Record<CurrencyCode, { locale: string; symbol: string }> = {
  EGP: { locale: "ar-EG", symbol: "ج.م" },
  SAR: { locale: "ar-SA", symbol: "ر.س" },
  AED: { locale: "ar-AE", symbol: "د.إ" },
  USD: { locale: "en-US", symbol: "$" },
  KWD: { locale: "ar-KW", symbol: "د.ك" },
  BHD: { locale: "ar-BH", symbol: "د.ب" },
};

/* ─── numeral helpers ──────────────────────────────────────── */

/** Convert Arabic-Indic digits (٠١٢…) → Western digits (012…) */
function toWestern(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0630));
}

/** Convert Western digits (012…) → Arabic-Indic digits (٠١٢…) */
function toArabicIndic(str: string): string {
  return str.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x0630));
}

function getActiveCurrency(): CurrencyCode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.currency && CURRENCY_MAP[parsed.currency as CurrencyCode]) {
        return parsed.currency as CurrencyCode;
      }
    }
  } catch {}
  return "EGP";
}

function getActiveNumberFormat(): "western" | "arabic-indic" {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.numberFormat === "arabic-indic") return "arabic-indic";
    }
  } catch {}
  return "western";
}

/** Apply the stored number-format preference to an already-formatted string */
function applyNumberFormat(str: string, fmt: "western" | "arabic-indic"): string {
  if (fmt === "arabic-indic") return toArabicIndic(toWestern(str)); // normalise then convert
  return toWestern(str); // strip any Arabic-Indic digits
}

export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return "0.00";
  const code = getActiveCurrency();
  const { locale, symbol } = CURRENCY_MAP[code];
  const fmt = getActiveNumberFormat();
  try {
    const raw = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return applyNumberFormat(raw, fmt);
  } catch {
    const raw = `${amount.toFixed(2)} ${symbol}`;
    return applyNumberFormat(raw, fmt);
  }
}

/**
 * Format a plain number according to the stored number-format preference.
 * @param value   The number to format
 * @param decimals  Number of decimal places (default 2)
 */
export function formatNumber(value: number | undefined | null, decimals = 2): string {
  if (value === undefined || value === null) return "0";
  const fmt = getActiveNumberFormat();
  const raw = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return applyNumberFormat(raw, fmt);
}

/**
 * Preview-only formatter — does NOT read from localStorage.
 * Used for live previews where the user has not yet saved settings.
 */
export function formatCurrencyPreview(
  amount: number,
  currency: CurrencyCode,
  numberFormat: "western" | "arabic-indic",
): string {
  const { locale, symbol } = CURRENCY_MAP[currency];
  try {
    const raw = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return applyNumberFormat(raw, numberFormat);
  } catch {
    const raw = `${amount.toFixed(2)} ${symbol}`;
    return applyNumberFormat(raw, numberFormat);
  }
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
