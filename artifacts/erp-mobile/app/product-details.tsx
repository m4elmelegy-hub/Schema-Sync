import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { apiFetch, formatCurrency } from "@/lib/api";

const AMBER = "#F59E0B";

interface Product {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number | null;
}

export default function ProductDetailsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [lowStock, setLowStock] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => apiFetch<Product>(`/api/products/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (data) {
      setName(data.name);
      setSku(data.sku || "");
      setCategory(data.category || "");
      setQuantity(String(data.quantity));
      setCostPrice(String(data.cost_price));
      setSalePrice(String(data.sale_price));
      setLowStock(data.low_stock_threshold ? String(data.low_stock_threshold) : "");
    }
  }, [data]);

  const { mutate: updateProduct, isPending: updating } = useMutation({
    mutationFn: () =>
      apiFetch(`/api/products/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || null,
          category: category.trim() || null,
          quantity: Number(quantity) || 0,
          cost_price: Number(costPrice) || 0,
          sale_price: Number(salePrice) || 0,
          low_stock_threshold: lowStock ? Number(lowStock) : null,
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(false);
      Alert.alert("تم", "تم تحديث المنتج بنجاح");
    },
    onError: (e: any) => Alert.alert("خطأ", e.message || "فشل التحديث"),
  });

  const { mutate: deleteProduct, isPending: deleting } = useMutation({
    mutationFn: () => apiFetch(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      router.back();
    },
    onError: (e: any) => Alert.alert("خطأ", e.message || "فشل الحذف"),
  });

  const handleDelete = () => {
    Alert.alert("تأكيد الحذف", `هل تريد حذف "${data?.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => deleteProduct() },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title="تفاصيل المنتج" />
        <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title="تفاصيل المنتج" />
        <View style={styles.empty}>
          <Feather name="package" size={48} color={c.mutedForeground} />
          <Text style={[styles.emptyText, { color: c.mutedForeground }]}>المنتج غير موجود</Text>
        </View>
      </View>
    );
  }

  const isOut = data.quantity <= 0;
  const isLow = !isOut && data.low_stock_threshold != null && data.quantity <= data.low_stock_threshold;
  const stockColor = isOut ? "#EF4444" : isLow ? AMBER : "#10B981";
  const stockLabel = isOut ? "نفذ المخزون" : isLow ? "مخزون منخفض" : "متاح";
  const profit = data.sale_price - data.cost_price;
  const margin = data.cost_price > 0 ? ((profit / data.cost_price) * 100).toFixed(1) : "0";

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader
        title={editing ? "تعديل المنتج" : data.name}
        rightAction={editing ? {
          label: updating ? "..." : "حفظ",
          onPress: () => updateProduct(),
          disabled: updating,
        } : {
          label: "تعديل",
          onPress: () => setEditing(true),
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!editing ? (
            <>
              {/* بطاقة المعلومات */}
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={[styles.cardLine, { backgroundColor: stockColor }]} />

                <View style={styles.stockBanner}>
                  <View style={[styles.stockBadge, { backgroundColor: stockColor + "18" }]}>
                    <Text style={[styles.stockQty, { color: stockColor }]}>{data.quantity}</Text>
                    <Text style={[styles.stockUnit, { color: stockColor }]}>وحدة</Text>
                    <Text style={[styles.stockLabel, { color: stockColor }]}>{stockLabel}</Text>
                  </View>
                  <View style={styles.stockInfo}>
                    <Text style={[styles.productName, { color: c.text }]}>{data.name}</Text>
                    {data.sku && <Text style={[styles.sku, { color: c.mutedForeground }]}>SKU: {data.sku}</Text>}
                    {data.category && <View style={[styles.catBadge, { backgroundColor: AMBER + "18" }]}><Text style={[styles.catText, { color: AMBER }]}>{data.category}</Text></View>}
                  </View>
                </View>
              </View>

              {/* الأسعار */}
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={[styles.cardLine, { backgroundColor: AMBER }]} />
                <View style={styles.pricesRow}>
                  <View style={styles.priceBox}>
                    <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>سعر البيع</Text>
                    <Text style={[styles.priceValue, { color: AMBER }]}>{formatCurrency(data.sale_price)} ج.م</Text>
                  </View>
                  <View style={[styles.priceSep, { backgroundColor: c.border }]} />
                  <View style={styles.priceBox}>
                    <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>سعر التكلفة</Text>
                    <Text style={[styles.priceValue, { color: c.text }]}>{formatCurrency(data.cost_price)} ج.م</Text>
                  </View>
                  <View style={[styles.priceSep, { backgroundColor: c.border }]} />
                  <View style={styles.priceBox}>
                    <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>هامش الربح</Text>
                    <Text style={[styles.priceValue, { color: profit >= 0 ? "#10B981" : "#EF4444" }]}>
                      {profit >= 0 ? "+" : ""}{formatCurrency(profit)} ({margin}%)
                    </Text>
                  </View>
                </View>
              </View>

              {data.low_stock_threshold && (
                <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowValue, { color: c.text }]}>{data.low_stock_threshold} وحدة</Text>
                    <Text style={[styles.rowLabel, { color: c.mutedForeground }]}>حد التنبيه</Text>
                  </View>
                </View>
              )}

              {/* زر الحذف */}
              <TouchableOpacity
                style={[styles.deleteBtn, { opacity: deleting ? 0.6 : 1 }]}
                onPress={handleDelete}
                disabled={deleting}
              >
                <Feather name="trash-2" size={18} color="#fff" />
                <Text style={styles.deleteBtnText}>حذف المنتج</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={[styles.cardLine, { backgroundColor: AMBER }]} />
                <Text style={[styles.cardSectionTitle, { color: c.mutedForeground }]}>البيانات الأساسية</Text>
                <FormField label="اسم المنتج" required placeholder="اسم المنتج" value={name} onChangeText={setName} />
                <FormField label="كود/SKU" placeholder="SKU-001" value={sku} onChangeText={setSku} />
                <FormField label="الفئة" placeholder="مثال: إلكترونيات" value={category} onChangeText={setCategory} />
              </View>

              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={[styles.cardLine, { backgroundColor: "#10B981" }]} />
                <Text style={[styles.cardSectionTitle, { color: c.mutedForeground }]}>الأسعار</Text>
                <FormField label="سعر البيع" required placeholder="0.00" value={salePrice} onChangeText={setSalePrice} keyboardType="numeric" suffix="ج.م" />
                <FormField label="سعر التكلفة" placeholder="0.00" value={costPrice} onChangeText={setCostPrice} keyboardType="numeric" suffix="ج.م" />
              </View>

              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={[styles.cardLine, { backgroundColor: "#8B5CF6" }]} />
                <Text style={[styles.cardSectionTitle, { color: c.mutedForeground }]}>المخزون</Text>
                <FormField label="الكمية" placeholder="0" value={quantity} onChangeText={setQuantity} keyboardType="numeric" suffix="وحدة" />
                <FormField label="حد التنبيه" placeholder="5" value={lowStock} onChangeText={setLowStock} keyboardType="numeric" suffix="وحدة" />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { opacity: updating ? 0.6 : 1 }]}
                onPress={() => updateProduct()}
                disabled={updating}
              >
                {updating ? <ActivityIndicator color="#0a0500" /> : (
                  <><Feather name="check" size={18} color="#0a0500" /><Text style={styles.saveBtnText}>حفظ التعديلات</Text></>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardLine: { height: 2 },
  cardSectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", padding: 14, paddingBottom: 4 },
  stockBanner: { flexDirection: "row-reverse", gap: 14, padding: 14 },
  stockBadge: { borderRadius: 14, padding: 14, alignItems: "center", minWidth: 80 },
  stockQty: { fontSize: 28, fontFamily: "Tajawal_800ExtraBold" },
  stockUnit: { fontSize: 11, fontFamily: "Tajawal_400Regular" },
  stockLabel: { fontSize: 10, fontFamily: "Tajawal_700Bold", marginTop: 4 },
  stockInfo: { flex: 1, alignItems: "flex-end", gap: 6 },
  productName: { fontSize: 18, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  sku: { fontSize: 13, fontFamily: "Tajawal_400Regular" },
  catBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  catText: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
  pricesRow: { flexDirection: "row-reverse", alignItems: "center" },
  priceBox: { flex: 1, alignItems: "center", padding: 16 },
  priceLabel: { fontSize: 11, fontFamily: "Tajawal_400Regular", marginBottom: 4 },
  priceValue: { fontSize: 14, fontFamily: "Tajawal_700Bold", textAlign: "center" },
  priceSep: { width: StyleSheet.hairlineWidth, height: 50 },
  rowInfo: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", padding: 14 },
  rowLabel: { fontSize: 13, fontFamily: "Tajawal_400Regular" },
  rowValue: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  deleteBtn: {
    backgroundColor: "#EF4444", borderRadius: 14, paddingVertical: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8,
  },
  deleteBtnText: { color: "#fff", fontSize: 15, fontFamily: "Tajawal_800ExtraBold" },
  saveBtn: {
    backgroundColor: "#F59E0B", borderRadius: 14, paddingVertical: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10,
  },
  saveBtnText: { color: "#0a0500", fontSize: 15, fontFamily: "Tajawal_800ExtraBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Tajawal_400Regular" },
});
