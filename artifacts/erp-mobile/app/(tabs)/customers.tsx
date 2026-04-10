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
import { useColors } from "@/hooks/useColors";
import { apiFetch, formatCurrency } from "@/lib/api";

const AMBER = "#F59E0B";

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  customer_code: number | null;
}

function CustomerCard({ item }: { item: Customer }) {
  const c = useColors();
  const isDebt = item.balance < 0;
  const isCredit = item.balance > 0;
  const balColor = isDebt ? "#EF4444" : isCredit ? "#10B981" : c.mutedForeground;
  const balLabel = isDebt ? "مديون" : isCredit ? "دائن" : "متوازن";
  const initial = item.name.charAt(0);

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <View style={styles.row}>
        {/* رصيد */}
        <View style={[styles.balanceBox, { backgroundColor: balColor + "18", borderColor: balColor + "30" }]}>
          <Text style={[styles.balLabel, { color: balColor }]}>{balLabel}</Text>
          <Text style={[styles.balValue, { color: balColor }]}>{formatCurrency(Math.abs(item.balance))}</Text>
          <Text style={[styles.balCurrency, { color: balColor }]}>ج.م</Text>
        </View>

        {/* البيانات */}
        <View style={styles.info}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
          {item.phone ? (
            <View style={styles.phoneRow}>
              <Text style={[styles.phone, { color: c.mutedForeground }]}>{item.phone}</Text>
              <Feather name="phone" size={12} color={c.mutedForeground} />
            </View>
          ) : null}
          {item.customer_code ? (
            <Text style={[styles.code, { color: AMBER }]}>#{item.customer_code}</Text>
          ) : null}
        </View>

        {/* الأفاتار */}
        <View style={[styles.avatar, { backgroundColor: AMBER + "18", borderColor: AMBER + "30" }]}>
          <Text style={[styles.avatarText, { color: AMBER }]}>{initial}</Text>
        </View>
      </View>
    </View>
  );
}

export default function CustomersScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "debt" | "credit">("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiFetch<Customer[]>("/api/customers"),
    staleTime: 30_000,
  });

  const filtered = (data || []).filter((cu) => {
    const matchSearch = !search || cu.name.includes(search) || (cu.phone || "").includes(search);
    const matchFilter =
      filter === "all" || (filter === "debt" && cu.balance < 0) || (filter === "credit" && cu.balance > 0);
    return matchSearch && matchFilter;
  });

  const totalDebt = (data || []).reduce((acc, cu) => acc + (cu.balance < 0 ? Math.abs(cu.balance) : 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={styles.headerLine} />
        <Text style={styles.headerTitle}>العملاء</Text>
        <Text style={styles.headerSub}>
          {data?.length || 0} عميل
          {totalDebt > 0 ? ` • ديون: ${formatCurrency(totalDebt)} ج.م` : ""}
        </Text>
      </View>

      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث بالاسم أو الهاتف..."
          placeholderTextColor={c.mutedForeground}
          value={search} onChangeText={setSearch} textAlign="right"
        />
      </View>

      <View style={styles.filters}>
        {(["all", "debt", "credit"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, { backgroundColor: filter === f ? AMBER : c.card, borderColor: filter === f ? AMBER : c.border }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, { color: filter === f ? "#0a0500" : c.mutedForeground }]}>
              {f === "all" ? "الكل" : f === "debt" ? "مديونون" : "دائنون"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <CustomerCard item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }, !filtered.length && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={AMBER} />}
          ListEmptyComponent={
            <EmptyState
              icon="users" title="لا يوجد عملاء"
              subtitle="أضف أول عميل الآن"
              actionLabel="إضافة عميل"
              onAction={() => router.push("/new-customer")}
            />
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: isWeb ? 34 : insets.bottom + 80 }]}
        onPress={() => router.push("/new-customer")}
        activeOpacity={0.85}
      >
        <Feather name="user-plus" size={22} color="#0a0500" />
      </TouchableOpacity>
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
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Tajawal_400Regular" },
  filters: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 7 },
  chipText: { fontSize: 13, fontFamily: "Tajawal_500Medium" },
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },
  fab: {
    position: "absolute", right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: AMBER, justifyContent: "center", alignItems: "center",
    shadowColor: AMBER, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: "center", alignItems: "center", borderWidth: 1,
  },
  avatarText: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  info: { flex: 1, alignItems: "flex-end" },
  name: { fontSize: 15, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  phoneRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 3 },
  phone: { fontSize: 13, fontFamily: "Tajawal_400Regular" },
  code: { fontSize: 12, fontFamily: "Tajawal_700Bold", marginTop: 2 },
  balanceBox: {
    borderRadius: 12, padding: 10, alignItems: "center", minWidth: 80, borderWidth: 1,
  },
  balLabel: { fontSize: 10, fontFamily: "Tajawal_700Bold", marginBottom: 2 },
  balValue: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  balCurrency: { fontSize: 10, fontFamily: "Tajawal_400Regular" },
});
