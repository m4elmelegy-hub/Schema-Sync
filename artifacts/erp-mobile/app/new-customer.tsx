import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export default function NewCustomerScreen() {
  const c = useColors();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [balance, setBalance] = useState("");
  const [isSupplier, setIsSupplier] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "الاسم مطلوب";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiFetch("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          balance: Number(balance) || 0,
          is_customer: true,
          is_supplier: isSupplier,
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["customers"] });
      Alert.alert("تم", "تمت إضافة العميل بنجاح", [{ text: "حسناً", onPress: () => router.back() }]);
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "فشل في إضافة العميل");
    },
  });

  const handleSubmit = () => { if (validate()) mutate(); };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader
        title="إضافة عميل"
        rightAction={{ label: "حفظ", onPress: handleSubmit, loading: isPending, disabled: isPending }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* رمز الأفاتار */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: AMBER + "18", borderColor: AMBER + "30" }]}>
              <Text style={[styles.avatarText, { color: AMBER }]}>{name.charAt(0) || "ع"}</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <View style={styles.cardLine} />

            <FormField
              label="اسم العميل"
              required
              placeholder="أدخل اسم العميل"
              value={name}
              onChangeText={setName}
              error={errors.name}
            />

            <FormField
              label="رقم الهاتف"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <FormField
              label="الرصيد الافتتاحي"
              placeholder="0"
              value={balance}
              onChangeText={setBalance}
              keyboardType="numeric"
              suffix="ج.م"
            />
          </View>

          {/* نوع العميل */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>نوع العميل</Text>

            <TouchableOpacity
              style={[styles.toggleRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
              onPress={() => setIsSupplier(false)}
            >
              <View style={[styles.radioCircle, {
                borderColor: !isSupplier ? AMBER : c.border,
                backgroundColor: !isSupplier ? AMBER : "transparent",
              }]}>
                {!isSupplier && <View style={styles.radioInner} />}
              </View>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: c.text }]}>عميل فقط</Text>
                <Text style={[styles.toggleSub, { color: c.mutedForeground }]}>يشتري منك</Text>
              </View>
              <Feather name="user" size={20} color={!isSupplier ? AMBER : c.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.toggleRow} onPress={() => setIsSupplier(true)}>
              <View style={[styles.radioCircle, {
                borderColor: isSupplier ? AMBER : c.border,
                backgroundColor: isSupplier ? AMBER : "transparent",
              }]}>
                {isSupplier && <View style={styles.radioInner} />}
              </View>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleLabel, { color: c.text }]}>عميل ومورد</Text>
                <Text style={[styles.toggleSub, { color: c.mutedForeground }]}>يشتري منك ويبيع لك</Text>
              </View>
              <Feather name="users" size={20} color={isSupplier ? AMBER : c.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* زر الحفظ */}
          <TouchableOpacity
            style={[styles.submitBtn, { opacity: isPending ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator color="#0a0500" />
            ) : (
              <>
                <Feather name="user-plus" size={18} color="#0a0500" />
                <Text style={styles.submitText}>إضافة العميل</Text>
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
  avatarSection: { alignItems: "center", paddingVertical: 12 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: "center", alignItems: "center", borderWidth: 2,
  },
  avatarText: { fontSize: 28, fontFamily: "Tajawal_700Bold" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, overflow: "hidden" },
  cardLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  sectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 12, marginTop: 4 },
  toggleRow: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 14, gap: 12 },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    justifyContent: "center", alignItems: "center",
  },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0a0500" },
  toggleInfo: { flex: 1, alignItems: "flex-end" },
  toggleLabel: { fontSize: 14, fontFamily: "Tajawal_700Bold" },
  toggleSub: { fontSize: 12, fontFamily: "Tajawal_400Regular", marginTop: 2 },
  submitBtn: {
    backgroundColor: AMBER, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10,
  },
  submitText: { color: "#0a0500", fontFamily: "Tajawal_800ExtraBold", fontSize: 16 },
});
