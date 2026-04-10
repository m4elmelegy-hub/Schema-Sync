import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

const AMBER = "#F59E0B";

interface CustomerDetail {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  customer_code: number | null;
  is_supplier: boolean;
  transactions?: { id: number; type: string; amount: number; description: string | null; created_at: string }[];
}

export default function CustomerDetailsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [balance, setBalance] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiFetch<CustomerDetail>(`/api/customers/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (data) {
      setName(data.name);
      setPhone(data.phone || "");
      setBalance(String(Math.abs(data.balance)));
    }
  }, [data]);

  const { mutate: updateCustomer, isPending: updating } = useMutation({
    mutationFn: () =>
      apiFetch(`/api/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          balance: Number(balance) || 0,
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      setEditing(false);
      Alert.alert("تم", "تم تحديث بيانات العميل");
    },
    onError: (e: any) => Alert.alert("خطأ", e.message || "فشل التحديث"),
  });

  const { mutate: deleteCustomer, isPending: deleting } = useMutation({
    mutationFn: () => apiFetch(`/api/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["customers"] });
      router.back();
    },
    onError: (e: any) => Alert.alert("خطأ", e.message || "فشل الحذف"),
  });

  const handleDelete = () => {
    Alert.alert("تأكيد الحذف", `هل تريد حذف "${data?.name}"؟\nسيتم حذف جميع بياناته.`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => deleteCustomer() },
    ]);
  };

  const handlePayment = (type: "receive" | "pay") => {
    router.push({
      pathname: "/payment",
      params: {
        customerId: String(id),
        customerName: data?.name || "",
        currentBalance: String(data?.balance || 0),
        type,
      },
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title="تفاصيل العميل" />
        <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title="تفاصيل العميل" />
        <View style={styles.empty}>
          <Feather name="user" size={48} color={c.mutedForeground} />
          <Text style={[styles.emptyText, { color: c.mutedForeground }]}>العميل غير موجود</Text>
        </View>
      </View>
    );
  }

  const isDebt = data.balance < 0;
  const isCredit = data.balance > 0;
  const balColor = isDebt ? "#EF4444" : isCredit ? "#10B981" : c.mutedForeground;
  const balLabel = isDebt ? "مديون" : isCredit ? "دائن" : "متوازن";

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader
        title={editing ? "تعديل العميل" : data.name}
        rightAction={editing ? {
          label: updating ? "..." : "حفظ",
          onPress: () => updateCustomer(),
          disabled: updating,
        } : {
          label: "تعديل",
          onPress: () => setEditing(true),
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!editing ? (
            <>
              {/* بطاقة الرصيد */}
              <View style={[styles.card, { backgroundColor: c.card, borderColor: balColor + "40" }]}>
                <View style={[styles.cardLine, { backgroundColor: balColor }]} />
                <View style={styles.profileRow}>
                  <View style={[styles.avatar, { backgroundColor: AMBER + "18" }]}>
                    <Text style={[styles.avatarText, { color: AMBER }]}>{data.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={[styles.profileName, { color: c.text }]}>{data.name}</Text>
                    {data.phone && (
                      <View style={styles.phoneRow}>
                        <Feather name="phone" size={13} color={c.mutedForeground} />
                        <Text style={[styles.phone, { color: c.mutedForeground }]}>{data.phone}</Text>
                      </View>
                    )}
                    {data.customer_code && <Text style={[styles.code, { color: AMBER }]}>#{data.customer_code}</Text>}
                    {data.is_supplier && <View style={[styles.supplierBadge, { backgroundColor: "#7C3AED18" }]}><Text style={{ color: "#7C3AED", fontSize: 11, fontFamily: "Tajawal_700Bold" }}>عميل + مورد</Text></View>}
                  </View>
                  <View style={[styles.balanceBox, { backgroundColor: balColor + "15" }]}>
                    <Text style={[styles.balLabel, { color: balColor }]}>{balLabel}</Text>
                    <Text style={[styles.balValue, { color: balColor }]}>{formatCurrency(Math.abs(data.balance))}</Text>
                    <Text style={[styles.balCurrency, { color: balColor }]}>ج.م</Text>
                  </View>
                </View>
              </View>

              {/* أزرار الدفعات */}
              <View style={styles.payBtns}>
                <TouchableOpacity
                  style={[styles.payBtn, { backgroundColor: "#10B981" }]}
                  onPress={() => handlePayment("receive")}
                >
                  <Feather name="arrow-down-left" size={18} color="#fff" />
                  <Text style={styles.payBtnText}>استلام دفعة</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.payBtn, { backgroundColor: "#EF4444" }]}
                  onPress={() => handlePayment("pay")}
                >
                  <Feather name="arrow-up-right" size={18} color="#fff" />
                  <Text style={styles.payBtnText}>تسديد دفعة</Text>
                </TouchableOpacity>
              </View>

              {/* سجل المعاملات */}
              {(data.transactions || []).length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>آخر المعاملات</Text>
                  <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                    {(data.transactions || []).slice(0, 10).map((t, idx, arr) => (
                      <View
                        key={t.id}
                        style={[
                          styles.txRow,
                          idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                        ]}
                      >
                        <Text style={[styles.txAmount, { color: (t.type === "in" || t.type === "receive") ? "#10B981" : "#EF4444" }]}>
                          {(t.type === "in" || t.type === "receive") ? "+" : "-"}{formatCurrency(t.amount)} ج.م
                        </Text>
                        <View style={styles.txInfo}>
                          <Text style={[styles.txDesc, { color: c.text }]} numberOfLines={1}>{t.description || "معاملة"}</Text>
                          <Text style={[styles.txDate, { color: c.mutedForeground }]}>{formatDate(t.created_at)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* زر الحذف */}
              <TouchableOpacity
                style={[styles.deleteBtn, { opacity: deleting ? 0.6 : 1 }]}
                onPress={handleDelete}
                disabled={deleting}
              >
                <Feather name="trash-2" size={18} color="#fff" />
                <Text style={styles.deleteBtnText}>حذف العميل</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <View style={[styles.cardLine, { backgroundColor: AMBER }]} />
                <View style={{ padding: 16 }}>
                  <FormField label="اسم العميل" required placeholder="اسم العميل" value={name} onChangeText={setName} />
                  <FormField label="رقم الهاتف" placeholder="01xxxxxxxxx" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                  <FormField label="الرصيد" placeholder="0" value={balance} onChangeText={setBalance} keyboardType="numeric" suffix="ج.م" />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { opacity: updating ? 0.6 : 1 }]}
                onPress={() => updateCustomer()}
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
  profileRow: { flexDirection: "row-reverse", gap: 14, padding: 14, alignItems: "center" },
  avatar: { width: 54, height: 54, borderRadius: 27, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 22, fontFamily: "Tajawal_700Bold" },
  profileInfo: { flex: 1, alignItems: "flex-end", gap: 4 },
  profileName: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  phoneRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  phone: { fontSize: 13, fontFamily: "Tajawal_400Regular" },
  code: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
  supplierBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  balanceBox: { alignItems: "center", borderRadius: 14, padding: 12, minWidth: 80 },
  balLabel: { fontSize: 10, fontFamily: "Tajawal_700Bold", marginBottom: 2 },
  balValue: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  balCurrency: { fontSize: 10, fontFamily: "Tajawal_400Regular" },
  payBtns: { flexDirection: "row-reverse", gap: 12 },
  payBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  payBtnText: { color: "#fff", fontSize: 14, fontFamily: "Tajawal_700Bold" },
  sectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginTop: 4 },
  txRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  txAmount: { fontSize: 14, fontFamily: "Tajawal_700Bold" },
  txInfo: { flex: 1, alignItems: "flex-end", marginRight: 10 },
  txDesc: { fontSize: 13, fontFamily: "Tajawal_500Medium" },
  txDate: { fontSize: 11, fontFamily: "Tajawal_400Regular", marginTop: 2 },
  deleteBtn: { backgroundColor: "#EF4444", borderRadius: 14, paddingVertical: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  deleteBtnText: { color: "#fff", fontSize: 15, fontFamily: "Tajawal_800ExtraBold" },
  saveBtn: { backgroundColor: "#F59E0B", borderRadius: 14, paddingVertical: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10 },
  saveBtnText: { color: "#0a0500", fontSize: 15, fontFamily: "Tajawal_800ExtraBold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Tajawal_400Regular" },
});
