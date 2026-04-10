import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ModalHeader } from "@/components/ModalHeader";
import { useColors } from "@/hooks/useColors";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

const AMBER = "#F59E0B";
const SCREEN_W = Dimensions.get("window").width;

interface ProfitLossReport {
  from: string;
  to: string;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  totalIncome: number;
  grossProfit: number;
  netProfit: number;
  topProducts?: { name: string; quantity: number; revenue: number }[];
}

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

type Period = "today" | "week" | "month" | "custom";

function getPeriodDates(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from = to;

  if (period === "today") {
    from = to;
  } else if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().split("T")[0];
  } else if (period === "month") {
    const d = new Date(now);
    d.setDate(1);
    from = d.toISOString().split("T")[0];
  }

  return { from, to };
}

function StatBox({ label, value, color, icon }: { label: string; value: string; color: string; icon: keyof typeof Feather.glyphMap }) {
  const c = useColors();
  return (
    <View style={[styles.statBox, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <View style={[styles.statLine, { backgroundColor: color }]} />
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function SimpleBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function ReportsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const [period, setPeriod] = useState<Period>("month");

  const { from, to } = getPeriodDates(period);

  const { data: report, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["report", period],
    queryFn: () => apiFetch<ProfitLossReport>(`/api/reports/profit-loss?from=${from}&to=${to}`),
    staleTime: 60_000,
    retry: 1,
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch<DashboardStats>("/api/dashboard/stats"),
    staleTime: 60_000,
  });

  const periods: { key: Period; label: string }[] = [
    { key: "today", label: "اليوم" },
    { key: "week", label: "7 أيام" },
    { key: "month", label: "الشهر" },
  ];

  const maxAmount = Math.max(
    report?.totalSales || 0,
    report?.totalPurchases || 0,
    report?.totalExpenses || 0,
    1
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={[styles.headerLine, { backgroundColor: "#06B6D4" }]} />
        <Text style={[styles.headerTitle, { color: c.text }]}>التقارير</Text>
        <Text style={[styles.headerSub, { color: "#06B6D4" }]}>Halal Tech ERP</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#06B6D4" />}
      >
        {/* فلاتر الفترة */}
        <View style={styles.periodRow}>
          {periods.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodChip, {
                backgroundColor: period === p.key ? "#06B6D4" : c.card,
                borderColor: period === p.key ? "#06B6D4" : c.border,
              }]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodText, { color: period === p.key ? "#fff" : c.mutedForeground }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.dateRange, { color: c.mutedForeground }]}>
          {formatDate(from)} — {formatDate(to)}
        </Text>

        {isLoading ? (
          <ActivityIndicator color="#06B6D4" size="large" style={{ marginTop: 48 }} />
        ) : report ? (
          <>
            {/* صافي الربح */}
            <View style={[styles.netProfitCard, {
              backgroundColor: c.card,
              borderColor: (report.netProfit >= 0 ? "#10B981" : "#EF4444") + "40",
            }]}>
              <View style={[styles.npLine, { backgroundColor: report.netProfit >= 0 ? "#10B981" : "#EF4444" }]} />
              <View style={styles.npRow}>
                <Feather
                  name={report.netProfit >= 0 ? "trending-up" : "trending-down"}
                  size={28}
                  color={report.netProfit >= 0 ? "#10B981" : "#EF4444"}
                />
                <View style={styles.npInfo}>
                  <Text style={[styles.npLabel, { color: c.mutedForeground }]}>صافي الربح</Text>
                  <Text style={[styles.npValue, { color: report.netProfit >= 0 ? "#10B981" : "#EF4444" }]}>
                    {report.netProfit >= 0 ? "+" : ""}{formatCurrency(report.netProfit)} ج.م
                  </Text>
                </View>
              </View>
            </View>

            {/* الإحصائيات */}
            <View style={styles.statsGrid}>
              <StatBox label="المبيعات" value={`${formatCurrency(report.totalSales)} ج.م`} color={AMBER} icon="shopping-cart" />
              <StatBox label="المشتريات" value={`${formatCurrency(report.totalPurchases)} ج.م`} color="#7C3AED" icon="package" />
              <StatBox label="المصروفات" value={`${formatCurrency(report.totalExpenses)} ج.م`} color="#EF4444" icon="trending-down" />
              <StatBox label="الإيرادات" value={`${formatCurrency(report.totalIncome)} ج.م`} color="#10B981" icon="trending-up" />
            </View>

            {/* مقارنة بيانية بسيطة */}
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <View style={[styles.cardLine, { backgroundColor: "#06B6D4" }]} />
              <Text style={[styles.cardTitle, { color: c.mutedForeground }]}>مقارنة المؤشرات</Text>

              {[
                { label: "المبيعات", value: report.totalSales, color: AMBER },
                { label: "المشتريات", value: report.totalPurchases, color: "#7C3AED" },
                { label: "المصروفات", value: report.totalExpenses, color: "#EF4444" },
                { label: "الإيرادات", value: report.totalIncome, color: "#10B981" },
              ].map((item) => (
                <View key={item.label} style={styles.barRow}>
                  <Text style={[styles.barValue, { color: item.color }]}>{formatCurrency(item.value)}</Text>
                  <SimpleBar value={item.value} max={maxAmount} color={item.color} />
                  <Text style={[styles.barLabel, { color: c.mutedForeground }]}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* أفضل المنتجات */}
            {(report.topProducts || []).length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>أفضل المنتجات مبيعاً</Text>
                <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                  {(report.topProducts || []).map((p, idx, arr) => (
                    <View
                      key={p.name}
                      style={[styles.productRow, idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
                    >
                      <View style={[styles.rankBadge, { backgroundColor: AMBER + "18" }]}>
                        <Text style={[styles.rankText, { color: AMBER }]}>{idx + 1}</Text>
                      </View>
                      <Text style={[styles.productRevenue, { color: AMBER }]}>{formatCurrency(p.revenue)} ج.م</Text>
                      <Text style={[styles.productQty, { color: c.mutedForeground }]}>{p.quantity} وحدة</Text>
                      <Text style={[styles.productName, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        ) : (
          /* fallback: إحصائيات لوحة التحكم */
          stats && (
            <>
              <Text style={[styles.dateRange, { color: c.mutedForeground, marginTop: 0 }]}>إجمالي الفترة</Text>
              <View style={styles.statsGrid}>
                <StatBox label="المبيعات" value={`${formatCurrency(stats.totalSales)} ج.م`} color={AMBER} icon="shopping-cart" />
                <StatBox label="المشتريات" value={`${formatCurrency(stats.totalPurchases)} ج.م`} color="#7C3AED" icon="package" />
                <StatBox label="المصروفات" value={`${formatCurrency(stats.totalExpenses)} ج.م`} color="#EF4444" icon="trending-down" />
                <StatBox label="صافي الربح" value={`${formatCurrency(stats.netProfit)} ج.م`} color="#10B981" icon="trending-up" />
              </View>
            </>
          )
        )}

        {/* إحصائيات عامة */}
        {stats && (
          <>
            <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>نظرة عامة</Text>
            <View style={styles.statsGrid}>
              <StatBox label="العملاء" value={String(stats.customersCount)} color="#06B6D4" icon="users" />
              <StatBox label="المنتجات" value={String(stats.productsCount)} color="#8B5CF6" icon="box" />
              <StatBox label="مخزون منخفض" value={String(stats.lowStockCount)} color={stats.lowStockCount > 0 ? "#EF4444" : "#10B981"} icon="alert-triangle" />
              <StatBox label="مبيعات معلقة" value={String(stats.pendingSales)} color={AMBER} icon="clock" />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 20, position: "relative" },
  headerLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  headerTitle: { fontSize: 22, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "right", marginTop: 2 },
  content: { padding: 16, gap: 12 },
  periodRow: { flexDirection: "row-reverse", gap: 10, justifyContent: "center" },
  periodChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 9 },
  periodText: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  dateRange: { fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "center", marginTop: -4, marginBottom: 4 },
  netProfitCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  npLine: { height: 2 },
  npRow: { flexDirection: "row-reverse", alignItems: "center", gap: 16, padding: 20 },
  npInfo: { flex: 1, alignItems: "flex-end" },
  npLabel: { fontSize: 13, fontFamily: "Tajawal_400Regular" },
  npValue: { fontSize: 26, fontFamily: "Tajawal_800ExtraBold" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statBox: { borderRadius: 16, padding: 14, borderWidth: 1, overflow: "hidden", width: (SCREEN_W - 56) / 2, alignItems: "flex-end" },
  statLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  statValue: { fontSize: 15, fontFamily: "Tajawal_700Bold", textAlign: "right", marginBottom: 4 },
  statLabel: { fontSize: 11, fontFamily: "Tajawal_400Regular", textAlign: "right" },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardLine: { height: 2 },
  cardTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", padding: 14, paddingBottom: 10 },
  barRow: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  barLabel: { fontSize: 12, fontFamily: "Tajawal_500Medium", width: 56, textAlign: "right" },
  barBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.08)" },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { fontSize: 12, fontFamily: "Tajawal_700Bold", width: 80, textAlign: "left" },
  sectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right", marginTop: 4 },
  productRow: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  rankText: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
  productName: { flex: 1, fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right" },
  productQty: { fontSize: 11, fontFamily: "Tajawal_400Regular" },
  productRevenue: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
});
