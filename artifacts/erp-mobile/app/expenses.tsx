import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { ModalHeader } from "@/components/ModalHeader";
import { useColors } from "@/hooks/useColors";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

const AMBER = "#F59E0B";
const DANGER = "#EF4444";

interface Expense {
  id: number;
  description: string;
  amount: number;
  date: string | null;
  created_at: string;
  category: string | null;
  safe_name: string | null;
}

interface Safe { id: number; name: string; balance: string; }

function ExpenseCard({ item }: { item: Expense }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <View style={styles.cardTopLine} />
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <Text style={[styles.amount, { color: DANGER }]}>- {formatCurrency(item.amount)} ج.م</Text>
          <Text style={[styles.date, { color: c.mutedForeground }]}>{formatDate(item.date || item.created_at)}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.description, { color: c.text }]} numberOfLines={2}>{item.description}</Text>
          {item.category && (
            <View style={[styles.categoryBadge, { backgroundColor: AMBER + "18" }]}>
              <Text style={[styles.categoryText, { color: AMBER }]}>{item.category}</Text>
            </View>
          )}
          {item.safe_name && (
            <Text style={[styles.safeName, { color: c.mutedForeground }]}>
              <Feather name="dollar-sign" size={11} color={c.mutedForeground} /> {item.safe_name}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ExpensesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const qc = useQueryClient();

  const [addModal, setAddModal] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [selectedSafe, setSelectedSafe] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => apiFetch<Expense[]>("/api/expenses"),
    staleTime: 30_000,
  });

  const { data: safes } = useQuery({
    queryKey: ["safes"],
    queryFn: () => apiFetch<Safe[]>("/api/settings/safes"),
    staleTime: 60_000,
  });

  const { mutate: addExpense, isPending } = useMutation({
    mutationFn: () =>
      apiFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          description: description.trim(),
          amount: Number(amount),
          category: category.trim() || "عام",
          safe_id: selectedSafe || safes?.[0]?.id || null,
          date: new Date().toISOString().split("T")[0],
        }),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setAddModal(false);
      setDescription(""); setAmount(""); setCategory(""); setSelectedSafe(null);
      Alert.alert("تم", "تمت إضافة المصروف بنجاح");
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "فشل في إضافة المصروف");
    },
  });

  const handleSubmit = () => {
    if (!description.trim()) { Alert.alert("تنبيه", "أدخل وصف المصروف"); return; }
    if (!amount || Number(amount) <= 0) { Alert.alert("تنبيه", "أدخل مبلغاً صحيحاً"); return; }
    addExpense();
  };

  const filtered = (data || []).filter((e) =>
    !search || e.description.includes(search) || (e.category || "").includes(search)
  );

  const total = (data || []).reduce((acc, e) => acc + Number(e.amount), 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={[styles.headerLine, { backgroundColor: AMBER }]} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Feather name="arrow-right" size={22} color={c.text} />
          </TouchableOpacity>
          <View style={styles.headerTexts}>
            <Text style={[styles.headerTitle, { color: c.text }]}>المصروفات</Text>
            <Text style={[styles.headerSub, { color: c.mutedForeground }]}>
              {data?.length || 0} مصروف • الإجمالي: {formatCurrency(total)} ج.م
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث بالوصف أو الفئة..."
          placeholderTextColor={c.mutedForeground}
          value={search} onChangeText={setSearch} textAlign="right"
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={c.mutedForeground} /></TouchableOpacity> : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={DANGER} size="large" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <ExpenseCard item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }, !filtered.length && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={DANGER} />}
          ListEmptyComponent={
            <EmptyState
              icon="credit-card"
              title="لا توجد مصروفات"
              subtitle={search ? "لا نتائج للبحث" : "أضف أول مصروف الآن"}
            />
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: isWeb ? 34 : insets.bottom + 80 }]}
        onPress={() => setAddModal(true)}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={26} color="#0a0500" />
      </TouchableOpacity>

      {/* Add Modal */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: DANGER + "40" }]}>
              <View style={[styles.modalTopLine, { backgroundColor: DANGER }]} />
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setAddModal(false)}>
                  <Feather name="x" size={22} color={c.mutedForeground} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: c.text }]}>إضافة مصروف</Text>
              </View>

              {/* الوصف */}
              <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>الوصف *</Text>
              <View style={[styles.fieldInput, { backgroundColor: c.background, borderColor: c.border }]}>
                <TextInput
                  style={[styles.fieldText, { color: c.text }]}
                  placeholder="مثال: فاتورة كهرباء"
                  placeholderTextColor={c.mutedForeground}
                  value={description} onChangeText={setDescription} textAlign="right"
                />
              </View>

              {/* المبلغ */}
              <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>المبلغ *</Text>
              <View style={[styles.fieldInput, { backgroundColor: c.background, borderColor: c.border }]}>
                <Text style={[styles.fieldSuffix, { color: c.mutedForeground }]}>ج.م</Text>
                <TextInput
                  style={[styles.fieldText, { color: c.text }]}
                  placeholder="0.00"
                  placeholderTextColor={c.mutedForeground}
                  value={amount} onChangeText={setAmount}
                  keyboardType="numeric" textAlign="right"
                />
              </View>

              {/* الفئة */}
              <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>الفئة (اختياري)</Text>
              <View style={[styles.fieldInput, { backgroundColor: c.background, borderColor: c.border }]}>
                <TextInput
                  style={[styles.fieldText, { color: c.text }]}
                  placeholder="مثال: كهرباء، إيجار..."
                  placeholderTextColor={c.mutedForeground}
                  value={category} onChangeText={setCategory} textAlign="right"
                />
              </View>

              {/* الخزينة */}
              {(safes?.length || 0) > 1 && (
                <>
                  <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>الخزينة</Text>
                  <View style={styles.safesRow}>
                    {(safes || []).map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.safeChip, {
                          backgroundColor: selectedSafe === s.id ? DANGER : c.background,
                          borderColor: selectedSafe === s.id ? DANGER : c.border,
                        }]}
                        onPress={() => setSelectedSafe(s.id)}
                      >
                        <Text style={[styles.safeChipText, { color: selectedSafe === s.id ? "#fff" : c.mutedForeground }]}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: DANGER, opacity: isPending ? 0.6 : 1 }]}
                onPress={handleSubmit}
                disabled={isPending}
              >
                {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitText}>إضافة المصروف</Text>}
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
  header: { paddingBottom: 14, paddingHorizontal: 16, position: "relative" },
  headerLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center", borderRadius: 10 },
  headerTexts: { flex: 1, alignItems: "flex-end" },
  headerAddBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  headerSub: { fontSize: 11, fontFamily: "Tajawal_400Regular", textAlign: "right", marginTop: 1 },
  searchBox: {
    flexDirection: "row-reverse", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Tajawal_400Regular" },
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },
  fab: {
    position: "absolute", right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: AMBER,
    justifyContent: "center", alignItems: "center",
    shadowColor: AMBER, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardTopLine: { height: 2, backgroundColor: DANGER },
  cardRow: { flexDirection: "row-reverse", padding: 14, gap: 12 },
  cardLeft: { alignItems: "flex-end", minWidth: 100 },
  amount: { fontSize: 16, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  date: { fontSize: 11, fontFamily: "Tajawal_400Regular", marginTop: 4 },
  cardRight: { flex: 1, alignItems: "flex-end", gap: 4 },
  description: { fontSize: 14, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  categoryBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  categoryText: { fontSize: 11, fontFamily: "Tajawal_700Bold" },
  safeName: { fontSize: 11, fontFamily: "Tajawal_400Regular" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { borderRadius: 20, borderWidth: 1, padding: 20, overflow: "hidden", margin: 16 },
  modalTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 6 },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", marginBottom: 12 },
  fieldText: { flex: 1, fontSize: 15, fontFamily: "Tajawal_400Regular", paddingVertical: 11, textAlign: "right" },
  fieldSuffix: { fontSize: 13, marginLeft: 8 },
  safesRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  safeChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  safeChipText: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  modalSubmit: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  modalSubmitText: { color: "#fff", fontFamily: "Tajawal_800ExtraBold", fontSize: 16 },
});
