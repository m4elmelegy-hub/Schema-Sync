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
import colors from "@/constants/colors";

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
  todaySales?: number;
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

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Feather name="log-out" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>مرحباً، {user?.name?.split(" ")[0]} 👋</Text>
            <Text style={styles.subtitle}>لوحة التحكم الرئيسية</Text>
          </View>
        </View>

        {data && (
          <View style={styles.profitBanner}>
            <Text style={styles.profitLabel}>صافي الربح</Text>
            <Text style={[styles.profitValue, { color: data.netProfit >= 0 ? "#4ADE80" : "#F87171" }]}>
              {formatCurrency(data.netProfit)} ج.م
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
      >
        {isLoading ? (
          <ActivityIndicator color={c.primary} size="large" style={{ marginTop: 40 }} />
        ) : data ? (
          <>
            <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>إجمالي العمليات</Text>
            <View style={styles.grid}>
              <StatCard title="المبيعات" value={`${formatCurrency(data.totalSales)}`} icon="shopping-cart" color={colors.light.primary} trend="up" />
              <StatCard title="المشتريات" value={`${formatCurrency(data.totalPurchases)}`} icon="package" color={colors.light.warning} />
            </View>
            <View style={styles.grid}>
              <StatCard title="المصروفات" value={`${formatCurrency(data.totalExpenses)}`} icon="trending-down" color={colors.light.destructive} trend="down" />
              <StatCard title="الإيرادات" value={`${formatCurrency(data.totalIncome)}`} icon="trending-up" color={colors.light.success} trend="up" />
            </View>

            <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>نظرة عامة</Text>
            <View style={styles.grid}>
              <StatCard title="العملاء" value={String(data.customersCount || 0)} icon="users" color="#8B5CF6" />
              <StatCard title="المنتجات" value={String(data.productsCount || 0)} icon="box" color="#06B6D4" />
            </View>
            <View style={styles.grid}>
              <StatCard title="مخزون منخفض" value={String(data.lowStockCount || 0)} icon="alert-triangle" color={data.lowStockCount > 0 ? colors.light.destructive : colors.light.success} />
              <StatCard title="مبيعات معلقة" value={String(data.pendingSales || 0)} icon="clock" color={colors.light.warning} />
            </View>

            <View style={[styles.quickActions, { backgroundColor: c.card, shadowColor: c.shadow }]}>
              <Text style={[styles.quickTitle, { color: c.text }]}>إجراءات سريعة</Text>
              <View style={styles.actionsRow}>
                {[
                  { icon: "shopping-cart" as const, label: "المبيعات", route: "/(tabs)/sales" },
                  { icon: "package" as const, label: "المخزون", route: "/(tabs)/inventory" },
                  { icon: "users" as const, label: "العملاء", route: "/(tabs)/customers" },
                  { icon: "more-horizontal" as const, label: "المزيد", route: "/(tabs)/more" },
                ].map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={styles.actionItem}
                    onPress={() => router.push(a.route as any)}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: c.primary + "18" }]}>
                      <Feather name={a.icon} size={22} color={c.primary} />
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
  header: { paddingBottom: 20, paddingHorizontal: 20 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerText: { alignItems: "flex-end" },
  greeting: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", marginTop: 2 },
  logoutBtn: { padding: 8 },
  profitBanner: {
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14,
    padding: 16, alignItems: "flex-end",
  },
  profitLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "Inter_400Regular", marginBottom: 4 },
  profitValue: { fontSize: 26, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", marginTop: 8, marginBottom: 4 },
  grid: { flexDirection: "row-reverse", gap: 12 },
  quickActions: {
    borderRadius: 16, padding: 20, marginTop: 8,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3,
  },
  quickTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "right", marginBottom: 16 },
  actionsRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  actionItem: { alignItems: "center", gap: 8 },
  actionIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  actionLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
