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
import { apiFetch, formatCurrency } from "@/lib/api";
import colors from "@/constants/colors";

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  customer_code: number | null;
  created_at: string;
}

function CustomerCard({ item }: { item: Customer }) {
  const c = useColors();
  const isDebt = item.balance < 0;
  const isCredit = item.balance > 0;

  return (
    <View style={[styles.card, { backgroundColor: c.card, shadowColor: c.shadow }]}>
      <View style={styles.row}>
        <View style={[styles.balanceBox, {
          backgroundColor: isDebt ? colors.light.destructive + "18" : isCredit ? colors.light.success + "18" : c.muted,
        }]}>
          <Text style={[styles.balanceLabel, {
            color: isDebt ? colors.light.destructive : isCredit ? colors.light.success : c.mutedForeground,
          }]}>
            {isDebt ? "مديون" : isCredit ? "دائن" : "متوازن"}
          </Text>
          <Text style={[styles.balance, {
            color: isDebt ? colors.light.destructive : isCredit ? colors.light.success : c.mutedForeground,
          }]}>
            {formatCurrency(Math.abs(item.balance))}
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
          {item.phone ? (
            <View style={styles.phoneRow}>
              <Text style={[styles.phone, { color: c.mutedForeground }]}>{item.phone}</Text>
              <Feather name="phone" size={13} color={c.mutedForeground} style={{ marginLeft: 4 }} />
            </View>
          ) : null}
          {item.customer_code ? (
            <Text style={[styles.code, { color: c.mutedForeground }]}>كود: {item.customer_code}</Text>
          ) : null}
        </View>
        <View style={[styles.avatar, { backgroundColor: c.primary + "20" }]}>
          <Text style={[styles.avatarText, { color: c.primary }]}>
            {item.name.charAt(0)}
          </Text>
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

  const filtered = (data || []).filter((c) => {
    const matchSearch = !search || c.name.includes(search) || (c.phone || "").includes(search);
    const matchFilter =
      filter === "all" ||
      (filter === "debt" && c.balance < 0) ||
      (filter === "credit" && c.balance > 0);
    return matchSearch && matchFilter;
  });

  const totalDebt = (data || []).reduce((acc, c) => acc + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.headerTitle}>العملاء</Text>
        <Text style={styles.headerSub}>
          {data?.length || 0} عميل {totalDebt > 0 ? `• ديون: ${formatCurrency(totalDebt)} ج.م` : ""}
        </Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={18} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث بالاسم أو الهاتف..."
          placeholderTextColor={c.mutedForeground}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      <View style={styles.filters}>
        {(["all", "debt", "credit"] as const).map((f) => (
          <View key={f} style={[styles.filterChip, {
            backgroundColor: filter === f ? c.primary : c.card,
            borderColor: filter === f ? c.primary : c.border,
          }]}>
            <Text style={[styles.filterText, { color: filter === f ? "#fff" : c.mutedForeground }]} onPress={() => setFilter(f)}>
              {f === "all" ? "الكل" : f === "debt" ? "مديونون" : "دائنون"}
            </Text>
          </View>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={c.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => <CustomerCard item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }, !filtered.length && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
          scrollEnabled={filtered.length > 0}
          ListEmptyComponent={<EmptyState icon="users" title="لا يوجد عملاء" subtitle="لم يتم إضافة أي عملاء بعد" />}
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
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", marginRight: 8 },
  filters: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 7 },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },
  card: {
    borderRadius: 16, padding: 14,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  info: { flex: 1, alignItems: "flex-end" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  phoneRow: { flexDirection: "row-reverse", alignItems: "center", marginTop: 3 },
  phone: { fontSize: 13, fontFamily: "Inter_400Regular" },
  code: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  balanceBox: { borderRadius: 12, padding: 10, alignItems: "center", minWidth: 80 },
  balanceLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
  balance: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
