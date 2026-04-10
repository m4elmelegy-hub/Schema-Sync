import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatCurrency } from "@/lib/api";

const AMBER = "#F59E0B";

interface Transaction { id: number; type: string; amount: number; }
interface Expense { id: number; amount: number; }

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionDot, { backgroundColor: AMBER }]} />
        <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>{title}</Text>
      </View>
      <View style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        {children}
      </View>
    </View>
  );
}

function MenuItem({
  icon, label, value, color, onPress, last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  color?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = useColors();
  const itemColor = color || AMBER;
  return (
    <TouchableOpacity
      style={[styles.menuItem, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Feather name="chevron-left" size={16} color={c.mutedForeground} />
      {value ? <Text style={[styles.menuValue, { color: itemColor }]}>{value}</Text> : null}
      <Text style={[styles.menuLabel, { color: c.text }]}>{label}</Text>
      <View style={[styles.menuIcon, { backgroundColor: itemColor + "18" }]}>
        <Feather name={icon} size={16} color={itemColor} />
      </View>
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, logout } = useAuth();

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => apiFetch<Transaction[]>("/api/transactions"),
    staleTime: 60_000,
  });

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => apiFetch<Expense[]>("/api/expenses"),
    staleTime: 60_000,
  });

  const totalIn = (transactions || []).reduce((acc, t) => t.type === "in" ? acc + Number(t.amount) : acc, 0);
  const totalOut = (transactions || []).reduce((acc, t) => t.type === "out" ? acc + Number(t.amount) : acc, 0);
  const cashBalance = totalIn - totalOut;
  const totalExpenses = (expenses || []).reduce((acc, e) => acc + Number(e.amount), 0);

  const roleLabel = user?.role === "super_admin" ? "مدير النظام" : user?.role === "admin" ? "مدير" : "مستخدم";

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من النظام؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={styles.headerLine} />
        <Text style={styles.headerTitle}>المزيد</Text>
        <Text style={styles.headerSub}>Halal Tech ERP</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* بطاقة الملف الشخصي */}
        <View style={[styles.profileCard, { backgroundColor: c.card, borderColor: "rgba(245,158,11,0.25)" }]}>
          <View style={styles.profileTopLine} />
          <View style={styles.profileRow}>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: c.text }]}>{user?.name}</Text>
              <Text style={[styles.profileRole, { color: AMBER }]}>{roleLabel}</Text>
              <Text style={[styles.profileUsername, { color: c.mutedForeground }]}>@{user?.username}</Text>
            </View>
            <View style={styles.logoContainer}>
              <Image
                source={require("@/assets/images/halal-logo.png")}
                style={styles.logoImg}
                contentFit="contain"
              />
            </View>
          </View>
        </View>

        {/* الخزينة */}
        <SectionCard title="الخزينة">
          {txLoading ? (
            <ActivityIndicator color={AMBER} style={{ margin: 16 }} />
          ) : (
            <>
              <MenuItem icon="trending-up" label="إجمالي الواردات" value={`${formatCurrency(totalIn)} ج.م`} color="#10B981" />
              <MenuItem icon="trending-down" label="إجمالي المدفوعات" value={`${formatCurrency(totalOut)} ج.م`} color="#EF4444" />
              <MenuItem icon="dollar-sign" label="الرصيد النقدي" value={`${formatCurrency(cashBalance)} ج.م`} color={cashBalance >= 0 ? "#10B981" : "#EF4444"} last />
            </>
          )}
        </SectionCard>

        {/* المصروفات */}
        <SectionCard title="المصروفات">
          <MenuItem icon="credit-card" label="إجمالي المصروفات" value={`${formatCurrency(totalExpenses)} ج.م`} color={AMBER} last />
        </SectionCard>

        {/* النظام */}
        <SectionCard title="النظام">
          <MenuItem icon="bar-chart-2" label="التقارير" onPress={() => {}} />
          <MenuItem icon="shopping-bag" label="المشتريات" onPress={() => {}} />
          <MenuItem icon="file-text" label="الفواتير" onPress={() => {}} last />
        </SectionCard>

        {/* الحساب */}
        <SectionCard title="الحساب">
          <MenuItem icon="log-out" label="تسجيل الخروج" color="#EF4444" onPress={handleLogout} last />
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 16, paddingHorizontal: 20, position: "relative" },
  headerLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  headerTitle: { fontSize: 22, fontFamily: "Tajawal_700Bold", color: "#F0F7FF", textAlign: "right" },
  headerSub: { fontSize: 12, color: AMBER, fontFamily: "Tajawal_400Regular", textAlign: "right", marginTop: 2 },
  content: { padding: 16, gap: 4 },
  profileCard: {
    borderRadius: 20, borderWidth: 1, overflow: "hidden", marginBottom: 12,
  },
  profileTopLine: { height: 2, backgroundColor: AMBER },
  profileRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 20 },
  profileInfo: { alignItems: "flex-end" },
  profileName: { fontSize: 18, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  profileRole: { fontSize: 13, fontFamily: "Tajawal_500Medium", marginTop: 2 },
  profileUsername: { fontSize: 12, fontFamily: "Tajawal_400Regular", marginTop: 2 },
  logoContainer: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1, borderColor: "rgba(245,158,11,0.2)",
    justifyContent: "center", alignItems: "center",
  },
  logoImg: { width: 40, height: 40 },
  section: { marginBottom: 12 },
  sectionHeaderRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 6, marginRight: 4 },
  sectionDot: { width: 3, height: 14, borderRadius: 2 },
  sectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium", textAlign: "right" },
  sectionCard: {
    borderRadius: 16, borderWidth: 1, overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row-reverse", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16, gap: 12,
  },
  menuIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuLabel: { flex: 1, fontSize: 14, fontFamily: "Tajawal_500Medium", textAlign: "right" },
  menuValue: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
});
