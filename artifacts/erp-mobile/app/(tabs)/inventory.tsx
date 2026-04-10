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

interface Product {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number | null;
  created_at: string;
}

function ProductCard({ item }: { item: Product }) {
  const c = useColors();
  const isLow = item.low_stock_threshold != null && item.quantity <= item.low_stock_threshold;
  const isOut = item.quantity <= 0;

  const stockColor = isOut ? colors.light.destructive : isLow ? colors.light.warning : colors.light.success;
  const stockLabel = isOut ? "نفذ المخزون" : isLow ? "مخزون منخفض" : "متاح";

  return (
    <View style={[styles.card, { backgroundColor: c.card, shadowColor: c.shadow }]}>
      <View style={styles.cardTop}>
        <View style={[styles.stockBadge, { backgroundColor: stockColor + "18" }]}>
          <Text style={[styles.stockText, { color: stockColor }]}>{stockLabel}</Text>
        </View>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>{item.name}</Text>
      </View>
      {item.sku || item.category ? (
        <View style={styles.metaRow}>
          {item.category ? <Text style={[styles.meta, { color: c.mutedForeground }]}>{item.category}</Text> : null}
          {item.sku ? <Text style={[styles.sku, { color: c.mutedForeground }]}>#{item.sku}</Text> : null}
        </View>
      ) : null}
      <View style={styles.pricesRow}>
        <View style={styles.priceCol}>
          <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>سعر البيع</Text>
          <Text style={[styles.price, { color: c.primary }]}>{formatCurrency(item.sale_price)} ج.م</Text>
        </View>
        <View style={[styles.qtyBox, { backgroundColor: stockColor + "18" }]}>
          <Text style={[styles.qtyNum, { color: stockColor }]}>{item.quantity}</Text>
          <Text style={[styles.qtyLabel, { color: stockColor }]}>وحدة</Text>
        </View>
      </View>
    </View>
  );
}

export default function InventoryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch<Product[]>("/api/products"),
    staleTime: 30_000,
  });

  const filtered = (data || []).filter((p) => {
    const matchSearch = !search || p.name.includes(search) || (p.sku || "").includes(search);
    const matchFilter =
      filter === "all" ||
      (filter === "low" && p.low_stock_threshold != null && p.quantity <= p.low_stock_threshold) ||
      (filter === "out" && p.quantity <= 0);
    return matchSearch && matchFilter;
  });

  const lowCount = (data || []).filter((p) => p.low_stock_threshold != null && p.quantity <= p.low_stock_threshold).length;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.headerTitle}>المخزون</Text>
        <Text style={styles.headerSub}>{data?.length || 0} منتج {lowCount > 0 ? `• ${lowCount} منخفض` : ""}</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={18} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث بالاسم أو الكود..."
          placeholderTextColor={c.mutedForeground}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      <View style={styles.filters}>
        {(["all", "low", "out"] as const).map((f) => (
          <View
            key={f}
            style={[styles.filterChip, {
              backgroundColor: filter === f ? c.primary : c.card,
              borderColor: filter === f ? c.primary : c.border,
            }]}
          >
            <Text
              style={[styles.filterText, { color: filter === f ? "#fff" : c.mutedForeground }]}
              onPress={() => setFilter(f)}
            >
              {f === "all" ? "الكل" : f === "low" ? "منخفض" : "نفذ"}
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
          renderItem={({ item }) => <ProductCard item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }, !filtered.length && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
          scrollEnabled={filtered.length > 0}
          ListEmptyComponent={<EmptyState icon="package" title="لا توجد منتجات" subtitle="لم يتم إضافة أي منتجات بعد" />}
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
    borderRadius: 16, padding: 16,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  cardTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1, marginRight: 8 },
  stockBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  stockText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  metaRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 12 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sku: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pricesRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  priceCol: { alignItems: "flex-end" },
  priceLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  price: { fontSize: 16, fontFamily: "Inter_700Bold" },
  qtyBox: { borderRadius: 12, padding: 12, alignItems: "center", minWidth: 60 },
  qtyNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  qtyLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
