import { useState } from "react";
import { useAppSettings } from "@/contexts/app-settings";
import { formatCurrencyPreview } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Check, Save, CheckCircle2, DollarSign, AlignLeft, CaseSensitive, Sun } from "lucide-react";
import { PageHeader } from "./_shared";
import type { CurrencyCode, NumberFormat, FontFamily, LightVariant } from "@/contexts/app-settings";

const CURRENCY_OPTIONS: { code: CurrencyCode; flag: string; label: string; symbol: string }[] = [
  { code: "EGP", flag: "🇪🇬", label: "جنيه مصري",    symbol: "ج.م" },
  { code: "SAR", flag: "🇸🇦", label: "ريال سعودي",   symbol: "ر.س" },
  { code: "AED", flag: "🇦🇪", label: "درهم إماراتي", symbol: "د.إ" },
  { code: "USD", flag: "🇺🇸", label: "دولار أمريكي", symbol: "$"   },
  { code: "KWD", flag: "🇰🇼", label: "دينار كويتي",  symbol: "د.ك" },
  { code: "BHD", flag: "🇧🇭", label: "دينار بحريني", symbol: "د.ب" },
];

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; preview: string; example: string }[] = [
  { value: "western",      label: "أرقام غربية",       preview: "1,234.56",   example: "1 2 3 … 9" },
  { value: "arabic-indic", label: "أرقام عربية-هندية", preview: "١٬٢٣٤٫٥٦", example: "١ ٢ ٣ … ٩" },
];

const FONT_WEIGHT_OPTIONS = [
  { value: 400, label: "عادي",  labelEn: "Regular" },
  { value: 500, label: "متوسط", labelEn: "Medium"  },
  { value: 700, label: "عريض",  labelEn: "Bold"    },
] as const;

const STORE_FONT_OPTIONS: { key: FontFamily; label: string; preview: string }[] = [
  { key: "Cairo",   label: "القاهرة", preview: "أبجد هوز — Cairo"   },
  { key: "Tajawal", label: "تجوال",   preview: "أبجد هوز — Tajawal" },
  { key: "Inter",   label: "Inter",   preview: "ABCD efgh — Inter"  },
];

function Section({ icon: Icon, title, children }: { icon: React.FC<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/5 rounded-2xl overflow-hidden" style={{ background: "var(--erp-bg-card)" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5">
        <Icon className="w-4 h-4 text-amber-400" />
        <p className="text-white/70 text-xs font-bold uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function CurrencyTab() {
  const { settings, update } = useAppSettings();
  const { toast } = useToast();

  const [localCurrency,     setLocalCurrency]     = useState<CurrencyCode>(settings.currency);
  const [localNumFmt,       setLocalNumFmt]       = useState<NumberFormat>(settings.numberFormat ?? "western");
  const [localFontFamily,   setLocalFontFamily]   = useState<FontFamily>(settings.fontFamily);
  const [localFontWeight,   setLocalFontWeight]   = useState<number>(settings.fontWeightNormal ?? 400);
  const [localLightVariant, setLocalLightVariant] = useState<LightVariant>(settings.lightVariant ?? "soft");
  const [saved,             setSaved]             = useState(false);

  const isLightMode = settings.theme === "light";
  const previewAmounts = [100, 1234.56, 50000, 999999];

  const handleSave = () => {
    update({ currency: localCurrency, numberFormat: localNumFmt, fontFamily: localFontFamily, fontWeightNormal: localFontWeight, lightVariant: localLightVariant });
    setSaved(true);
    toast({ title: "تم حفظ الإعدادات ✓", description: "تم تطبيق إعدادات المتجر على كامل النظام" });
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="إعدادات المتجر" sub="تخصيص العملة والأرقام والخطوط المستخدمة في النظام" />

      {/* Currency */}
      <Section icon={DollarSign} title="إعدادات العملة">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CURRENCY_OPTIONS.map(o => {
            const active = localCurrency === o.code;
            return (
              <button key={o.code} onClick={() => setLocalCurrency(o.code)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-right transition-all hover:-translate-y-0.5 ${
                  active ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]" : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}>
                <span className="text-2xl">{o.flag}</span>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${active ? "text-amber-400" : "text-white/80"}`}>{o.label}</p>
                  <p className="text-white/30 text-xs mt-0.5">{o.code} · {o.symbol}</p>
                </div>
                {active && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Number Format */}
      <Section icon={CaseSensitive} title="إعدادات الأرقام">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {NUMBER_FORMAT_OPTIONS.map(o => {
            const active = localNumFmt === o.value;
            return (
              <button key={o.value} onClick={() => setLocalNumFmt(o.value)}
                className={`flex items-center gap-4 p-4 rounded-xl border text-right transition-all ${
                  active ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]" : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${active ? "text-amber-400" : "text-white/80"}`}>{o.label}</p>
                  <p className="text-white/30 text-xs mt-0.5">{o.example}</p>
                </div>
                <span className={`text-lg font-black ${active ? "text-amber-400" : "text-white/30"}`}>{o.preview}</span>
                {active && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="mt-4 bg-[#0D1424] rounded-xl p-4 border border-white/5">
          <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mb-3">معاينة مباشرة</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {previewAmounts.map(n => (
              <div key={n} className="bg-[#111827] rounded-lg p-2.5 text-center border border-white/5">
                <p className="text-amber-400 font-black text-sm">{formatCurrencyPreview(n, localCurrency, localNumFmt)}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Font */}
      <Section icon={AlignLeft} title="إعدادات الخطوط">
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-3">نوع الخط</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {STORE_FONT_OPTIONS.map(f => {
            const active = localFontFamily === f.key;
            return (
              <button key={f.key} onClick={() => setLocalFontFamily(f.key)}
                className={`flex flex-col gap-1.5 p-4 rounded-xl border text-right transition-all ${
                  active ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]" : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}>
                <div className="flex items-center justify-between">
                  <p className={`font-bold text-sm ${active ? "text-amber-400" : "text-white/80"}`}>{f.label}</p>
                  {active && <Check className="w-4 h-4 text-amber-400" />}
                </div>
                <p className="text-white/40 text-xs" style={{ fontFamily: `'${f.key}', sans-serif` }}>{f.preview}</p>
              </button>
            );
          })}
        </div>

        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-3">وزن الخط</p>
        <div className="grid grid-cols-3 gap-3">
          {FONT_WEIGHT_OPTIONS.map(w => {
            const active = localFontWeight === w.value;
            return (
              <button key={w.value} onClick={() => setLocalFontWeight(w.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                  active ? "bg-amber-500/10 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)]" : "bg-[#1A2235] border-[#2D3748] hover:border-amber-500/30"
                }`}>
                <span className={`text-2xl ${active ? "text-amber-400" : "text-white/50"}`}
                  style={{ fontFamily: `'${localFontFamily}', sans-serif`, fontWeight: w.value }}>أ</span>
                <div className="text-center">
                  <p className={`font-bold text-xs ${active ? "text-amber-400" : "text-white/70"}`}>{w.label}</p>
                  <p className="text-white/25 text-[10px]">{w.labelEn} · {w.value}</p>
                </div>
                {active && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Light Mode Variant */}
      <Section icon={Sun} title="مظهر الواجهة الفاتحة">
        {!isLightMode ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[#1A2235] border border-white/5">
            <Sun className="w-4 h-4 text-white/20 shrink-0" />
            <p className="text-white/30 text-sm">فعّل الوضع الفاتح أولاً من زر تبديل الثيم في الشريط العلوي</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { v: "soft" as LightVariant, label: "ناعم — Soft", desc: "خلفية كريمية هادئة، حدود خفيفة، ظلال ناعمة", bg: "#FAFAFA", previewBg: "#FFFFFF", borderCol: "#E5E7EB" },
              { v: "high-contrast" as LightVariant, label: "تباين عالٍ — High Contrast", desc: "خلفية بيضاء نقية، حدود داكنة", bg: "#FFFFFF", previewBg: "#FFFFFF", borderCol: "#9CA3AF" },
            ].map(opt => {
              const active = localLightVariant === opt.v;
              return (
                <button key={opt.v} onClick={() => setLocalLightVariant(opt.v)}
                  className={`relative flex flex-col gap-3 p-4 rounded-2xl border-2 text-right transition-all overflow-hidden ${
                    active ? "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.25)]" : "border-gray-200 hover:border-amber-300"
                  }`} style={{ background: opt.bg }}>
                  {active && (
                    <span className="absolute top-3 left-3 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </span>
                  )}
                  <div className="w-full rounded-xl overflow-hidden border shadow-sm" style={{ background: opt.previewBg, borderColor: opt.borderCol }}>
                    <div className="h-5 flex items-center gap-1.5 px-2" style={{ background: opt.v === "soft" ? "#F5F5F5" : "#E8EBF0", borderBottom: `1px solid ${opt.borderCol}` }}>
                      <div className="w-8 h-1.5 rounded-full" style={{ background: opt.borderCol }} />
                      <div className="w-12 h-1.5 rounded-full" style={{ background: opt.borderCol }} />
                    </div>
                    <div className="p-2 flex gap-1.5">
                      <div className="flex-1 h-7 rounded-lg" style={{ background: opt.v === "soft" ? "#F5F5F5" : "#FFFFFF", border: `${opt.v === "soft" ? "1px" : "1.5px"} solid ${opt.borderCol}` }} />
                      <div className="flex-1 h-7 rounded-lg" style={{ background: opt.v === "soft" ? "#F5F5F5" : "#FFFFFF", border: `${opt.v === "soft" ? "1px" : "1.5px"} solid ${opt.borderCol}` }} />
                    </div>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{opt.label}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
        style={{
          background: saved ? "rgba(52,211,153,0.9)" : "linear-gradient(to right, #F59E0B, #D97706)",
          color: "#000",
          boxShadow: saved ? "0 4px 20px rgba(52,211,153,0.3)" : "0 4px 20px rgba(245,158,11,0.25)",
        }}
      >
        {saved
          ? <><CheckCircle2 className="w-4 h-4" /> تم الحفظ</>
          : <><Save className="w-4 h-4" /> حفظ الإعدادات</>
        }
      </button>
      <p className="text-white/25 text-xs text-center">سيتم تطبيق التغييرات فوراً على جميع الشاشات والتقارير والفواتير</p>
    </div>
  );
}
