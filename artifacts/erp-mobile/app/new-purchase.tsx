import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
const PURPLE = "#7C3AED";

interface Supplier { id: number; name: string; phone: string | null; balance: number; }
interface Product { id: number; name: string; sku: string | null; quantity: number; cost_price: number; sale_price: number; }
interface Warehouse { id: number; name: string; }
interface Safe { id: number; name: string; balance: string; }
interface CartItem { product: Product; qty: number; unitPrice: number; }

type Step = "supplier" | "cart" | "payment";
type PaymentType = "cash" | "credit" | "partial";

function StepIndicator({ current }: { current: Step }) {
  const c = useColors();
  const steps: { key: Step; label: string }[] = [
    { key: "supplier", label: "المورد" },
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
              backgroundColor: i <= idx ? PURPLE : c.card,
              borderColor: i <= idx ? PURPLE : c.border,
            }]}>
              <Text style={[styles.stepNum, { color: i <= idx ? "#fff" : c.mutedForeground }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, { color: i <= idx ? PURPLE : c.mutedForeground }]}>{s.label}</Text>
          </View>
          {i < steps.length - 1 && (
            <View style={[styles.stepLine, { backgroundColor: i < idx ? PURPLE : c.border }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function Chip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  const c = useColors();
  const col = color || PURPLE;
  return (
    <TouchableOpacity
      style={[styles.chip, { backgroundColor: active ? col : c.card, borderColor: active ? col : c.border }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: active ? "#fff" : c.mutedForeground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function NewPurchaseScreen() {
  const c = useColors();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("supplier");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);
  const [selectedSafe, setSelectedSafe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => apiFetch<Supplier[]>("/api/customers?type=supplier"),
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

  const filteredSuppliers = useMemo(() =>
    (suppliers || []).filter((s) =>
      !supplierSearch || s.name.includes(supplierSearch) || (s.phone || "").includes(supplierSearch)
    ), [suppliers, supplierSearch]);

  const filteredProducts = useMemo(() =>
    (products || []).filter((p) =>
      !productSearch || p.name.includes(productSearch) || (p.sku || "").includes(productSearch)
    ), [products, productSearch]);

  const cartTotal = useMemo(() =>
    cart.reduce((acc, item) => acc + item.unitPrice * item.qty, 0), [cart]);

  const addToCart = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1, unitPrice: Number(product.cost_price) || 0 }];
    });
  };

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) setCart((prev) => prev.filter((i) => i.product.id !== productId));
    else setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, qty } : i));
  };

  const updatePrice = (productId: number, price: string) => {
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, unitPrice: Number(price) || 0 } : i));
  };

  const { mutate: submitPurchase, isPending } = useMutation({
    mutationFn: async () => {
      const paid = paymentType === "cash" ? cartTotal :
        paymentType === "credit" ? 0 :
        Number(paidAmount) || 0;

      const effectiveWarehouse = selectedWarehouse || warehouses?.[0]?.id || 1;
      const effectiveSafe = selectedSafe || safes?.[0]?.id;

      return apiFetch("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((i) => ({
            product_id: i.product.id,
            product_name: i.product.name,
            quantity: i.qty,
            unit_price: i.unitPrice,
            total_price: i.unitPrice * i.qty,
          })),
          customer_id: selectedSupplier?.id || null,
          supplier_name: selectedSupplier?.name || "مورد نقدي",
          payment_type: paymentType,
          total_amount: cartTotal,
          paid_amount: paid,
          warehouse_id: effectiveWarehouse,
          safe_id: (paymentType === "cash" || paymentType === "partial") ? effectiveSafe : null,
          notes: notes || null,
          date: new Date().toISOString().split("T")[0],
        }),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      Alert.alert("تم بنجاح", "تم تسجيل فاتورة الشراء", [{ text: "حسناً", onPress: () => router.back() }]);
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "فشل في تسجيل الفاتورة");
    },
  });

  const handleSubmit = () => {
    if (cart.length === 0) { Alert.alert("تنبيه", "أضف منتجاً واحداً على الأقل"); return; }
    if (paymentType === "partial" && !paidAmount) { Alert.alert("تنبيه", "أدخل المبلغ المدفوع"); return; }
    submitPurchase();
  };

  const renderSupplierStep = () => (
    <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <TouchableOpacity
        style={[styles.cashOption, { backgroundColor: !selectedSupplier ? PURPLE + "18" : c.card, borderColor: !selectedSupplier ? PURPLE : c.border }]}
        onPress={() => setSelectedSupplier(null)}
      >
        <Feather name="truck" size={22} color={!selectedSupplier ? PURPLE : c.mutedForeground} />
        <Text style={[styles.cashOptionText, { color: !selectedSupplier ? PURPLE : c.text }]}>شراء نقدي مباشر</Text>
        {!selectedSupplier && <Feather name="check-circle" size={18} color={PURPLE} />}
      </TouchableOpacity>

      <Text style={[styles.orDivider, { color: c.mutedForeground }]}>أو اختر مورداً</Text>

      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث باسم المورد أو الهاتف..."
          placeholderTextColor={c.mutedForeground}
          value={supplierSearch} onChangeText={setSupplierSearch} textAlign="right"
        />
      </View>

      {filteredSuppliers.map((s) => {
        const selected = selectedSupplier?.id === s.id;
        return (
          <TouchableOpacity
            key={s.id}
            style={[styles.supplierRow, { backgroundColor: selected ? PURPLE + "18" : c.card, borderColor: selected ? PURPLE : c.border }]}
            onPress={() => { setSelectedSupplier(s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <View style={[styles.supplierAvatar, { backgroundColor: PURPLE + "18" }]}>
              <Text style={[styles.supplierAvatarText, { color: PURPLE }]}>{s.name.charAt(0)}</Text>
            </View>
            <View style={styles.supplierInfo}>
              <Text style={[styles.supplierName, { color: selected ? PURPLE : c.text }]}>{s.name}</Text>
              {s.phone && <Text style={[styles.supplierPhone, { color: c.mutedForeground }]}>{s.phone}</Text>}
            </View>
            {selected && <Feather name="check-circle" size={18} color={PURPLE} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderCartStep = () => (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border, margin: 16, marginBottom: 8 }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث بالمنتج أو الكود..."
          placeholderTextColor={c.mutedForeground}
          value={productSearch} onChangeText={setProductSearch} textAlign="right"
        />
      </View>

      {cart.length > 0 && (
        <View style={[styles.cartSummary, { backgroundColor: PURPLE + "15", borderColor: PURPLE + "40" }]}>
          <Text style={[styles.cartSummaryText, { color: PURPLE }]}>
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
              backgroundColor: inCart ? PURPLE + "10" : c.card,
              borderColor: inCart ? PURPLE + "40" : c.cardBorder,
            }]}>
              <View style={styles.productCardLeft}>
                <Text style={[styles.productName, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.productPrice, { color: PURPLE }]}>{formatCurrency(p.cost_price)} ج.م</Text>
                <Text style={[styles.productStock, { color: c.mutedForeground }]}>مخزون: {p.quantity}</Text>
              </View>

              {inCart ? (
                <View style={styles.qtyControls}>
                  <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: c.card, borderColor: c.border }]}
                    onPress={() => updateQty(p.id, cartItem!.qty - 1)}>
                    <Feather name="minus" size={14} color={c.text} />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.qtyInput, { color: c.text, borderColor: PURPLE }]}
                    value={String(cartItem!.qty)}
                    onChangeText={(v) => updateQty(p.id, parseInt(v) || 1)}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: PURPLE }]}
                    onPress={() => updateQty(p.id, cartItem!.qty + 1)}>
                    <Feather name="plus" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: PURPLE }]} onPress={() => addToCart(p)}>
                  <Feather name="plus" size={18} color="#fff" />
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
      <View style={[styles.summaryCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <View style={[styles.summaryTopLine, { backgroundColor: PURPLE }]} />
        <Text style={[styles.summaryTitle, { color: c.mutedForeground }]}>ملخص الفاتورة</Text>
        {cart.map((item) => (
          <View key={item.product.id} style={styles.summaryItem}>
            <Text style={[styles.summaryItemPrice, { color: PURPLE }]}>{formatCurrency(item.unitPrice * item.qty)} ج.م</Text>
            <Text style={[styles.summaryItemName, { color: c.text }]} numberOfLines={1}>
              {item.product.name} × {item.qty}
            </Text>
          </View>
        ))}
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
        <View style={styles.totalRow}>
          <Text style={[styles.totalValue, { color: PURPLE }]}>{formatCurrency(cartTotal)} ج.م</Text>
          <Text style={[styles.totalLabel, { color: c.text }]}>الإجمالي</Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>طريقة الدفع</Text>
      <View style={styles.paymentBtns}>
        <Chip label="آجل" active={paymentType === "credit"} onPress={() => setPaymentType("credit")} />
        <Chip label="جزئي" active={paymentType === "partial"} onPress={() => setPaymentType("partial")} color="#06B6D4" />
        <Chip label="نقدي" active={paymentType === "cash"} onPress={() => setPaymentType("cash")} color={AMBER} />
      </View>

      {paymentType === "partial" && (
        <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: PURPLE }]}>
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
          <Text style={[styles.inputLabel, { color: PURPLE }]}>المدفوع جزئياً</Text>
        </View>
      )}

      {(warehouses?.length || 0) > 1 && (
        <>
          <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>المخزن</Text>
          <View style={styles.optionsList}>
            {(warehouses || []).map((wh) => (
              <Chip key={wh.id} label={wh.name} active={selectedWarehouse === wh.id} onPress={() => setSelectedWarehouse(wh.id)} />
            ))}
          </View>
        </>
      )}

      {(paymentType === "cash" || paymentType === "partial") && (
        <>
          <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>الخزينة</Text>
          <View style={styles.optionsList}>
            {(safes || []).map((s) => (
              <Chip key={s.id} label={`${s.name} (${formatCurrency(Number(s.balance))} ج.م)`} active={selectedSafe === s.id} onPress={() => setSelectedSafe(s.id)} color="#10B981" />
            ))}
          </View>
        </>
      )}

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

      <View style={[styles.supplierChip, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.supplierChipName, { color: c.text }]}>{selectedSupplier?.name || "مورد نقدي"}</Text>
        <Feather name="truck" size={14} color={c.mutedForeground} />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, { opacity: isPending ? 0.6 : 1 }]}
        onPress={handleSubmit}
        disabled={isPending}
      >
        {isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.submitBtnText}>حفظ الفاتورة — {formatCurrency(cartTotal)} ج.م</Text>
            <Feather name="check-circle" size={18} color="#fff" />
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const stepTitles: Record<Step, string> = {
    supplier: "اختر المورد",
    cart: "أضف المنتجات",
    payment: "تأكيد الدفع",
  };

  const canGoNext = step === "supplier" || (step === "cart" && cart.length > 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader
        title="فاتورة شراء جديدة"
        subtitle={stepTitles[step]}
        onBack={() => {
          if (step === "supplier") router.back();
          else if (step === "cart") setStep("supplier");
          else setStep("cart");
        }}
        rightAction={step !== "payment" ? {
          label: step === "supplier" ? "التالي" : `التالي (${cart.length})`,
          onPress: () => {
            if (step === "supplier") setStep("cart");
            else if (step === "cart") setStep("payment");
          },
          disabled: !canGoNext,
        } : undefined}
      />

      <StepIndicator current={step} />

      {step === "supplier" && renderSupplierStep()}
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
  cashOption: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  cashOptionText: { flex: 1, fontSize: 15, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  orDivider: { textAlign: "center", fontSize: 12, fontFamily: "Tajawal_400Regular", marginVertical: 12 },
  searchBox: { flexDirection: "row-reverse", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Tajawal_400Regular" },
  supplierRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  supplierAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  supplierAvatarText: { fontSize: 16, fontFamily: "Tajawal_700Bold" },
  supplierInfo: { flex: 1, alignItems: "flex-end" },
  supplierName: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  supplierPhone: { fontSize: 12, fontFamily: "Tajawal_400Regular" },
  productCard: { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  productCardLeft: { flex: 1 },
  productName: { fontSize: 14, fontFamily: "Tajawal_700Bold", textAlign: "right", marginBottom: 4 },
  productPrice: { fontSize: 13, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  productStock: { fontSize: 11, fontFamily: "Tajawal_400Regular", textAlign: "right", marginTop: 2 },
  qtyControls: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  qtyInput: { width: 40, height: 30, borderRadius: 8, borderWidth: 1, fontSize: 14, fontFamily: "Tajawal_700Bold" },
  addBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  cartSummary: { marginHorizontal: 16, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  cartSummaryText: { fontSize: 13, fontFamily: "Tajawal_700Bold", textAlign: "center" },
  summaryCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  summaryTopLine: { height: 2 },
  summaryTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", padding: 14, paddingBottom: 8 },
  summaryItem: { flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8 },
  summaryItemName: { fontSize: 14, fontFamily: "Tajawal_500Medium", flex: 1 },
  summaryItemPrice: { fontSize: 14, fontFamily: "Tajawal_700Bold" },
  summaryDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14, marginVertical: 8 },
  totalRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14 },
  totalValue: { fontSize: 20, fontFamily: "Tajawal_800ExtraBold" },
  totalLabel: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 8, marginTop: 12 },
  paymentBtns: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  chipText: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  optionsList: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  inputWrap: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginBottom: 8, flexDirection: "row-reverse", alignItems: "center" },
  inputField: { flex: 1, fontSize: 15, fontFamily: "Tajawal_400Regular", paddingVertical: 12 },
  inputSuffix: { fontSize: 13, marginLeft: 8 },
  inputLabel: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  supplierChip: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  supplierChipName: { fontSize: 14, fontFamily: "Tajawal_500Medium" },
  submitBtn: { backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Tajawal_800ExtraBold" },
});
