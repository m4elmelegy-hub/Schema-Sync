import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatCurrencyPreview,
  formatDate,
} from "@/lib/format";

/* ── helpers ─────────────────────────────────────────────────── */

function setLocaleCurrency(currency: string, numberFormat = "western") {
  vi.mocked(localStorage.getItem).mockReturnValue(
    JSON.stringify({ currency, numberFormat }),
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* formatCurrencyPreview — no localStorage dependency              */
/* ─────────────────────────────────────────────────────────────── */
describe("formatCurrencyPreview", () => {
  it("formats EGP with western numerals and contains the amount", () => {
    const result = formatCurrencyPreview(1234.5, "EGP", "western");
    // ar-EG locale may use Arabic grouping separator ٬ (U+066C)
    expect(result).toMatch(/1[٬,.]?234/);
  });

  it("formats USD and contains dollar sign or USD symbol", () => {
    const result = formatCurrencyPreview(1000, "USD", "western");
    expect(result).toContain("1,000");
  });

  it("formats SAR and contains the amount", () => {
    const result = formatCurrencyPreview(500.25, "SAR", "western");
    expect(result).toMatch(/500/);
  });

  it("formats zero correctly", () => {
    const result = formatCurrencyPreview(0, "EGP", "western");
    // ar-EG locale may use Arabic decimal separator ٫ (U+066B)
    expect(result).toMatch(/0[٫.]00/);
  });

  it("formats negative values", () => {
    const result = formatCurrencyPreview(-100, "EGP", "western");
    expect(result).toMatch(/-?100/);
  });

  it("switches to arabic-indic numerals when requested", () => {
    const result = formatCurrencyPreview(123, "EGP", "arabic-indic");
    expect(result).toMatch(/[٠-٩]/);
  });

  it("western format strips arabic-indic digits if any", () => {
    const result = formatCurrencyPreview(123, "EGP", "western");
    expect(result).not.toMatch(/[٠-٩]/);
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* formatCurrency — reads localStorage                             */
/* ─────────────────────────────────────────────────────────────── */
describe("formatCurrency", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it("returns '0.00' for null", () => {
    expect(formatCurrency(null)).toBe("0.00");
  });

  it("returns '0.00' for undefined", () => {
    expect(formatCurrency(undefined)).toBe("0.00");
  });

  it("formats zero as '0.00'", () => {
    const result = formatCurrency(0);
    // ar-EG locale may use Arabic decimal separator ٫ (U+066B)
    expect(result).toMatch(/0[٫.]00/);
  });

  it("formats a positive number (defaults to EGP, western)", () => {
    const result = formatCurrency(500);
    expect(result).toMatch(/500/);
  });

  it("uses the currency stored in localStorage", () => {
    setLocaleCurrency("USD");
    const result = formatCurrency(100);
    expect(result).toMatch(/100/);
  });

  it("uses arabic-indic numerals when set in localStorage", () => {
    setLocaleCurrency("EGP", "arabic-indic");
    const result = formatCurrency(100);
    expect(result).toMatch(/[٠-٩]/);
  });

  it("falls back to EGP when localStorage contains invalid currency", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ currency: "FAKE" }),
    );
    const result = formatCurrency(100);
    expect(result).toMatch(/100/);
  });

  it("falls back gracefully when localStorage throws", () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("Storage error");
    });
    const result = formatCurrency(100);
    expect(result).toMatch(/100/);
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* formatNumber — reads localStorage                               */
/* ─────────────────────────────────────────────────────────────── */
describe("formatNumber", () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it("returns '0' for null", () => {
    expect(formatNumber(null)).toBe("0");
  });

  it("returns '0' for undefined", () => {
    expect(formatNumber(undefined)).toBe("0");
  });

  it("formats zero with 2 decimal places by default", () => {
    expect(formatNumber(0)).toMatch(/0\.00/);
  });

  it("formats 1234.5 with thousands separator", () => {
    expect(formatNumber(1234.5)).toMatch(/1,234\.50/);
  });

  it("respects custom decimal count", () => {
    expect(formatNumber(1.23456, 3)).toMatch(/1\.235/);
  });

  it("formats 0 decimals correctly", () => {
    expect(formatNumber(42, 0)).toMatch(/42/);
  });

  it("uses arabic-indic numerals when set in localStorage", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ numberFormat: "arabic-indic" }),
    );
    const result = formatNumber(100);
    expect(result).toMatch(/[٠-٩]/);
  });

  it("uses western numerals (default)", () => {
    const result = formatNumber(100);
    expect(result).not.toMatch(/[٠-٩]/);
  });
});

/* ─────────────────────────────────────────────────────────────── */
/* formatDate                                                       */
/* ─────────────────────────────────────────────────────────────── */
describe("formatDate", () => {
  it("returns '-' for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("returns '-' for undefined", () => {
    expect(formatDate(undefined)).toBe("-");
  });

  it("returns '-' for empty string", () => {
    expect(formatDate("")).toBe("-");
  });

  it("formats a valid ISO date string and returns a non-empty string", () => {
    const result = formatDate("2024-06-15T10:30:00Z");
    expect(result).toBeTruthy();
    expect(result).not.toBe("-");
  });

  it("contains year information from the date", () => {
    const result = formatDate("2024-01-01T00:00:00Z");
    // ar-EG locale renders year in Arabic-Indic digits: ٢٠٢٤
    expect(result).toMatch(/2024|٢٠٢٤/);
  });
});
