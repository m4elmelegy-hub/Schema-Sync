import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
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
import { ModalHeader } from "@/components/ModalHeader";
import { useColors } from "@/hooks/useColors";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

const AMBER = "#F59E0B";
const PURPLE = "#7C3AED";

interface Purchase {
  id: number;
  invoice_no: string;
  supplier_name: string | null;
  customer_name: string | null;
  payment_type: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  posting_status: string;
  date: string | null;
  created_at: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft:     { label: "مسودة",    color: "#94A3B8" },
  posted:    { label: "مرحّلة",   color: "#10B981" },
  cancelled: { label: "ملغاة",    color: "#EF4444" },
};

const PAYMENT: Record<string, string> = {
  cash:    "نقدي",
  credit:  "آجل",
  partial: "جزئي",
};

function PurchaseCard({ item }: { item: Purchase }) {
  const c = useColors();
  const st = STATUS[item.posting_status] || { label: item.posting_status, color: c.mutedForeground };
  const supplier = item.supplier_name || item.customer_name || "مورد";

  const remainingAmt = Number(item.remaining_amount);
  const totalAmt = Number(item.total_amount);
  const paidAmt = Number(item.paid_amount);

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <View style={[styles.cardTopLine, { backgroundColor: PURPLE }]} />

      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: st.color + "1A" }]}>
          <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
        </View>
        <View style={styles.invoiceRow}>
          <Text style={[styles.date, { color: c.mutedForeground }]}>
            {formatDate(item.date || item.created_at)}
          </Text>
          <Text style={[styles.invoice, { color: PURPLE }]}>#{item.invoice_no}</Text>
        </View>
      </View>

      {/* المورد */}
      <View style={styles.supplierRow}>
        <Feather name="truck" size={14} color={c.mutedForeground} />
        <Text style={[styles.supplier, { color: c.text }]}>{supplier}</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      {/* المبالغ */}
      <View style={styles.amountsRow}>
        <View style={[styles.paymentChip, { backgroundColor: AMBER + "1A" }]}>
          <Text style={[styles.paymentText, { color: AMBER }]}>
            {PAYMENT[item.payment_type] || item.payment_type}
          </Text>
        </View>

        <View style={styles.amounts}>
          <View style={styles.amtCol}>
            <Text style={[styles.amtLabel, { color: c.mutedForeground }]}>المتبقي</Text>
            <Text style={[styles.amtVal, { color: remainingAmt > 0 ? "#EF4444" : "#10B981" }]}>
              {formatCurrency(remainingAmt)}
            </Text>
          </View>
          <View style={[styles.amtSep, { backgroundColor: c.border }]} />
          <View style={styles.amtCol}>
            <Text style={[styles.amtLabel, { color: c.mutedForeground }]}>المدفوع</Text>
            <Text style={[styles.amtVal, { color: "#10B981" }]}>{formatCurrency(paidAmt)}</Text>
          </View>
          <View style={[styles.amtSep, { backgroundColor: c.border }]} />
          <View style={styles.amtCol}>
            <Text style={[styles.amtLabel, { color: c.mutedForeground }]}>الإجمالي</Text>
            <Text style={[styles.amtVal, { color: c.text }]}>{formatCurrency(totalAmt)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function PurchasesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "posted" | "draft">("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["purchases"],
    queryFn: () => apiFetch<Purchase[]>("/api/purchases"),
    staleTime: 30_000,
  });

  const filtered = (data || []).filter((p) => {
    const supplier = p.supplier_name || p.customer_name || "";
    const matchSearch = !search || p.invoice_no.includes(search) || supplier.includes(search);
    const matchFilter =
      filter === "all" ||
      (filter === "posted" && p.posting_status === "posted") ||
      (filter === "draft" && p.posting_status === "draft");
    return matchSearch && matchFilter;
  });

  const totalPaid = (data || []).reduce((acc, p) => acc + Number(p.paid_amount), 0);
  const totalRemaining = (data || []).reduce((acc, p) => acc + Number(p.remaining_amount), 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader title="فواتير المشتريات" subtitle={`${data?.length || 0} فاتورة`} />

      {/* ملخص إجمالي */}
      {data && data.length > 0 && (
        <View style={[styles.summaryBar, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>متبقي</Text>
            <Text style={[styles.summaryValue, { color: totalRemaining > 0 ? "#EF4444" : "#10B981" }]}>
              {formatCurrency(totalRemaining)} ج.م
            </Text>
          </View>
          <View style={[styles.summarySep, { backgroundColor: c.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: c.mutedForeground }]}>إجمالي المدفوع</Text>
            <Text style={[styles.summaryValue, { color: "#10B981" }]}>{formatCurrency(totalPaid)} ج.م</Text>
          </View>
        </View>
      )}

      {/* بحث وفلاتر */}
      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث برقم الفاتورة أو المورد..."
          placeholderTextColor={c.mutedForeground}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={c.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filters}>
        {(["all", "posted", "draft"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, {
              backgroundColor: filter === f ? PURPLE : c.card,
              borderColor: filter === f ? PURPLE : c.border,
            }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, { color: filter === f ? "#fff" : c.mutedForeground }]}>
              {f === "all" ? "الكل" : f === "posted" ? "مرحّلة" : "مسودة"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={PURPLE} size="large" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <PurchaseCard item={item} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWeb ? 34 : insets.bottom + 40 },
            !filtered.length && styles.emptyList,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PURPLE} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="shopping-bag"
              title="لا توجد مشتريات"
              subtitle={search ? "لا نتائج للبحث" : "أضف أول فاتورة شراء الآن"}
              actionLabel="فاتورة شراء جديدة"
              onAction={() => router.push("/new-purchase")}
            />
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: isWeb ? 34 : insets.bottom + 20 }]}
        onPress={() => router.push("/new-purchase")}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  summaryBar: {
    flexDirection: "row-reverse",
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryLabel: { fontSize: 11, fontFamily: "Tajawal_400Regular" },
  summaryValue: { fontSize: 16, fontFamily: "Tajawal_700Bold" },
  summarySep: { width: 1, marginVertical: 4 },

  searchBox: {
    flexDirection: "row-reverse", alignItems: "center",
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Tajawal_400Regular" },

  filters: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: "Tajawal_700Bold" },

  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },
  fab: {
    position: "absolute", right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: PURPLE, justifyContent: "center", alignItems: "center",
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },

  card: { borderRadius: 16, padding: 16, borderWidth: 1, overflow: "hidden" },
  cardTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },

  cardHeader: {
    flexDirection: "row-reverse", justifyContent: "space-between",
    alignItems: "center", marginBottom: 10,
  },
  invoiceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  invoice: { fontSize: 14, fontFamily: "Tajawal_700Bold" },
  date: { fontSize: 12, fontFamily: "Tajawal_400Regular" },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Tajawal_700Bold" },

  supplierRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 },
  supplier: { fontSize: 15, fontFamily: "Tajawal_700Bold", textAlign: "right", flex: 1 },

  divider: { height: StyleSheet.hairlineWidth, marginBottom: 12 },

  amountsRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  amounts: { flexDirection: "row-reverse", gap: 10, alignItems: "center" },
  amtCol: { alignItems: "center" },
  amtLabel: { fontSize: 10, fontFamily: "Tajawal_400Regular", marginBottom: 2 },
  amtVal: { fontSize: 14, fontFamily: "Tajawal_700Bold" },
  amtSep: { width: 1, height: 24 },
  paymentChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  paymentText: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
});
