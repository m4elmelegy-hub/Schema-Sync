import { Feather } from "@expo/vector-icons";
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

interface Transaction {
  id: number;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface Expense {
  id: number;
  description: string;
  amount: number;
  created_at: string;
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: c.card, shadowColor: c.shadow }]}>
        {children}
      </View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  value,
  color,
  onPress,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  color?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      style={[styles.menuItem, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Feather name="chevron-left" size={18} color={c.mutedForeground} />
      {value ? <Text style={[styles.menuValue, { color: color || c.primary }]}>{value}</Text> : null}
      <Text style={[styles.menuLabel, { color: c.text }]}>{label}</Text>
      <View style={[styles.menuIcon, { backgroundColor: (color || c.primary) + "18" }]}>
        <Feather name={icon} size={18} color={color || c.primary} />
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

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
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
        <Text style={styles.headerTitle}>المزيد</Text>
        <Text style={styles.headerSub}>إدارة النظام</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.profileCard, { backgroundColor: c.primary }]}>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileRole}>
              {user?.role === "super_admin" ? "مدير النظام" : user?.role === "admin" ? "مدير" : "مستخدم"}
            </Text>
            <Text style={styles.profileUsername}>@{user?.username}</Text>
          </View>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{user?.name?.charAt(0) || "U"}</Text>
          </View>
        </View>

        <MenuSection title="الخزينة">
          {txLoading ? (
            <ActivityIndicator color={c.primary} style={{ margin: 16 }} />
          ) : (
            <>
              <MenuItem icon="trending-up" label="إجمالي الواردات" value={`${formatCurrency(totalIn)} ج.م`} color="#16A34A" />
              <MenuItem icon="trending-down" label="إجمالي المصروفات" value={`${formatCurrency(totalOut)} ج.م`} color="#DC2626" />
              <MenuItem icon="dollar-sign" label="الرصيد النقدي" value={`${formatCurrency(cashBalance)} ج.م`} color={cashBalance >= 0 ? "#16A34A" : "#DC2626"} last />
            </>
          )}
        </MenuSection>

        <MenuSection title="المصروفات">
          <MenuItem icon="credit-card" label="إجمالي المصروفات" value={`${formatCurrency(totalExpenses)} ج.م`} color="#D97706" last />
        </MenuSection>

        <MenuSection title="النظام">
          <MenuItem icon="bar-chart-2" label="التقارير" onPress={() => {}} />
          <MenuItem icon="shopping-bag" label="المشتريات" onPress={() => {}} />
          <MenuItem icon="file-text" label="الفواتير" onPress={() => {}} last />
        </MenuSection>

        <MenuSection title="الحساب">
          <MenuItem icon="log-out" label="تسجيل الخروج" color="#DC2626" onPress={handleLogout} last />
        </MenuSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 16, paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 2 },
  content: { padding: 16, gap: 4 },
  profileCard: {
    borderRadius: 18, padding: 20, flexDirection: "row-reverse",
    alignItems: "center", justifyContent: "space-between", marginBottom: 8,
  },
  profileInfo: { alignItems: "flex-end" },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "right" },
  profileRole: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "Inter_500Medium", marginTop: 2 },
  profileUsername: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", marginTop: 2 },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center", alignItems: "center",
  },
  profileAvatarText: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "right", marginBottom: 6, marginRight: 4 },
  sectionCard: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row-reverse", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16, gap: 12,
  },
  menuIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "right" },
  menuValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
