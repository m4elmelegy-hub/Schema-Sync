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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

const AMBER = "#F59E0B";

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

const STATUS: Record<string, { label: string; color: string }> = {
  paid:    { label: "مدفوع",       color: "#10B981" },
  partial: { label: "جزئي",        color: AMBER },
  unpaid:  { label: "غير مدفوع",   color: "#EF4444" },
};

const PAYMENT: Record<string, string> = {
  cash: "نقدي", credit: "آجل", partial: "جزئي",
};

function SaleCard({ item }: { item: Sale }) {
  const c = useColors();
  const st = STATUS[item.status] || { label: item.status, color: c.mutedForeground };

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <View style={[styles.cardTopLine, { backgroundColor: st.color }]} />
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: st.color + "18" }]}>
          <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
        </View>
        <View style={styles.invoiceRow}>
          <Text style={[styles.date, { color: c.mutedForeground }]}>{formatDate(item.date || item.created_at)}</Text>
          <Text style={[styles.invoice, { color: AMBER }]}>#{item.invoice_no}</Text>
        </View>
      </View>

      <Text style={[styles.customer, { color: c.text }]}>{item.customer_name || "عميل نقدي"}</Text>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      <View style={styles.amountRow}>
        <View style={[styles.paymentType, { backgroundColor: AMBER + "18" }]}>
          <Text style={[styles.paymentText, { color: AMBER }]}>{PAYMENT[item.payment_type] || item.payment_type}</Text>
        </View>
        <View style={styles.amounts}>
          <View style={styles.amountCol}>
            <Text style={[styles.amtLabel, { color: c.mutedForeground }]}>المتبقي</Text>
            <Text style={[styles.amtVal, { color: item.remaining_amount > 0 ? "#EF4444" : "#10B981" }]}>
              {formatCurrency(item.remaining_amount)}
            </Text>
          </View>
          <View style={[styles.amtSep, { backgroundColor: c.border }]} />
          <View style={styles.amountCol}>
            <Text style={[styles.amtLabel, { color: c.mutedForeground }]}>الإجمالي</Text>
            <Text style={[styles.amtVal, { color: c.text }]}>{formatCurrency(item.total_amount)}</Text>
          </View>
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

  const filtered = (data || []).filter((s) =>
    !search || s.invoice_no.includes(search) || (s.customer_name || "").includes(search)
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={styles.headerLine} />
        <Text style={styles.headerTitle}>المبيعات</Text>
        <Text style={styles.headerSub}>{data?.length || 0} فاتورة</Text>
      </View>

      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث برقم الفاتورة أو العميل..."
          placeholderTextColor={c.mutedForeground}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
        {search ? (
          <Feather name="x" size={16} color={c.mutedForeground} onPress={() => setSearch("")} />
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <SaleCard item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }, !filtered.length && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={AMBER} />}
          ListEmptyComponent={
            <EmptyState icon="shopping-cart" title="لا توجد مبيعات" subtitle={search ? "لا نتائج للبحث" : "لم يتم تسجيل أي مبيعات"} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 16, paddingHorizontal: 20, position: "relative" },
  headerLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  headerTitle: { fontSize: 22, fontFamily: "Tajawal_700Bold", color: "#F0F7FF", textAlign: "right" },
  headerSub: { fontSize: 12, color: AMBER, fontFamily: "Tajawal_400Regular", textAlign: "right", marginTop: 2 },
  searchBox: {
    flexDirection: "row-reverse", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Tajawal_400Regular" },
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },
  card: {
    borderRadius: 16, padding: 16, borderWidth: 1, overflow: "hidden",
  },
  cardTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  invoiceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  invoice: { fontSize: 14, fontFamily: "Tajawal_700Bold" },
  date: { fontSize: 12, fontFamily: "Tajawal_400Regular" },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Tajawal_700Bold" },
  customer: { fontSize: 15, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  amountRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  amounts: { flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  amountCol: { alignItems: "flex-end" },
  amtLabel: { fontSize: 10, fontFamily: "Tajawal_400Regular", marginBottom: 2 },
  amtVal: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  amtSep: { width: StyleSheet.hairlineWidth, height: 28 },
  paymentType: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  paymentText: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
});
