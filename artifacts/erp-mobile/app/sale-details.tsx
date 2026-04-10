import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

const AMBER = "#F59E0B";

interface SaleItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface SaleDetail {
  id: number;
  invoice_no: string;
  customer_name: string | null;
  payment_type: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  discount_percent: number | null;
  status: string;
  date: string | null;
  created_at: string;
  notes: string | null;
  items: SaleItem[];
  safe_name: string | null;
  warehouse_name: string | null;
}

interface Safe { id: number; name: string; balance: string; }

const STATUS: Record<string, { label: string; color: string }> = {
  paid:    { label: "مدفوع",       color: "#10B981" },
  partial: { label: "جزئي",        color: AMBER },
  unpaid:  { label: "غير مدفوع",   color: "#EF4444" },
};

const PAYMENT: Record<string, string> = {
  cash: "نقدي", credit: "آجل", partial: "جزئي",
};

export default function SaleDetailsScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [payModal, setPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [selectedSafe, setSelectedSafe] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => apiFetch<SaleDetail>(`/api/sales/${id}`),
    enabled: !!id,
  });

  const { data: safes } = useQuery({
    queryKey: ["safes"],
    queryFn: () => apiFetch<Safe[]>("/api/settings/safes"),
    staleTime: 60_000,
  });

  const { mutate: receivePayment, isPending: paying } = useMutation({
    mutationFn: () =>
      apiFetch(`/api/sales/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(payAmount),
          safe_id: selectedSafe || safes?.[0]?.id,
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["sale", id] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setPayModal(false);
      setPayAmount("");
      Alert.alert("تم", "تم تسجيل الدفعة بنجاح");
    },
    onError: (e: any) => Alert.alert("خطأ", e.message || "فشل تسجيل الدفعة"),
  });

  const handleReceivePayment = () => {
    if (!payAmount || Number(payAmount) <= 0) {
      Alert.alert("تنبيه", "أدخل مبلغاً صحيحاً");
      return;
    }
    receivePayment();
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title="تفاصيل الفاتورة" />
        <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title="تفاصيل الفاتورة" />
        <View style={styles.empty}>
          <Feather name="file-text" size={48} color={c.mutedForeground} />
          <Text style={[styles.emptyText, { color: c.mutedForeground }]}>الفاتورة غير موجودة</Text>
        </View>
      </View>
    );
  }

  const st = STATUS[data.status] || { label: data.status, color: c.mutedForeground };
  const canPay = data.remaining_amount > 0;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader
        title={`فاتورة #${data.invoice_no}`}
        subtitle={st.label}
        rightAction={canPay ? {
          label: "استلام دفعة",
          onPress: () => setPayModal(true),
        } : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* بيانات الفاتورة */}
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={[styles.cardLine, { backgroundColor: st.color }]} />

          <View style={styles.row}>
            <Text style={[styles.label, { color: c.mutedForeground }]}>العميل</Text>
            <Text style={[styles.value, { color: c.text }]}>{data.customer_name || "عميل نقدي"}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />

          <View style={styles.row}>
            <Text style={[styles.label, { color: c.mutedForeground }]}>التاريخ</Text>
            <Text style={[styles.value, { color: c.text }]}>{formatDate(data.date || data.created_at)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />

          <View style={styles.row}>
            <Text style={[styles.label, { color: c.mutedForeground }]}>طريقة الدفع</Text>
            <Text style={[styles.value, { color: AMBER }]}>{PAYMENT[data.payment_type] || data.payment_type}</Text>
          </View>
          {data.warehouse_name && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.row}>
                <Text style={[styles.label, { color: c.mutedForeground }]}>المخزن</Text>
                <Text style={[styles.value, { color: c.text }]}>{data.warehouse_name}</Text>
              </View>
            </>
          )}
          {data.safe_name && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.row}>
                <Text style={[styles.label, { color: c.mutedForeground }]}>الخزينة</Text>
                <Text style={[styles.value, { color: c.text }]}>{data.safe_name}</Text>
              </View>
            </>
          )}
          {data.notes && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.row}>
                <Text style={[styles.label, { color: c.mutedForeground }]}>ملاحظات</Text>
                <Text style={[styles.value, { color: c.text }]}>{data.notes}</Text>
              </View>
            </>
          )}
        </View>

        {/* المنتجات */}
        <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>المنتجات</Text>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={[styles.tableHeader, { borderBottomColor: c.border }]}>
            <Text style={[styles.thTotal, { color: c.mutedForeground }]}>الإجمالي</Text>
            <Text style={[styles.thPrice, { color: c.mutedForeground }]}>السعر</Text>
            <Text style={[styles.thQty, { color: c.mutedForeground }]}>الكمية</Text>
            <Text style={[styles.thName, { color: c.mutedForeground }]}>المنتج</Text>
          </View>
          {(data.items || []).map((item, idx) => (
            <View
              key={item.id}
              style={[styles.tableRow, { borderBottomColor: c.border, borderBottomWidth: idx < data.items.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
            >
              <Text style={[styles.tdTotal, { color: AMBER }]}>{formatCurrency(item.total_price)}</Text>
              <Text style={[styles.tdPrice, { color: c.mutedForeground }]}>{formatCurrency(item.unit_price)}</Text>
              <Text style={[styles.tdQty, { color: c.text }]}>{item.quantity}</Text>
              <Text style={[styles.tdName, { color: c.text }]} numberOfLines={2}>{item.product_name}</Text>
            </View>
          ))}
        </View>

        {/* ملخص المالي */}
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={[styles.cardLine, { backgroundColor: AMBER }]} />
          <Text style={[styles.sectionTitleInCard, { color: c.mutedForeground }]}>الملخص المالي</Text>

          <View style={styles.row}>
            <Text style={[styles.label, { color: c.mutedForeground }]}>المجموع الكلي</Text>
            <Text style={[styles.value, { color: c.text }]}>{formatCurrency(data.total_amount)} ج.م</Text>
          </View>
          {(data.discount_percent || 0) > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.row}>
                <Text style={[styles.label, { color: c.mutedForeground }]}>الخصم</Text>
                <Text style={[styles.value, { color: "#EF4444" }]}>{data.discount_percent}%</Text>
              </View>
            </>
          )}
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.row}>
            <Text style={[styles.label, { color: c.mutedForeground }]}>المدفوع</Text>
            <Text style={[styles.value, { color: "#10B981" }]}>{formatCurrency(data.paid_amount)} ج.م</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.row}>
            <Text style={[styles.totalLabel, { color: c.text }]}>المتبقي</Text>
            <Text style={[styles.totalValue, { color: data.remaining_amount > 0 ? "#EF4444" : "#10B981" }]}>
              {formatCurrency(data.remaining_amount)} ج.م
            </Text>
          </View>
        </View>

        {/* زر استلام الدفعة */}
        {canPay && (
          <TouchableOpacity style={styles.payBtn} onPress={() => setPayModal(true)}>
            <Feather name="dollar-sign" size={18} color="#0a0500" />
            <Text style={styles.payBtnText}>استلام دفعة — متبقي {formatCurrency(data.remaining_amount)} ج.م</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Modal استلام الدفعة */}
      <Modal visible={payModal} transparent animationType="slide" onRequestClose={() => setPayModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: "rgba(245,158,11,0.3)" }]}>
              <View style={styles.modalTopLine} />
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setPayModal(false)}>
                  <Feather name="x" size={22} color={c.mutedForeground} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: c.text }]}>استلام دفعة</Text>
              </View>

              <Text style={[styles.modalSub, { color: c.mutedForeground }]}>
                المتبقي: {formatCurrency(data.remaining_amount)} ج.م
              </Text>

              <View style={[styles.amountInput, { backgroundColor: c.background, borderColor: AMBER }]}>
                <Text style={[styles.amountSuffix, { color: c.mutedForeground }]}>ج.م</Text>
                <TextInput
                  style={[styles.amountField, { color: c.text }]}
                  placeholder="0.00"
                  placeholderTextColor={c.mutedForeground}
                  value={payAmount}
                  onChangeText={setPayAmount}
                  keyboardType="numeric"
                  textAlign="right"
                  autoFocus
                />
                <Text style={[styles.amountLabel, { color: AMBER }]}>المبلغ المستلم</Text>
              </View>

              {(safes?.length || 0) > 1 && (
                <>
                  <Text style={[styles.modalFieldLabel, { color: c.mutedForeground }]}>الخزينة</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                      {(safes || []).map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.safeChip, {
                            backgroundColor: selectedSafe === s.id ? AMBER : c.background,
                            borderColor: selectedSafe === s.id ? AMBER : c.border,
                          }]}
                          onPress={() => setSelectedSafe(s.id)}
                        >
                          <Text style={[styles.safeChipText, { color: selectedSafe === s.id ? "#0a0500" : c.mutedForeground }]}>
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              <TouchableOpacity
                style={[styles.modalSubmit, { opacity: paying ? 0.6 : 1 }]}
                onPress={handleReceivePayment}
                disabled={paying}
              >
                {paying ? <ActivityIndicator color="#0a0500" /> : <Text style={styles.modalSubmitText}>تأكيد الاستلام</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardLine: { height: 2 },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", padding: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  label: { fontSize: 13, fontFamily: "Tajawal_400Regular" },
  value: { fontSize: 14, fontFamily: "Tajawal_700Bold", textAlign: "left", flex: 1, textAlign: "left", marginRight: 8 },
  totalLabel: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  totalValue: { fontSize: 20, fontFamily: "Tajawal_800ExtraBold" },
  sectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginTop: 4 },
  sectionTitleInCard: { fontSize: 11, fontFamily: "Tajawal_500Medium", textAlign: "right", padding: 14, paddingBottom: 0 },
  tableHeader: {
    flexDirection: "row-reverse", paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableRow: { flexDirection: "row-reverse", paddingHorizontal: 14, paddingVertical: 12 },
  thName: { flex: 2, fontSize: 11, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  thQty: { width: 40, fontSize: 11, fontFamily: "Tajawal_700Bold", textAlign: "center" },
  thPrice: { width: 70, fontSize: 11, fontFamily: "Tajawal_700Bold", textAlign: "center" },
  thTotal: { width: 70, fontSize: 11, fontFamily: "Tajawal_700Bold", textAlign: "left" },
  tdName: { flex: 2, fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right" },
  tdQty: { width: 40, fontSize: 13, fontFamily: "Tajawal_700Bold", textAlign: "center" },
  tdPrice: { width: 70, fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "center" },
  tdTotal: { width: 70, fontSize: 13, fontFamily: "Tajawal_700Bold", textAlign: "left" },
  payBtn: {
    backgroundColor: AMBER, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10,
  },
  payBtnText: { color: "#0a0500", fontSize: 15, fontFamily: "Tajawal_800ExtraBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Tajawal_400Regular" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { borderRadius: 20, borderWidth: 1, padding: 20, overflow: "hidden", margin: 16 },
  modalTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  modalSub: { fontSize: 13, fontFamily: "Tajawal_400Regular", textAlign: "right", marginBottom: 16 },
  modalFieldLabel: { fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 8 },
  amountInput: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, marginBottom: 16,
  },
  amountField: { flex: 1, fontSize: 22, fontFamily: "Tajawal_700Bold", paddingVertical: 14 },
  amountSuffix: { fontSize: 14, fontFamily: "Tajawal_400Regular", marginLeft: 8 },
  amountLabel: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  safeChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  safeChipText: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  modalSubmit: { backgroundColor: AMBER, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  modalSubmitText: { color: "#0a0500", fontFamily: "Tajawal_800ExtraBold", fontSize: 16 },
});
