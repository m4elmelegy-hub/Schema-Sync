import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useColors } from "@/hooks/useColors";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

interface Sale {
  id: number;
  invoice_no: string;
  customer_name: string | null;
  payment_type: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
  date: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: "مدفوع", color: "#16A34A" },
  partial: { label: "جزئي", color: "#D97706" },
  unpaid: { label: "غير مدفوع", color: "#DC2626" },
};

const PAYMENT_MAP: Record<string, string> = {
  cash: "نقدي",
  credit: "آجل",
  partial: "جزئي",
};

function SaleCard({ item }: { item: Sale }) {
  const c = useColors();
  const status = STATUS_MAP[item.status] || { label: item.status, color: c.mutedForeground };

  return (
    <View style={[styles.card, { backgroundColor: c.card, shadowColor: c.shadow }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: status.color + "18" }]}>
          <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
        </View>
        <View style={styles.invoiceRow}>
          <Text style={[styles.date, { color: c.mutedForeground }]}>{formatDate(item.date || item.created_at)}</Text>
          <Text style={[styles.invoice, { color: c.primary }]}>#{item.invoice_no}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <Text style={[styles.customer, { color: c.text }]}>{item.customer_name || "عميل نقدي"}</Text>
      <View style={styles.amountRow}>
        <View>
          <Text style={[styles.label, { color: c.mutedForeground }]}>المبلغ المتبقي</Text>
          <Text style={[styles.amount, { color: item.remaining_amount > 0 ? "#DC2626" : "#16A34A" }]}>
            {formatCurrency(item.remaining_amount)}
          </Text>
        </View>
        <View style={styles.separator} />
        <View>
          <Text style={[styles.label, { color: c.mutedForeground }]}>الإجمالي</Text>
          <Text style={[styles.total, { color: c.text }]}>{formatCurrency(item.total_amount)}</Text>
        </View>
        <View style={[styles.paymentType, { backgroundColor: c.secondary }]}>
          <Text style={[styles.paymentText, { color: c.primary }]}>{PAYMENT_MAP[item.payment_type] || item.payment_type}</Text>
        </View>
      </View>
    </View>
  );
}

export default function SalesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["sales"],
    queryFn: () => apiFetch<Sale[]>("/api/sales"),
    staleTime: 30_000,
  });

  const filtered = (data || []).filter(
    (s) =>
      !search ||
      s.invoice_no.includes(search) ||
      (s.customer_name || "").includes(search)
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.headerTitle}>المبيعات</Text>
        <Text style={styles.headerSub}>{data?.length || 0} فاتورة</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={18} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث برقم الفاتورة أو العميل..."
          placeholderTextColor={c.mutedForeground}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={c.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <SaleCard item={item} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWeb ? 34 : insets.bottom + 100 },
            !filtered.length && styles.emptyList,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
          scrollEnabled={filtered.length > 0}
          ListEmptyComponent={
            <EmptyState
              icon="shopping-cart"
              title="لا توجد مبيعات"
              subtitle={search ? "لا توجد نتائج للبحث" : "لم يتم تسجيل أي مبيعات بعد"}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 16, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 2 },
  searchWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", marginRight: 8 },
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },
  card: {
    borderRadius: 16, padding: 16,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  invoiceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  invoice: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  date: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB", marginBottom: 12 },
  customer: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "right", marginBottom: 12 },
  amountRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  label: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", marginBottom: 2 },
  amount: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "right" },
  total: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "right" },
  separator: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: "#E5E7EB" },
  paymentType: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: "auto" },
  paymentText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
