import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FormField } from "@/components/FormField";
import { ModalHeader } from "@/components/ModalHeader";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

const AMBER = "#F59E0B";

interface Category { id: number; name: string; }

export default function NewProductScreen() {
  const c = useColors();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/api/categories"),
    staleTime: 60_000,
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "اسم المنتج مطلوب";
    if (!salePrice || Number(salePrice) <= 0) errs.salePrice = "سعر البيع مطلوب";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiFetch("/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || null,
          category: categoryText.trim() || null,
          category_id: selectedCategoryId || null,
          quantity: Number(quantity) || 0,
          cost_price: Number(costPrice) || 0,
          sale_price: Number(salePrice) || 0,
          low_stock_threshold: lowStock ? Number(lowStock) : null,
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      Alert.alert("تم", "تمت إضافة المنتج بنجاح", [{ text: "حسناً", onPress: () => router.back() }]);
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "فشل في إضافة المنتج");
    },
  });

  const handleSubmit = () => { if (validate()) mutate(); };

  const profit = Number(salePrice) - Number(costPrice);
  const margin = Number(costPrice) > 0 ? ((profit / Number(costPrice)) * 100).toFixed(1) : "0";

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader
        title="إضافة منتج"
        rightAction={{ label: "حفظ", onPress: handleSubmit, loading: isPending, disabled: isPending }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* البيانات الأساسية */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <View style={styles.cardLine} />
            <Text style={[styles.cardTitle, { color: c.mutedForeground }]}>البيانات الأساسية</Text>

            <FormField label="اسم المنتج" required placeholder="أدخل اسم المنتج" value={name} onChangeText={setName} error={errors.name} />
            <FormField label="كود/SKU" placeholder="مثال: SKU-001" value={sku} onChangeText={setSku} />

            {/* الفئة */}
            <View style={{ marginBottom: 14 }}>
              <Text style={[styles.label, { color: c.mutedForeground }]}>الفئة (اختياري)</Text>
              <TouchableOpacity
                style={[styles.selectBtn, { backgroundColor: c.card, borderColor: selectedCategoryId ? AMBER : c.border }]}
                onPress={() => setShowCategories(!showCategories)}
              >
                <Feather name={showCategories ? "chevron-up" : "chevron-down"} size={16} color={c.mutedForeground} />
                <Text style={[styles.selectBtnText, { color: selectedCategoryId ? AMBER : c.mutedForeground }]}>
                  {categories?.find((c) => c.id === selectedCategoryId)?.name || categoryText || "اختر أو أكتب فئة"}
                </Text>
              </TouchableOpacity>

              {showCategories && (
                <View style={[styles.categoriesList, { backgroundColor: c.card, borderColor: c.border }]}>
                  <FormField
                    label=""
                    placeholder="أو أكتب فئة جديدة..."
                    value={categoryText}
                    onChangeText={(t) => { setCategoryText(t); setSelectedCategoryId(null); }}
                    style={{ paddingVertical: 8 }}
                  />
                  {(categories || []).map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.categoryItem, { borderColor: c.border, backgroundColor: selectedCategoryId === cat.id ? AMBER + "18" : "transparent" }]}
                      onPress={() => { setSelectedCategoryId(cat.id); setCategoryText(cat.name); setShowCategories(false); }}
                    >
                      <Text style={[styles.categoryItemText, { color: selectedCategoryId === cat.id ? AMBER : c.text }]}>{cat.name}</Text>
                      {selectedCategoryId === cat.id && <Feather name="check" size={14} color={AMBER} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* الأسعار */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <View style={[styles.cardLine, { backgroundColor: "#10B981" }]} />
            <Text style={[styles.cardTitle, { color: c.mutedForeground }]}>الأسعار</Text>

            <View style={styles.priceRow}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="سعر البيع" required
                  placeholder="0.00"
                  value={salePrice} onChangeText={setSalePrice}
                  keyboardType="numeric" suffix="ج.م" error={errors.salePrice}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <FormField
                  label="سعر التكلفة"
                  placeholder="0.00"
                  value={costPrice} onChangeText={setCostPrice}
                  keyboardType="numeric" suffix="ج.م"
                />
              </View>
            </View>

            {Number(salePrice) > 0 && Number(costPrice) > 0 && (
              <View style={[styles.profitBox, { backgroundColor: profit >= 0 ? "#10B981" + "18" : "#EF4444" + "18", borderColor: profit >= 0 ? "#10B981" + "40" : "#EF4444" + "40" }]}>
                <Text style={[styles.profitText, { color: profit >= 0 ? "#10B981" : "#EF4444" }]}>
                  هامش الربح: {profit >= 0 ? "+" : ""}{profit.toFixed(2)} ج.م ({margin}%)
                </Text>
              </View>
            )}
          </View>

          {/* المخزون */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <View style={[styles.cardLine, { backgroundColor: "#8B5CF6" }]} />
            <Text style={[styles.cardTitle, { color: c.mutedForeground }]}>المخزون</Text>

            <View style={styles.priceRow}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="الكمية الابتدائية"
                  placeholder="0"
                  value={quantity} onChangeText={setQuantity}
                  keyboardType="numeric" suffix="وحدة"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <FormField
                  label="حد التنبيه (منخفض)"
                  placeholder="5"
                  value={lowStock} onChangeText={setLowStock}
                  keyboardType="numeric" suffix="وحدة"
                />
              </View>
            </View>
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
                <Feather name="package" size={18} color="#0a0500" />
                <Text style={styles.submitText}>إضافة المنتج</Text>
              </>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, overflow: "hidden" },
  cardLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  cardTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 14, marginTop: 4 },
  label: { fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 6 },
  selectBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13,
  },
  selectBtnText: { flex: 1, fontSize: 15, fontFamily: "Tajawal_400Regular", textAlign: "right" },
  categoriesList: {
    borderRadius: 12, borderWidth: 1, padding: 8, marginTop: 4,
  },
  categoryItem: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 12, borderRadius: 8, marginBottom: 4, borderWidth: 1,
  },
  categoryItemText: { fontSize: 14, fontFamily: "Tajawal_400Regular" },
  priceRow: { flexDirection: "row-reverse" },
  profitBox: {
    borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 4,
  },
  profitText: { fontSize: 13, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  submitBtn: {
    backgroundColor: AMBER, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10,
  },
  submitText: { color: "#0a0500", fontFamily: "Tajawal_800ExtraBold", fontSize: 16 },
});
