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

interface Product {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  cost_price: number;
  sale_price: number;
  low_stock_threshold: number | null;
}

function ProductCard({ item }: { item: Product }) {
  const c = useColors();
  const isOut = item.quantity <= 0;
  const isLow = !isOut && item.low_stock_threshold != null && item.quantity <= item.low_stock_threshold;
  const stockColor = isOut ? "#EF4444" : isLow ? AMBER : "#10B981";
  const stockLabel = isOut ? "نفذ" : isLow ? "منخفض" : "متاح";

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}
      onPress={() => router.push({ pathname: "/product-details", params: { id: String(item.id) } })}
      activeOpacity={0.8}
    >
      <View style={[styles.cardLeft, { backgroundColor: stockColor + "18" }]}>
        <Text style={[styles.qtyNum, { color: stockColor }]}>{item.quantity}</Text>
        <Text style={[styles.qtyUnit, { color: stockColor }]}>وحدة</Text>
        <View style={[styles.stockBadge, { backgroundColor: stockColor + "30" }]}>
          <Text style={[styles.stockBadgeText, { color: stockColor }]}>{stockLabel}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>{item.name}</Text>
        <View style={styles.metaRow}>
          {item.category ? <Text style={[styles.meta, { color: c.mutedForeground, backgroundColor: c.muted }]}>{item.category}</Text> : null}
          {item.sku ? <Text style={[styles.sku, { color: c.mutedForeground }]}>#{item.sku}</Text> : null}
        </View>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: AMBER }]}>{formatCurrency(item.sale_price)} ج.م</Text>
          <Text style={[styles.priceLabel, { color: c.mutedForeground }]}>سعر البيع</Text>
        </View>
      </View>
    </TouchableOpacity>
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
      (filter === "low" && p.low_stock_threshold != null && p.quantity > 0 && p.quantity <= p.low_stock_threshold) ||
      (filter === "out" && p.quantity <= 0);
    return matchSearch && matchFilter;
  });

  const lowCount = (data || []).filter((p) => p.low_stock_threshold != null && p.quantity <= p.low_stock_threshold).length;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={styles.headerLine} />
        <Text style={styles.headerTitle}>المخزون</Text>
        <Text style={styles.headerSub}>
          {data?.length || 0} منتج {lowCount > 0 ? `• ${lowCount} يحتاج تجديد` : ""}
        </Text>
      </View>

      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={16} color={c.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="بحث بالاسم أو الكود..."
          placeholderTextColor={c.mutedForeground}
          value={search} onChangeText={setSearch} textAlign="right"
        />
      </View>

      <View style={styles.filters}>
        {(["all", "low", "out"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, {
              backgroundColor: filter === f ? AMBER : c.card,
              borderColor: filter === f ? AMBER : c.border,
            }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, { color: filter === f ? "#0a0500" : c.mutedForeground }]}>
              {f === "all" ? "الكل" : f === "low" ? "منخفض" : "نفذ"}
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
          renderItem={({ item }) => <ProductCard item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }, !filtered.length && styles.emptyList]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={AMBER} />}
          ListEmptyComponent={
            <EmptyState
              icon="package" title="لا توجد منتجات"
              subtitle="أضف أول منتج الآن"
              actionLabel="إضافة منتج"
              onAction={() => router.push("/new-product")}
            />
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: isWeb ? 34 : insets.bottom + 80 }]}
        onPress={() => router.push("/new-product")}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={26} color="#0a0500" />
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
  card: {
    borderRadius: 16, borderWidth: 1,
    flexDirection: "row-reverse", overflow: "hidden",
  },
  cardLeft: {
    width: 80, padding: 12, alignItems: "center", justifyContent: "center", gap: 4,
  },
  qtyNum: { fontSize: 24, fontFamily: "Tajawal_700Bold" },
  qtyUnit: { fontSize: 11, fontFamily: "Tajawal_400Regular" },
  stockBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, marginTop: 4 },
  stockBadgeText: { fontSize: 10, fontFamily: "Tajawal_700Bold" },
  cardRight: { flex: 1, padding: 14, alignItems: "flex-end" },
  name: { fontSize: 15, fontFamily: "Tajawal_700Bold", textAlign: "right", marginBottom: 6 },
  metaRow: { flexDirection: "row-reverse", gap: 6, marginBottom: 8 },
  meta: { fontSize: 11, fontFamily: "Tajawal_400Regular", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sku: { fontSize: 11, fontFamily: "Tajawal_400Regular", paddingVertical: 3 },
  priceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  priceLabel: { fontSize: 11, fontFamily: "Tajawal_400Regular" },
  price: { fontSize: 16, fontFamily: "Tajawal_700Bold" },
});
