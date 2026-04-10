import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ModalHeader } from "@/components/ModalHeader";
import { useColors } from "@/hooks/useColors";
import { apiFetch, formatCurrency } from "@/lib/api";

const AMBER = "#F59E0B";

// ── Types ────────────────────────────────────────────────────────────────────

interface Customer { id: number; name: string; phone: string | null; balance: number; }
interface Product { id: number; name: string; sku: string | null; category: string | null; quantity: number; sale_price: number; cost_price: number; }
interface Warehouse { id: number; name: string; }
interface Safe { id: number; name: string; balance: string; }
interface CartItem { product: Product; qty: number; unitPrice: number; }

type Step = "customer" | "cart" | "payment";
type PaymentType = "cash" | "credit" | "partial";

// ── Sub Components ─────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const c = useColors();
  const steps: { key: Step; label: string }[] = [
    { key: "customer", label: "العميل" },
    { key: "cart", label: "المنتجات" },
    { key: "payment", label: "الدفع" },
  ];
  const idx = steps.findIndex((s) => s.key === current);

  return (
    <View style={styles.stepRow}>
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <View style={styles.stepItem}>
            <View style={[styles.stepCircle, {
              backgroundColor: i <= idx ? AMBER : c.card,
              borderColor: i <= idx ? AMBER : c.border,
            }]}>
              <Text style={[styles.stepNum, { color: i <= idx ? "#0a0500" : c.mutedForeground }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, { color: i <= idx ? AMBER : c.mutedForeground }]}>{s.label}</Text>
          </View>
          {i < steps.length - 1 && (
            <View style={[styles.stepLine, { backgroundColor: i < idx ? AMBER : c.border }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function Chip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  const c = useColors();
  const col = color || AMBER;
  return (
    <TouchableOpacity
      style={[styles.chip, { backgroundColor: active ? col : c.card, borderColor: active ? col : c.border }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: active ? (color ? "#fff" : "#0a0500") : c.mutedForeground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function NewSaleScreen() {
  const c = useColors();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("customer");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);
  const [selectedSafe, setSelectedSafe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiFetch<Customer[]>("/api/customers"),
    staleTime: 30_000,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch<Product[]>("/api/products"),
    staleTime: 30_000,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch<Warehouse[]>("/api/settings/warehouses"),
    staleTime: 60_000,
  });

  const { data: safes } = useQuery({
    queryKey: ["safes"],
    queryFn: () => apiFetch<Safe[]>("/api/settings/safes"),
    staleTime: 60_000,
  });

  const filteredCustomers = useMemo(() =>
    (customers || []).filter((cu) =>
      !customerSearch || cu.name.includes(customerSearch) || (cu.phone || "").includes(customerSearch)
    ), [customers, customerSearch]);

  const filteredProducts = useMemo(() =>
    (products || []).filter((p) =>
      !productSearch || p.name.includes(productSearch) || (p.sku || "").includes(productSearch)
    ), [products, productSearch]);

  const cartTotal = useMemo(() =>
    cart.reduce((acc, item) => acc + item.unitPrice * item.qty, 0), [cart]);

  const discountedTotal = useMemo(() => {
    const d = Number(discountPercent) || 0;
    return cartTotal * (1 - d / 100);
  }, [cartTotal, discountPercent]);

  // Cart helpers
  const addToCart = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product, qty: 1, unitPrice: Number(product.sale_price) }];
    });
  };

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) setCart((prev) => prev.filter((i) => i.product.id !== productId));
    else setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, qty } : i));
  };

  const updatePrice = (productId: number, price: string) => {
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, unitPrice: Number(price) || 0 } : i));
  };

  // Submit mutation
  const { mutate: submitSale, isPending } = useMutation({
    mutationFn: async () => {
      const total = discountedTotal;
      const paid = paymentType === "cash" ? total :
        paymentType === "credit" ? 0 :
        Number(paidAmount) || 0;

      const effectiveWarehouse = selectedWarehouse || warehouses?.[0]?.id || 1;
      const effectiveSafe = selectedSafe || safes?.[0]?.id;

      const body = {
        items: cart.map((i) => ({
          product_id: i.product.id,
          quantity: i.qty,
          unit_price: i.unitPrice,
        })),
        customer_id: selectedCustomer?.id || null,
        customer_name: selectedCustomer?.name || customerName || "عميل نقدي",
        payment_type: paymentType,
        total_amount: total,
        paid_amount: paid,
        warehouse_id: effectiveWarehouse,
        safe_id: (paymentType === "cash" || paymentType === "partial") ? effectiveSafe : null,
        discount_percent: Number(discountPercent) || 0,
        notes: notes || null,
        date: new Date().toISOString().split("T")[0],
      };

      return apiFetch("/api/sales", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      Alert.alert("تم بنجاح", "تم تسجيل فاتورة البيع بنجاح", [{ text: "حسناً", onPress: () => router.back() }]);
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "فشل في تسجيل الفاتورة");
    },
  });

  const handleSubmit = () => {
    if (cart.length === 0) { Alert.alert("تنبيه", "أضف منتجاً واحداً على الأقل"); return; }
    if (paymentType === "partial" && !paidAmount) { Alert.alert("تنبيه", "أدخل المبلغ المدفوع"); return; }
    if ((paymentType === "cash" || paymentType === "partial") && !selectedSafe && !safes?.[0]) {
      Alert.alert("تنبيه", "لا توجد خزائن متاحة"); return;
    }
    submitSale();
  };

  // ── Render Steps ─────────────────────────────────────────────────────────

  const renderCustomerStep = () => (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      {/* نقدي */}
      <TouchableOpacity
        style={[styles.cashOption, { backgroundColor: !selectedCustomer ? AMBER + "18" : c.card, borderColor: !selectedCustomer ? AMBER : c.border }]}
        onPress={() => { setSelectedCustomer(null); setCustomerName("عميل نقدي"); }}
      >
        <Feather name="dollar-sign" size={22} color={!selectedCustomer ? AMBER : c.mutedForeground} />
        <Text style={[styles.cashOptionText, { color: !selectedCustomer ? AMBER : c.text }]}>بيع نقدي مباشر</Text>
        {!selectedCustomer && <Feather name="check-circle" size={18} color={AMBER} />}
      </TouchableOpacity>

      <Text style={[styles.orDivider, { color: c.mutedForeground }]}>أو اختر عميلاً</Text>

      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث باسم العميل أو الهاتف..."
          placeholderTextColor={c.mutedForeground}
          value={customerSearch} onChangeText={setCustomerSearch} textAlign="right"
        />
      </View>

      {filteredCustomers.map((cu) => {
        const selected = selectedCustomer?.id === cu.id;
        return (
          <TouchableOpacity
            key={cu.id}
            style={[styles.customerRow, { backgroundColor: selected ? AMBER + "18" : c.card, borderColor: selected ? AMBER : c.border }]}
            onPress={() => { setSelectedCustomer(cu); setCustomerName(cu.name); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <View style={[styles.customerAvatar, { backgroundColor: AMBER + "18" }]}>
              <Text style={[styles.customerAvatarText, { color: AMBER }]}>{cu.name.charAt(0)}</Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={[styles.customerName, { color: selected ? AMBER : c.text }]}>{cu.name}</Text>
              {cu.phone && <Text style={[styles.customerPhone, { color: c.mutedForeground }]}>{cu.phone}</Text>}
            </View>
            {cu.balance !== 0 && (
              <Text style={[styles.customerBalance, { color: cu.balance < 0 ? "#EF4444" : "#10B981" }]}>
                {cu.balance < 0 ? "-" : "+"}{formatCurrency(Math.abs(cu.balance))}
              </Text>
            )}
            {selected && <Feather name="check-circle" size={18} color={AMBER} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderCartStep = () => (
    <View style={{ flex: 1 }}>
      {/* شريط البحث عن المنتجات */}
      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border, margin: 16, marginBottom: 8 }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث بالمنتج أو الكود..."
          placeholderTextColor={c.mutedForeground}
          value={productSearch} onChangeText={setProductSearch} textAlign="right"
        />
      </View>

      {/* السلة (إذا فيها عناصر) */}
      {cart.length > 0 && (
        <View style={[styles.cartSummary, { backgroundColor: AMBER + "15", borderColor: AMBER + "40" }]}>
          <Text style={[styles.cartSummaryText, { color: AMBER }]}>
            {cart.length} منتج • الإجمالي: {formatCurrency(cartTotal)} ج.م
          </Text>
        </View>
      )}

      <FlatList
        data={filteredProducts}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}
        renderItem={({ item: p }) => {
          const cartItem = cart.find((i) => i.product.id === p.id);
          const inCart = !!cartItem;
          return (
            <View style={[styles.productCard, {
              backgroundColor: inCart ? AMBER + "10" : c.card,
              borderColor: inCart ? AMBER + "40" : c.cardBorder,
            }]}>
              <View style={styles.productCardLeft}>
                <Text style={[styles.productName, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.productPrice, { color: AMBER }]}>{formatCurrency(p.sale_price)} ج.م</Text>
                <Text style={[styles.productStock, { color: p.quantity <= 0 ? "#EF4444" : c.mutedForeground }]}>
                  المخزون: {p.quantity}
                </Text>
              </View>

              {inCart ? (
                <View style={styles.qtyControls}>
                  <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: c.card, borderColor: c.border }]}
                    onPress={() => updateQty(p.id, cartItem!.qty - 1)}>
                    <Feather name="minus" size={14} color={c.text} />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.qtyInput, { color: c.text, borderColor: AMBER }]}
                    value={String(cartItem!.qty)}
                    onChangeText={(v) => updateQty(p.id, parseInt(v) || 1)}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: AMBER }]}
                    onPress={() => updateQty(p.id, cartItem!.qty + 1)}>
                    <Feather name="plus" size={14} color="#0a0500" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: AMBER, opacity: p.quantity <= 0 ? 0.4 : 1 }]}
                  onPress={() => p.quantity > 0 && addToCart(p)}
                  disabled={p.quantity <= 0}
                >
                  <Feather name="plus" size={18} color="#0a0500" />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );

  const renderPaymentStep = () => (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      {/* ملخص السلة */}
      <View style={[styles.summaryCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <View style={styles.summaryTopLine} />
        <Text style={[styles.summaryTitle, { color: c.mutedForeground }]}>ملخص الفاتورة</Text>
        {cart.map((item) => (
          <View key={item.product.id} style={styles.summaryItem}>
            <Text style={[styles.summaryItemPrice, { color: AMBER }]}>{formatCurrency(item.unitPrice * item.qty)} ج.م</Text>
            <Text style={[styles.summaryItemName, { color: c.text }]} numberOfLines={1}>
              {item.product.name} × {item.qty}
            </Text>
          </View>
        ))}
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />

        {/* خصم */}
        <View style={styles.summaryItem}>
          <View style={[styles.discountInput, { borderColor: c.border, backgroundColor: c.card }]}>
            <TextInput
              style={[styles.discountField, { color: c.text }]}
              value={discountPercent}
              onChangeText={setDiscountPercent}
              placeholder="0"
              placeholderTextColor={c.mutedForeground}
              keyboardType="numeric"
              textAlign="center"
            />
            <Text style={[styles.discountPct, { color: c.mutedForeground }]}>%</Text>
          </View>
          <Text style={[styles.summaryItemName, { color: c.mutedForeground }]}>نسبة الخصم</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={[styles.totalValue, { color: AMBER }]}>{formatCurrency(discountedTotal)} ج.م</Text>
          <Text style={[styles.totalLabel, { color: c.text }]}>الإجمالي النهائي</Text>
        </View>
      </View>

      {/* طريقة الدفع */}
      <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>طريقة الدفع</Text>
      <View style={styles.paymentBtns}>
        <Chip label="آجل" active={paymentType === "credit"} onPress={() => setPaymentType("credit")} color="#7C3AED" />
        <Chip label="جزئي" active={paymentType === "partial"} onPress={() => setPaymentType("partial")} color="#06B6D4" />
        <Chip label="نقدي" active={paymentType === "cash"} onPress={() => setPaymentType("cash")} />
      </View>

      {paymentType === "partial" && (
        <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: AMBER }]}>
          <Text style={[styles.inputSuffix, { color: c.mutedForeground }]}>ج.م</Text>
          <TextInput
            style={[styles.inputField, { color: c.text }]}
            placeholder="المبلغ المدفوع"
            placeholderTextColor={c.mutedForeground}
            value={paidAmount}
            onChangeText={setPaidAmount}
            keyboardType="numeric"
            textAlign="right"
          />
          <Text style={[styles.inputLabel, { color: AMBER }]}>المدفوع جزئياً</Text>
        </View>
      )}

      {/* المخزن */}
      {(warehouses?.length || 0) > 1 && (
        <>
          <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>المخزن</Text>
          <View style={styles.optionsList}>
            {(warehouses || []).map((wh) => (
              <Chip
                key={wh.id} label={wh.name}
                active={selectedWarehouse === wh.id}
                onPress={() => setSelectedWarehouse(wh.id)}
              />
            ))}
          </View>
        </>
      )}

      {/* الخزينة */}
      {(paymentType === "cash" || paymentType === "partial") && (
        <>
          <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>الخزينة</Text>
          <View style={styles.optionsList}>
            {(safes || []).map((s) => (
              <Chip
                key={s.id} label={`${s.name} (${formatCurrency(Number(s.balance))} ج.م)`}
                active={selectedSafe === s.id}
                onPress={() => setSelectedSafe(s.id)}
                color="#10B981"
              />
            ))}
          </View>
        </>
      )}

      {/* ملاحظات */}
      <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>ملاحظات (اختياري)</Text>
      <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <TextInput
          style={[styles.inputField, { color: c.text }]}
          placeholder="ملاحظات الفاتورة..."
          placeholderTextColor={c.mutedForeground}
          value={notes} onChangeText={setNotes}
          textAlign="right" multiline
        />
      </View>

      {/* عميل */}
      <View style={[styles.customerChip, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.customerChipName, { color: c.text }]}>{selectedCustomer?.name || "عميل نقدي"}</Text>
        <Feather name="user" size={14} color={c.mutedForeground} />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, { opacity: isPending ? 0.6 : 1 }]}
        onPress={handleSubmit}
        disabled={isPending}
      >
        {isPending ? (
          <ActivityIndicator color="#0a0500" />
        ) : (
          <>
            <Text style={styles.submitBtnText}>تسجيل الفاتورة — {formatCurrency(discountedTotal)} ج.م</Text>
            <Feather name="check-circle" size={18} color="#0a0500" />
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const stepTitles: Record<Step, string> = {
    customer: "اختر العميل",
    cart: "أضف المنتجات",
    payment: "تأكيد الدفع",
  };

  const canGoNext = step === "customer" || (step === "cart" && cart.length > 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader
        title="فاتورة بيع جديدة"
        subtitle={stepTitles[step]}
        onBack={() => {
          if (step === "customer") router.back();
          else if (step === "cart") setStep("customer");
          else setStep("cart");
        }}
        rightAction={step !== "payment" ? {
          label: step === "customer" ? "التالي" : `التالي (${cart.length})`,
          onPress: () => {
            if (step === "customer") setStep("cart");
            else if (step === "cart") setStep("payment");
          },
          disabled: !canGoNext,
        } : undefined}
      />

      <StepIndicator current={step} />

      {step === "customer" && renderCustomerStep()}
      {step === "cart" && renderCartStep()}
      {step === "payment" && renderPaymentStep()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  stepRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", paddingVertical: 14, paddingHorizontal: 24 },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", borderWidth: 2 },
  stepNum: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  stepLabel: { fontSize: 11, fontFamily: "Tajawal_500Medium" },
  stepLine: { flex: 1, height: 2, marginHorizontal: 8, marginBottom: 14 },

  stepContent: { padding: 16, paddingBottom: 40 },

  cashOption: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  cashOptionText: { flex: 1, fontSize: 15, fontFamily: "Tajawal_700Bold", textAlign: "right" },

  orDivider: { textAlign: "center", fontSize: 12, fontFamily: "Tajawal_400Regular", marginVertical: 12 },

  searchBox: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Tajawal_400Regular" },

  customerRow: {
    flexDirection: "row-reverse", alignItems: "center",
    gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  customerAvatarText: { fontSize: 16, fontFamily: "Tajawal_700Bold" },
  customerInfo: { flex: 1, alignItems: "flex-end" },
  customerName: { fontSize: 14, fontFamily: "Tajawal_700Bold" },
  customerPhone: { fontSize: 12, fontFamily: "Tajawal_400Regular" },
  customerBalance: { fontSize: 13, fontFamily: "Tajawal_700Bold" },

  cartSummary: {
    margin: 16, marginTop: 0, marginBottom: 4,
    padding: 10, borderRadius: 10, borderWidth: 1,
  },
  cartSummaryText: { fontSize: 13, fontFamily: "Tajawal_700Bold", textAlign: "right" },

  productCard: {
    borderRadius: 14, borderWidth: 1, padding: 12,
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
  },
  productCardLeft: { flex: 1, alignItems: "flex-end" },
  productName: { fontSize: 14, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  productPrice: { fontSize: 15, fontFamily: "Tajawal_700Bold", marginTop: 2 },
  productStock: { fontSize: 11, fontFamily: "Tajawal_400Regular", marginTop: 2 },
  addBtn: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  qtyInput: { width: 40, height: 32, fontSize: 14, fontFamily: "Tajawal_700Bold", borderBottomWidth: 1 },

  summaryCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16, overflow: "hidden",
  },
  summaryTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  summaryTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 10, marginTop: 4 },
  summaryItem: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  summaryItemName: { flex: 1, fontSize: 13, fontFamily: "Tajawal_400Regular", textAlign: "right" },
  summaryItemPrice: { fontSize: 13, fontFamily: "Tajawal_700Bold", marginLeft: 8 },
  summaryDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  discountInput: { flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, paddingHorizontal: 8 },
  discountField: { width: 40, fontSize: 14, fontFamily: "Tajawal_700Bold", paddingVertical: 6, textAlign: "center" },
  discountPct: { fontSize: 13, fontFamily: "Tajawal_400Regular" },
  totalRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  totalLabel: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  totalValue: { fontSize: 22, fontFamily: "Tajawal_800ExtraBold" },

  sectionLabel: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 8, marginTop: 12 },
  paymentBtns: { flexDirection: "row-reverse", gap: 8, marginBottom: 4 },
  optionsList: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  chipText: { fontSize: 13, fontFamily: "Tajawal_700Bold" },

  inputWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginBottom: 8,
  },
  inputField: { flex: 1, fontSize: 15, fontFamily: "Tajawal_400Regular", paddingVertical: 12 },
  inputSuffix: { fontSize: 13, fontFamily: "Tajawal_400Regular", paddingLeft: 8 },
  inputLabel: { fontSize: 13, fontFamily: "Tajawal_700Bold" },

  customerChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 12, marginBottom: 16,
  },
  customerChipName: { flex: 1, fontSize: 14, fontFamily: "Tajawal_500Medium", textAlign: "right" },

  submitBtn: {
    backgroundColor: AMBER, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10,
  },
  submitBtnText: { color: "#0a0500", fontFamily: "Tajawal_800ExtraBold", fontSize: 16 },
});
