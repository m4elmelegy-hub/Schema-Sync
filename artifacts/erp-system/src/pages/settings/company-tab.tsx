/**
 * company-tab.tsx — إعدادات الشركة والعلامة التجارية
 * يحفظ عبر POST /api/settings/system
 */
import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Phone, MapPin, FileText, Globe, Loader2, Save, CheckCircle2,
} from "lucide-react";
import { PageHeader, FieldLabel, SInput } from "./_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api  = (p: string) => `${BASE}${p}`;

interface CompanySettings {
  company_name:    string;
  company_phone:   string;
  company_address: string;
  company_tax_id:  string;
  company_website: string;
  company_notes:   string;
}

const EMPTY: CompanySettings = {
  company_name:    "",
  company_phone:   "",
  company_address: "",
  company_tax_id:  "",
  company_website: "",
  company_notes:   "",
};

const FIELDS: { key: keyof CompanySettings; label: string; placeholder: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "company_name",    label: "اسم الشركة",          placeholder: "مثال: شركة حلال تك للتجارة",      icon: Building2 },
  { key: "company_phone",   label: "رقم الهاتف",           placeholder: "مثال: 966500000000+",             icon: Phone },
  { key: "company_address", label: "العنوان",              placeholder: "مثال: الرياض، حي العليا",         icon: MapPin },
  { key: "company_tax_id",  label: "الرقم الضريبي",        placeholder: "مثال: 300000000000003",           icon: FileText },
  { key: "company_website", label: "الموقع الإلكتروني",    placeholder: "مثال: https://example.com",       icon: Globe },
];

export default function CompanyTab() {
  const { toast } = useToast();

  const [form,    setForm]    = useState<CompanySettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [dirty,   setDirty]   = useState(false);

  /* ── جلب الإعدادات الحالية ── */
  useEffect(() => {
    void (async () => {
      try {
        const r = await authFetch(api("/api/settings/system"));
        if (r.ok) {
          const d = await r.json() as Partial<CompanySettings>;
          setForm(prev => ({ ...prev, ...d }));
        }
      } finally { setLoading(false); }
    })();
  }, []);

  const update = (key: keyof CompanySettings, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setDirty(true); setSaved(false);
  };

  /* ── حفظ جميع المفاتيح ── */
  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      const keys = Object.keys(form) as (keyof CompanySettings)[];
      await Promise.all(
        keys.map(k =>
          authFetch(api("/api/settings/system"), {
            method: "POST",
            body: JSON.stringify({ key: k, value: form[k] }),
          })
        )
      );
      setSaved(true); setDirty(false);
      toast({ title: "✅ تم حفظ بيانات الشركة" });
    } catch {
      toast({ title: "فشل الحفظ", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="بيانات الشركة"
        sub="الهوية التجارية تظهر في الفواتير والتقارير"
        action={
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 rounded-xl text-amber-400 font-bold text-xs transition-all disabled:opacity-40"
          >
            {saving   ? <Loader2     className="w-3.5 h-3.5 animate-spin" />
            : saved   ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            :           <Save         className="w-3.5 h-3.5" />}
            {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ التغييرات"}
          </button>
        }
      />

      {/* ═══════════════════════════════════════════════════
          بطاقة — بيانات الشركة الأساسية
      ════════════════════════════════════════════════════ */}
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">المعلومات الأساسية</p>
            <p className="text-white/30 text-xs">تُستخدم في رأس الفواتير والتقارير المطبوعة</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-white/25 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />جاري التحميل...
          </div>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELDS.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.key} className={f.key === "company_name" ? "sm:col-span-2" : ""}>
                  <FieldLabel>
                    <span className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-white/30" />
                      {f.label}
                    </span>
                  </FieldLabel>
                  <SInput
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={e => update(f.key, e.target.value)}
                  />
                </div>
              );
            })}

            {/* ملاحظات */}
            <div className="sm:col-span-2">
              <FieldLabel>ملاحظات إضافية</FieldLabel>
              <textarea
                rows={3}
                placeholder="أي معلومات إضافية تظهر أسفل الفواتير..."
                value={form.company_notes}
                onChange={e => update("company_notes", e.target.value)}
                className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 outline-none focus:border-amber-500/40 resize-none transition-colors"
              />
            </div>
          </div>
        )}
      </div>

      {/* معاينة — كيف تبدو البيانات في الفاتورة */}
      {!loading && (form.company_name || form.company_phone || form.company_address) && (
        <div className="bg-[#111827] border border-amber-500/15 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 bg-amber-500/5">
            <p className="text-amber-400 text-xs font-bold">معاينة — رأس الفاتورة</p>
          </div>
          <div className="p-5 space-y-1 text-right">
            {form.company_name    && <p className="text-white font-black text-base">{form.company_name}</p>}
            {form.company_address && <p className="text-white/45 text-sm">{form.company_address}</p>}
            {form.company_phone   && <p className="text-white/45 text-sm">{form.company_phone}</p>}
            {form.company_tax_id  && <p className="text-white/35 text-xs">الرقم الضريبي: {form.company_tax_id}</p>}
            {form.company_website && <p className="text-amber-400/60 text-xs">{form.company_website}</p>}
            {form.company_notes   && <p className="text-white/25 text-xs mt-2 border-t border-white/5 pt-2">{form.company_notes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
