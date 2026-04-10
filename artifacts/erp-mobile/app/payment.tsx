import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

interface Safe { id: number; name: string; balance: string; }

export default function PaymentScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
    customerId: string;
    customerName: string;
    currentBalance: string;
    type: "receive" | "pay";
  }>();

  const customerId = Number(params.customerId);
  const customerName = params.customerName || "العميل";
  const currentBalance = Number(params.currentBalance) || 0;
  const type = params.type || "receive";

  const isReceive = type === "receive";
  const actionColor = isReceive ? "#10B981" : "#EF4444";
  const actionLabel = isReceive ? "استلام دفعة" : "تسديد دفعة";

  const [amount, setAmount] = useState("");
  const [selectedSafe, setSelectedSafe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const { data: safes } = useQuery({
    queryKey: ["safes"],
    queryFn: () => apiFetch<Safe[]>("/api/settings/safes"),
    staleTime: 60_000,
  });

  const { mutate: submitPayment, isPending } = useMutation({
    mutationFn: () => {
      const endpoint = isReceive
        ? "/api/treasury/receipt-vouchers"
        : "/api/treasury/payment-vouchers";
      return apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId,
          amount: Number(amount),
          safe_id: selectedSafe || safes?.[0]?.id,
          notes: notes || null,
          date: new Date().toISOString().split("T")[0],
        }),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      Alert.alert("تم", `تم تسجيل ${actionLabel} بنجاح`, [
        { text: "حسناً", onPress: () => router.back() },
      ]);
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "فشل التسجيل");
    },
  });

  const handleSubmit = () => {
    if (!amount || Number(amount) <= 0) {
      Alert.alert("تنبيه", "أدخل مبلغاً صحيحاً أكبر من صفر");
      return;
    }
    submitPayment();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader title={actionLabel} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* بطاقة العميل */}
          <View style={[styles.customerCard, { backgroundColor: c.card, borderColor: actionColor + "40" }]}>
            <View style={[styles.customerCardLine, { backgroundColor: actionColor }]} />
            <View style={styles.customerCardRow}>
              <View style={[styles.customerAvatar, { backgroundColor: actionColor + "18" }]}>
                <Text style={[styles.customerAvatarText, { color: actionColor }]}>{customerName.charAt(0)}</Text>
              </View>
              <View style={styles.customerInfo}>
                <Text style={[styles.customerName, { color: c.text }]}>{customerName}</Text>
                <View style={[styles.balancePill, { backgroundColor: (currentBalance < 0 ? "#EF4444" : "#10B981") + "18" }]}>
                  <Text style={[styles.balanceLabel, { color: currentBalance < 0 ? "#EF4444" : "#10B981" }]}>
                    الرصيد الحالي: {formatCurrency(Math.abs(currentBalance))} ج.م
                    {currentBalance < 0 ? " (مديون)" : currentBalance > 0 ? " (دائن)" : ""}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* حقل المبلغ */}
          <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>المبلغ</Text>
          <View style={[styles.amountWrap, { backgroundColor: c.card, borderColor: actionColor }]}>
            <Text style={[styles.amountSuffix, { color: c.mutedForeground }]}>ج.م</Text>
            <TextInput
              style={[styles.amountField, { color: c.text }]}
              placeholder="0.00"
              placeholderTextColor={c.mutedForeground}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              textAlign="right"
              autoFocus
            />
            <View style={[styles.amountIcon, { backgroundColor: actionColor + "18" }]}>
              <Feather name={isReceive ? "arrow-down-left" : "arrow-up-right"} size={18} color={actionColor} />
            </View>
          </View>

          {/* الخزينة */}
          {(safes?.length || 0) > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>الخزينة</Text>
              <View style={styles.safesRow}>
                {(safes || []).map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.safeChip,
                      {
                        backgroundColor: selectedSafe === s.id ? actionColor : c.card,
                        borderColor: selectedSafe === s.id ? actionColor : c.border,
                      },
                    ]}
                    onPress={() => setSelectedSafe(s.id)}
                  >
                    <Text style={[styles.safeChipText, { color: selectedSafe === s.id ? "#fff" : c.mutedForeground }]}>
                      {s.name}
                    </Text>
                    <Text style={[styles.safeChipBalance, { color: selectedSafe === s.id ? "rgba(255,255,255,0.8)" : c.mutedForeground }]}>
                      {formatCurrency(Number(s.balance))} ج.م
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ملاحظات */}
          <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>ملاحظات (اختياري)</Text>
          <View style={[styles.notesWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <TextInput
              style={[styles.notesField, { color: c.text }]}
              placeholder="أضف ملاحظة..."
              placeholderTextColor={c.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              textAlign="right"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* زر التأكيد */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: actionColor, opacity: isPending ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name={isReceive ? "check-circle" : "send"} size={20} color="#fff" />
                <Text style={styles.submitBtnText}>{actionLabel} — {amount ? formatCurrency(Number(amount)) : "0.00"} ج.م</Text>
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
  content: { padding: 16, paddingBottom: 40, gap: 0 },
  customerCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  customerCardLine: { height: 2 },
  customerCardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 14, padding: 16 },
  customerAvatar: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center" },
  customerAvatarText: { fontSize: 20, fontFamily: "Tajawal_700Bold" },
  customerInfo: { flex: 1, alignItems: "flex-end", gap: 6 },
  customerName: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  balancePill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  balanceLabel: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
  sectionLabel: { fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 10, marginTop: 16 },
  amountWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 16, borderWidth: 2, paddingHorizontal: 16, marginBottom: 4,
  },
  amountField: { flex: 1, fontSize: 28, fontFamily: "Tajawal_700Bold", paddingVertical: 18 },
  amountSuffix: { fontSize: 16, fontFamily: "Tajawal_400Regular", marginLeft: 10 },
  amountIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  safesRow: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  safeChip: { borderRadius: 14, borderWidth: 1, padding: 12, minWidth: 120, alignItems: "flex-end" },
  safeChipText: { fontSize: 13, fontFamily: "Tajawal_700Bold", marginBottom: 2 },
  safeChipBalance: { fontSize: 11, fontFamily: "Tajawal_400Regular" },
  notesWrap: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  notesField: { fontSize: 15, fontFamily: "Tajawal_400Regular", minHeight: 80 },
  submitBtn: {
    borderRadius: 14, paddingVertical: 18,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10,
    marginTop: 24,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Tajawal_800ExtraBold" },
});
