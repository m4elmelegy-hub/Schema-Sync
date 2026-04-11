import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { safeArray } from "@/lib/safe-data";
import { useGetSettingsSafes, useGetProducts, useGetCustomers } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, BookOpen, Banknote, Package, Users, Truck, CheckCircle2,
} from "lucide-react";
import { PageHeader, FieldLabel, SInput, SSelect, PrimaryBtn } from "./_shared";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Types ─── */
type OBSubTab = "treasury" | "products" | "customers" | "suppliers";

interface OBEntry {
  id: number;
  amount?: number;
  quantity?: number;
  unit_cost?: number;
  description?: string;
  customer_name?: string;
  safe_name?: string;
  product_name?: string;
  date?: string;
  created_at: string;
  notes?: string;
}

/* ─── Sub-tab config (Lucide icons instead of emoji) ─── */
const OB_TABS: { id: OBSubTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "treasury",  label: "الخزائن",               icon: Banknote },
  { id: "products",  label: "المنتجات",               icon: Package  },
  { id: "customers", label: "العملاء",                icon: Users    },
  { id: "suppliers", label: "عملاء (يُشترى منهم)", icon: Truck    },
];

/* ─── React Query hook replacing useOBData ─── */
function useOBQuery(path: string) {
  return useQuery<OBEntry[]>({
    queryKey: [`ob${path}`],
    queryFn: async () => {
      const res = await authFetch(`${BASE}/api${path}`);
      if (!res.ok) throw new Error("فشل تحميل القيود");
      return res.json();
    },
    staleTime: 15_000,
  });
}

/* ─── Entry Table ─── */
function OBEntryTable({ data, isLoading, columns }: {
  data: OBEntry[];
  isLoading: boolean;
  columns: { label: string; render: (e: OBEntry) => React.ReactNode }[];
}) {
  if (isLoading) return (
    <div className="p-8 text-center text-white/40 text-sm">
      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />جاري التحميل...
    </div>
  );
  if (data.length === 0) return (
    <div className="p-8 text-center text-white/25 text-sm">لا توجد قيود مسجلة</div>
  );
  return (
    <table className="w-full text-right text-sm">
      <thead className="bg-white/3 border-b border-white/8">
        <tr>
          {columns.map(c => (
            <th key={c.label} className="p-3 text-white/40 text-xs font-medium">{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(e => (
          <tr key={e.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
            {columns.map(c => (
              <td key={c.label} className="p-3 text-white/70 text-sm">{c.render(e)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Treasury Sub-tab ─── */
function OBTreasuryTab() {
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useOBQuery("/opening-balance/treasury");
  const { data: safesRaw } = useGetSettingsSafes();
  const safes = safeArray(safesRaw);
  const { toast } = useToast();
  const [form, setForm]     = useState({ safe_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.safe_id || !form.amount) { toast({ title: "الخزينة والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    const res = await authFetch(`${BASE}/api/opening-balance/treasury`, {
      method: "POST",
      body: JSON.stringify({ safe_id: parseInt(form.safe_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
    toast({ title: "✅ تم تسجيل الرصيد الافتتاحي للخزينة" });
    setForm(f => ({ ...f, safe_id: "", amount: "", notes: "" }));
    qc.invalidateQueries({ queryKey: ["ob/opening-balance/treasury"] });
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <Banknote className="w-4 h-4" /> إضافة رصيد افتتاحي للخزينة
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <FieldLabel>الخزينة</FieldLabel>
            <SSelect value={form.safe_id} onChange={e => setForm(f => ({ ...f, safe_id: e.target.value }))}>
              <option value="">— اختر الخزينة —</option>
              {(safes as any[]).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} (رصيد: {Number(s.balance).toLocaleString("ar-EG")} ج.م)</option>
              ))}
            </SSelect>
          </div>
          <div>
            <FieldLabel>المبلغ الافتتاحي (ج.م)</FieldLabel>
            <SInput type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <PrimaryBtn onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </PrimaryBtn>
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">القيود المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable data={entries} isLoading={isLoading} columns={[
          { label: "الخزينة",  render: e => <span className="font-bold text-amber-400">{e.safe_name}</span> },
          { label: "المبلغ",   render: e => <span className="text-emerald-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ",  render: e => <span className="text-white/40 text-xs">{e.date}</span> },
          { label: "البيان",   render: e => <span className="text-white/30 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ─── Products Sub-tab ─── */
function OBProductsTab() {
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useOBQuery("/opening-balance/product");
  const { data: productsRaw } = useGetProducts();
  const products = safeArray(productsRaw);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm]     = useState({ product_id: "", quantity: "", cost_price: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredProductIds = new Set(entries.map(e => e.id));
  const filteredProducts = (products as any[]).filter((p: any) =>
    !registeredProductIds.has(p.id) && (p.name.includes(search) || (p.sku ?? "").includes(search))
  );

  const handleSelectProduct = (p: any) => { setForm(f => ({ ...f, product_id: String(p.id), cost_price: String(Number(p.cost_price)) })); setSearch(p.name); };
  const selectedProduct = (products as any[]).find((p: any) => String(p.id) === form.product_id);

  const handleSubmit = async () => {
    if (!form.product_id || !form.quantity || !form.cost_price) { toast({ title: "المنتج والكمية والتكلفة مطلوبة", variant: "destructive" }); return; }
    setSaving(true);
    const res = await authFetch(`${BASE}/api/inventory/opening-balance`, {
      method: "POST",
      body: JSON.stringify({ product_id: parseInt(form.product_id), quantity: parseFloat(form.quantity), cost_price: parseFloat(form.cost_price), date: form.date, notes: form.notes || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
    toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedProduct?.name ?? "المنتج"}` });
    setForm(f => ({ ...f, product_id: "", quantity: "", cost_price: "", notes: "" })); setSearch("");
    qc.invalidateQueries({ queryKey: ["ob/opening-balance/product"] });
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <Package className="w-4 h-4" /> إضافة رصيد مخزن افتتاحي
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="relative">
            <FieldLabel>البحث عن منتج</FieldLabel>
            <SInput placeholder="ابحث بالاسم أو الكود..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, product_id: "" })); }} />
            {search && !form.product_id && filteredProducts.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-[#111827] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-2xl">
                {filteredProducts.slice(0, 12).map((p: any) => (
                  <button key={p.id} onClick={() => handleSelectProduct(p)}
                    className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-white/35 font-mono shrink-0">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedProduct && <p className="mt-1 text-emerald-400 text-xs">✓ {selectedProduct.name} — رصيد حالي: {Number(selectedProduct.quantity)} وحدة</p>}
          </div>
          <div>
            <FieldLabel>الكمية الافتتاحية</FieldLabel>
            <SInput type="number" min="0.001" step="any" placeholder="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تكلفة الوحدة (ج.م)</FieldLabel>
            <SInput type="number" min="0" step="0.01" placeholder="0.00" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <PrimaryBtn onClick={handleSubmit} disabled={saving || !form.product_id} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              تسجيل
            </PrimaryBtn>
          </div>
        </div>
        {form.product_id && form.quantity && form.cost_price && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-xs">
              سيُضاف <strong>{parseFloat(form.quantity)||0}</strong> وحدة بتكلفة <strong>{parseFloat(form.cost_price)||0} ج.م</strong>
              {selectedProduct ? ` للمنتج "${selectedProduct.name}"` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">أرصدة المنتجات المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable data={entries} isLoading={isLoading} columns={[
          { label: "المنتج",       render: e => <span className="font-bold text-white">{e.product_name}</span> },
          { label: "الكمية",       render: e => <span className="text-blue-400 font-mono">{Number(e.quantity).toLocaleString("ar-EG")}</span> },
          { label: "تكلفة الوحدة", render: e => <span className="text-amber-400 font-mono">{Number(e.unit_cost).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ",      render: e => <span className="text-white/40 text-xs">{e.date}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ─── Customers Sub-tab ─── */
function OBCustomersTab() {
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useOBQuery("/opening-balance/customer");
  const { data: customersRaw } = useGetCustomers();
  const customers = safeArray(customersRaw);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm]     = useState({ customer_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredIds = new Set(entries.map(e => e.id));
  const filteredCustomers = (customers as any[]).filter((c: any) => !registeredIds.has(c.id) && c.name.includes(search));
  const selectedCustomer  = (customers as any[]).find((c: any) => String(c.id) === form.customer_id);
  const handleSelect = (c: any) => { setForm(f => ({ ...f, customer_id: String(c.id) })); setSearch(c.name); };

  const handleSubmit = async () => {
    if (!form.customer_id || !form.amount) { toast({ title: "العميل والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    const res = await authFetch(`${BASE}/api/opening-balance/customer`, {
      method: "POST",
      body: JSON.stringify({ customer_id: parseInt(form.customer_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
    toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${selectedCustomer?.name ?? "العميل"}` });
    setForm(f => ({ ...f, customer_id: "", amount: "", notes: "" })); setSearch("");
    qc.invalidateQueries({ queryKey: ["ob/opening-balance/customer"] });
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <Users className="w-4 h-4" /> إضافة رصيد افتتاحي لعميل
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <FieldLabel>العميل</FieldLabel>
            <SInput placeholder="ابحث عن عميل..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, customer_id: "" })); }} />
            {search && !form.customer_id && filteredCustomers.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-[#111827] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-2xl">
                {filteredCustomers.slice(0, 10).map((c: any) => (
                  <button key={c.id} onClick={() => handleSelect(c)}
                    className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0">{c.name}</button>
                ))}
              </div>
            )}
            {selectedCustomer && <p className="mt-1 text-emerald-400 text-xs">✓ {selectedCustomer.name}</p>}
          </div>
          <div>
            <FieldLabel>مبلغ الدين الافتتاحي (ج.م)</FieldLabel>
            <SInput type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <PrimaryBtn onClick={handleSubmit} disabled={saving || !form.customer_id}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </PrimaryBtn>
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">أرصدة العملاء المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable data={entries} isLoading={isLoading} columns={[
          { label: "العميل",  render: e => <span className="font-bold text-white">{e.customer_name}</span> },
          { label: "المبلغ",  render: e => <span className="text-red-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/40 text-xs">{e.date}</span> },
          { label: "البيان",  render: e => <span className="text-white/30 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ─── Suppliers Sub-tab ─── */
function OBSuppliersTab() {
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useOBQuery("/opening-balance/supplier");
  const { data: allCustomersRaw } = useGetCustomers();
  const allCustomers = safeArray(allCustomersRaw);
  const suppliers = allCustomers.filter((c: any) => c.is_supplier);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [form, setForm]     = useState({ supplier_id: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [saving, setSaving] = useState(false);

  const registeredIds = new Set(entries.map(e => e.id));
  const filteredSuppliers = suppliers.filter((s: any) => !registeredIds.has(s.id) && s.name.includes(search));
  const selectedSupplier  = suppliers.find((s: any) => String(s.id) === form.supplier_id);
  const handleSelect = (s: any) => { setForm(f => ({ ...f, supplier_id: String(s.id) })); setSearch(s.name); };

  const handleSubmit = async () => {
    if (!form.supplier_id || !form.amount) { toast({ title: "العميل والمبلغ مطلوبان", variant: "destructive" }); return; }
    setSaving(true);
    const res = await authFetch(`${BASE}/api/opening-balance/supplier`, {
      method: "POST",
      body: JSON.stringify({ supplier_id: parseInt(form.supplier_id), amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast({ title: data.error ?? "فشل الحفظ", variant: "destructive" }); return; }
    toast({ title: `✅ تم تسجيل رصيد أول المدة لـ ${(selectedSupplier as any)?.name ?? "العميل"}` });
    setForm(f => ({ ...f, supplier_id: "", amount: "", notes: "" })); setSearch("");
    qc.invalidateQueries({ queryKey: ["ob/opening-balance/supplier"] });
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#1A2235] border border-amber-500/20 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <Truck className="w-4 h-4" /> إضافة رصيد افتتاحي لعميل (يُشترى منه)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <FieldLabel>العميل</FieldLabel>
            <SInput placeholder="ابحث عن عميل..." value={search} onChange={e => { setSearch(e.target.value); setForm(f => ({ ...f, supplier_id: "" })); }} />
            {search && !form.supplier_id && filteredSuppliers.length > 0 && (
              <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-[#111827] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-2xl">
                {filteredSuppliers.slice(0, 10).map((s: any) => (
                  <button key={s.id} onClick={() => handleSelect(s)}
                    className="w-full text-right px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0">{s.name}</button>
                ))}
              </div>
            )}
            {selectedSupplier && <p className="mt-1 text-emerald-400 text-xs">✓ {(selectedSupplier as any).name}</p>}
          </div>
          <div>
            <FieldLabel>مبلغ الرصيد المستحق (ج.م)</FieldLabel>
            <SInput type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>تاريخ أول المدة</FieldLabel>
            <SInput type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>ملاحظات (اختياري)</FieldLabel>
            <SInput placeholder="رصيد أول المدة" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <PrimaryBtn onClick={handleSubmit} disabled={saving || !form.supplier_id}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          تسجيل الرصيد الافتتاحي
        </PrimaryBtn>
      </div>

      <div className="bg-[#111827] rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h4 className="font-bold text-white/60 text-sm">أرصدة العملاء المسجلة</h4>
          <span className="text-white/30 text-xs bg-white/5 px-2 py-0.5 rounded-lg">{entries.length}</span>
        </div>
        <OBEntryTable data={entries} isLoading={isLoading} columns={[
          { label: "العميل",  render: e => <span className="font-bold text-white">{e.description?.split("—")[1]?.trim() ?? `عميل #${e.id}`}</span> },
          { label: "المبلغ",  render: e => <span className="text-orange-400 font-mono">{Number(e.amount).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span> },
          { label: "التاريخ", render: e => <span className="text-white/40 text-xs">{e.date}</span> },
          { label: "البيان",  render: e => <span className="text-white/30 text-xs">{e.description}</span> },
        ]} />
      </div>
    </div>
  );
}

/* ─── Main Export ─── */
export default function OpeningBalanceTab() {
  const [subTab, setSubTab] = useState<OBSubTab>("treasury");

  return (
    <div className="space-y-5">
      <PageHeader title="أول المدة" sub="قيود الأرصدة الافتتاحية عند بدء استخدام النظام" />

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
        <BookOpen className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-400 font-bold text-sm">قيود أول المدة</p>
          <p className="text-amber-300/60 text-xs mt-0.5 leading-relaxed">
            سجّل هنا الأرصدة الافتتاحية عند بدء استخدام النظام لأول مرة.
            قيود الخزائن والعملاء تُضاف للأرصدة الحالية مباشرة.
            قيود المنتجات تُسجَّل مرة واحدة فقط لكل منتج وتُحسب التكلفة المرجّحة تلقائياً.
          </p>
        </div>
      </div>

      {/* Sub-tab pills — Lucide icons */}
      <div className="flex gap-2 flex-wrap">
        {OB_TABS.map(t => {
          const active = subTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                active
                  ? "bg-amber-500/15 border-amber-500/50 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  : "bg-[#1A2235] border-[#2D3748] text-white/40 hover:text-white hover:border-amber-500/20"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === "treasury"  && <OBTreasuryTab />}
      {subTab === "products"  && <OBProductsTab />}
      {subTab === "customers" && <OBCustomersTab />}
      {subTab === "suppliers" && <OBSuppliersTab />}
    </div>
  );
}
