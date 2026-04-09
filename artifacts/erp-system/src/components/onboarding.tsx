import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetProducts, useGetSettingsWarehouses, useCreateProduct } from "@workspace/api-client-react";
import { safeArray } from "@/lib/safe-data";
import { authFetch } from "@/lib/auth-fetch";
import { Link } from "wouter";
import { CheckCircle, Package, Store, ShoppingCart, X, ArrowLeft } from "lucide-react";
import { ProductFormModal, ProductFormData, emptyProductForm } from "@/components/product-form-modal";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (p: string) => `${BASE}${p}`;

export function OnboardingPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const { data: productsRaw, isLoading: loadingProducts } = useGetProducts();
  const products = safeArray(productsRaw);

  const { data: warehousesRaw, isLoading: loadingWarehouses } = useGetSettingsWarehouses();
  const warehouses = safeArray(warehousesRaw);

  const { data: salesRaw, isLoading: loadingSales } = useQuery<unknown[]>({
    queryKey: ["/api/sales"],
    queryFn: () => authFetch(api("/api/sales")).then(r => { if (!r.ok) throw new Error("err"); return r.json(); }),
  });
  const sales = Array.isArray(salesRaw) ? salesRaw : [];

  const step1Done = products.length > 0;
  const step2Done = warehouses.length > 0;
  const step3Done = sales.length > 0;
  const allDone = step1Done && step2Done && step3Done;
  const isReady = !loadingProducts && !loadingWarehouses && !loadingSales;

  const [showProductModal, setShowProductModal] = useState(false);
  const createProduct = useCreateProduct();
  const handleSaveProduct = (data: ProductFormData) => {
    createProduct.mutate({ data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/products"] });
        qc.invalidateQueries({ queryKey: ["/api/categories"] });
        setShowProductModal(false);
        toast({ title: "✅ تم إضافة المنتج" });
      },
      onError: () => toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" }),
    });
  };

  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [warehouseName, setWarehouseName] = useState("");
  const addWarehouse = useMutation({
    mutationFn: () => authFetch(api("/api/settings/warehouses"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: warehouseName.trim() }),
    }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings/warehouses"] });
      setShowWarehouseModal(false);
      setWarehouseName("");
      toast({ title: "✅ تم إضافة المخزن" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!isReady || allDone || dismissed) return null;

  const steps = [
    {
      num: 1, label: "أضف منتج", icon: Package, done: step1Done,
      action: step1Done ? undefined : () => setShowProductModal(true),
      actionLabel: "إضافة منتج",
    },
    {
      num: 2, label: "أضف مخزن", icon: Store, done: step2Done,
      action: step2Done ? undefined : () => setShowWarehouseModal(true),
      actionLabel: "إضافة مخزن",
    },
    {
      num: 3, label: "ابدأ أول فاتورة", icon: ShoppingCart, done: step3Done,
      actionLabel: "الذهاب للمبيعات",
      isLink: true,
    },
  ];

  const doneCount = [step1Done, step2Done, step3Done].filter(Boolean).length;

  return (
    <>
      {showProductModal && (
        <ProductFormModal
          title="إضافة منتج جديد"
          initial={emptyProductForm}
          onSave={handleSaveProduct}
          onClose={() => setShowProductModal(false)}
          isPending={createProduct.isPending}
        />
      )}

      {showWarehouseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl p-7 w-full max-w-xs border border-white/10 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">إضافة مخزن</h3>
              <button onClick={() => { setShowWarehouseModal(false); setWarehouseName(""); }}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <div>
              <label className="text-white/50 text-xs block mb-1">اسم المخزن *</label>
              <input autoFocus type="text" className="glass-input w-full" placeholder="مثال: المخزن الرئيسي"
                value={warehouseName} onChange={e => setWarehouseName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && warehouseName.trim() && addWarehouse.mutate()} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => addWarehouse.mutate()}
                disabled={!warehouseName.trim() || addWarehouse.isPending}
                className="flex-1 btn-primary py-2.5 text-sm font-bold disabled:opacity-40">
                {addWarehouse.isPending ? "جاري الحفظ..." : "حفظ"}
              </button>
              <button onClick={() => { setShowWarehouseModal(false); setWarehouseName(""); }}
                className="flex-1 btn-secondary py-2.5 text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06), rgba(255,255,255,0.02))" }}>
        <button onClick={() => setDismissed(true)}
          className="absolute top-4 left-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/50 transition-all z-10">
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">👋</span>
            <h2 className="text-lg font-black text-white">مرحبًا! ابدأ في 3 خطوات بسيطة</h2>
          </div>
          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-500"
                style={{ width: `${(doneCount / 3) * 100}%` }} />
            </div>
            <span className="text-white/40 text-xs shrink-0">{doneCount} / 3</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.num}
                  className={`rounded-2xl p-4 border transition-all ${step.done
                    ? "bg-emerald-500/8 border-emerald-500/20"
                    : "bg-white/3 border-white/8 hover:border-white/15"
                  }`}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${step.done
                      ? "bg-emerald-500/20"
                      : "bg-white/8"}`}>
                      {step.done
                        ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                        : <Icon className="w-4 h-4 text-white/40" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-bold ${step.done ? "text-emerald-300" : "text-white/70"}`}>
                        الخطوة {step.num}
                      </span>
                      <p className={`text-sm font-black leading-tight ${step.done ? "text-emerald-200 line-through opacity-60" : "text-white"}`}>
                        {step.label}
                      </p>
                    </div>
                  </div>

                  {!step.done && (
                    step.isLink ? (
                      <Link href={`${BASE}/sales`}>
                        <span className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 transition-all cursor-pointer">
                          {step.actionLabel} <ArrowLeft className="w-3 h-3" />
                        </span>
                      </Link>
                    ) : (
                      <button onClick={step.action}
                        className="w-full py-2 rounded-xl text-xs font-bold bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/25 transition-all">
                        {step.actionLabel}
                      </button>
                    )
                  )}
                  {step.done && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400/60">
                      <CheckCircle className="w-3 h-3" /> تم ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
