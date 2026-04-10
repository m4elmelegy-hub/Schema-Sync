import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const AMBER = "#F59E0B";

interface DashboardStats {
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  totalIncome: number;
  netProfit: number;
  customersCount: number;
  productsCount: number;
  lowStockCount: number;
  pendingSales: number;
}

export default function DashboardScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, logout } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch<DashboardStats>("/api/dashboard/stats"),
    staleTime: 30_000,
  });

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const isProfit = (data?.netProfit || 0) >= 0;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* ── الهيدر ── */}
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        {/* خط ذهبي أعلى الهيدر */}
        <View style={styles.headerGoldLine} />

        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Feather name="log-out" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.greeting}>مرحباً، {user?.name?.split(" ")[0]} 👋</Text>
            <Text style={styles.subGreeting}>نظام Halal Tech ERP</Text>
          </View>
        </View>

        {data && (
          <View style={[styles.profitBanner, { borderColor: isProfit ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)" }]}>
            <View style={styles.profitLeft}>
              <Feather
                name={isProfit ? "trending-up" : "trending-down"}
                size={20}
                color={isProfit ? "#10B981" : "#EF4444"}
              />
              <Text style={[styles.profitValue, { color: isProfit ? "#10B981" : "#EF4444" }]}>
                {formatCurrency(data.netProfit)} ج.م
              </Text>
            </View>
            <Text style={styles.profitLabel}>صافي الربح</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={AMBER} />}
      >
        {isLoading ? (
          <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 48 }} />
        ) : data ? (
          <>
            <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>إجمالي العمليات</Text>
            <View style={styles.grid}>
              <StatCard title="المبيعات" value={formatCurrency(data.totalSales)} icon="shopping-cart" color={AMBER} trend="up" />
              <StatCard title="المشتريات" value={formatCurrency(data.totalPurchases)} icon="package" color="#7C3AED" />
            </View>
            <View style={styles.grid}>
              <StatCard title="المصروفات" value={formatCurrency(data.totalExpenses)} icon="trending-down" color="#EF4444" trend="down" />
              <StatCard title="الإيرادات" value={formatCurrency(data.totalIncome)} icon="trending-up" color="#10B981" trend="up" />
            </View>

            <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>نظرة عامة</Text>
            <View style={styles.grid}>
              <StatCard title="العملاء" value={String(data.customersCount || 0)} icon="users" color="#06B6D4" />
              <StatCard title="المنتجات" value={String(data.productsCount || 0)} icon="box" color="#8B5CF6" />
            </View>
            <View style={styles.grid}>
              <StatCard
                title="مخزون منخفض"
                value={String(data.lowStockCount || 0)}
                icon="alert-triangle"
                color={data.lowStockCount > 0 ? "#EF4444" : "#10B981"}
              />
              <StatCard title="مبيعات معلقة" value={String(data.pendingSales || 0)} icon="clock" color={AMBER} />
            </View>

            {/* إجراءات سريعة */}
            {/* FEATURE 8: تنبيه المخزون المنخفض */}
            {data.lowStockCount > 0 && (
              <TouchableOpacity
                style={[styles.lowStockBanner, { backgroundColor: "#EF4444" + "12", borderColor: "#EF4444" + "40" }]}
                onPress={() => router.push("/(tabs)/inventory")}
                activeOpacity={0.8}
              >
                <Feather name="chevron-left" size={18} color="#EF4444" />
                <View style={styles.lowStockInfo}>
                  <Text style={styles.lowStockTitle}>تحذير: مخزون منخفض</Text>
                  <Text style={styles.lowStockSub}>{data.lowStockCount} منتج يحتاج إعادة تخزين</Text>
                </View>
                <View style={[styles.lowStockIcon, { backgroundColor: "#EF4444" + "20" }]}>
                  <Feather name="alert-triangle" size={22} color="#EF4444" />
                </View>
              </TouchableOpacity>
            )}

            <View style={[styles.quickCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <View style={styles.quickCardHeader}>
                <View style={[styles.quickDot, { backgroundColor: AMBER }]} />
                <Text style={[styles.quickTitle, { color: c.text }]}>إجراءات سريعة</Text>
              </View>
              <View style={styles.actionsRow}>
                {[
                  { icon: "shopping-cart" as const, label: "المبيعات", route: "/(tabs)/sales", color: AMBER },
                  { icon: "package" as const, label: "المخزون", route: "/(tabs)/inventory", color: "#8B5CF6" },
                  { icon: "users" as const, label: "العملاء", route: "/(tabs)/customers", color: "#06B6D4" },
                  { icon: "more-horizontal" as const, label: "المزيد", route: "/(tabs)/more", color: "#10B981" },
                ].map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={styles.actionItem}
                    onPress={() => router.push(a.route as any)}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: a.color + "1A" }]}>
                      <Feather name={a.icon} size={22} color={a.color} />
                    </View>
                    <Text style={[styles.actionLabel, { color: c.text }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 20, paddingHorizontal: 20, position: "relative" },
  headerGoldLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: "#F59E0B" },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerTextWrap: { alignItems: "flex-end" },
  greeting: { fontSize: 20, fontFamily: "Tajawal_700Bold", color: "#F0F7FF", textAlign: "right" },
  subGreeting: { fontSize: 12, color: "#F59E0B", fontFamily: "Tajawal_400Regular", marginTop: 2 },
  logoutBtn: { padding: 8 },
  profitBanner: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  profitLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  profitValue: { fontSize: 22, fontFamily: "Tajawal_700Bold" },
  profitLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "Tajawal_400Regular" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginTop: 8, marginBottom: 2 },
  grid: { flexDirection: "row-reverse", gap: 12 },
  quickCard: {
    borderRadius: 20, padding: 20, marginTop: 8,
    borderWidth: 1,
  },
  quickCardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 16 },
  quickDot: { width: 4, height: 18, borderRadius: 2 },
  quickTitle: { fontSize: 16, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  actionsRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  actionItem: { alignItems: "center", gap: 8 },
  actionIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  actionLabel: { fontSize: 12, fontFamily: "Tajawal_400Regular" },
  lowStockBanner: {
    borderRadius: 14, borderWidth: 1,
    flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14,
  },
  lowStockIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  lowStockInfo: { flex: 1, alignItems: "flex-end" },
  lowStockTitle: { fontSize: 14, fontFamily: "Tajawal_700Bold", color: "#EF4444", textAlign: "right" },
  lowStockSub: { fontSize: 12, fontFamily: "Tajawal_400Regular", color: "#EF4444", textAlign: "right", marginTop: 2, opacity: 0.8 },
});
