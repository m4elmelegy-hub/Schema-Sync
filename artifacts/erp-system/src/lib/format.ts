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

export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return "0.00";
  const code = getActiveCurrency();
  const { locale, symbol } = CURRENCY_MAP[code];
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${symbol}`;
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
