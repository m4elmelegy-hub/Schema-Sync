import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
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
import { useTheme, type ThemeMode } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const AMBER = "#F59E0B";

interface Transaction { id: number; type?: string; direction?: string; amount: number; }
interface Expense { id: number; amount: number; }

function ThemeSwitcher() {
  const c = useColors();
  const { mode, isDark, setMode } = useTheme();

  const options: { key: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "light",  label: "فاتح",   icon: "sun" },
    { key: "system", label: "تلقائي", icon: "smartphone" },
    { key: "dark",   label: "داكن",   icon: "moon" },
  ];

  return (
    <View style={[styles.themeSwitcher, { backgroundColor: c.muted, borderColor: c.border }]}>
      {options.map((opt) => {
        const active = mode === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.themeOption, active && { backgroundColor: isDark ? c.card : "#FFFFFF", shadowColor: AMBER, shadowOpacity: active ? 0.15 : 0, shadowRadius: 6, elevation: active ? 3 : 0 }]}
            onPress={() => setMode(opt.key)}
            activeOpacity={0.7}
          >
            <Feather name={opt.icon} size={16} color={active ? AMBER : c.mutedForeground} />
            <Text style={[styles.themeLabel, { color: active ? AMBER : c.mutedForeground }]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SectionCard({ title, color, children }: { title: string; color?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionDot, { backgroundColor: color || AMBER }]} />
        <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>{title}</Text>
      </View>
      <View style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        {children}
      </View>
    </View>
  );
}

function MenuItem({
  icon, label, value, color, onPress, last, badge,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  color?: string;
  onPress?: () => void;
  last?: boolean;
  badge?: string;
}) {
  const c = useColors();
  const itemColor = color || AMBER;
  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Feather name="chevron-left" size={16} color={c.mutedForeground} />
      {value && <Text style={[styles.menuValue, { color: itemColor }]}>{value}</Text>}
      {badge && (
        <View style={[styles.badge, { backgroundColor: itemColor + "20" }]}>
          <Text style={[styles.badgeText, { color: itemColor }]}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.menuLabel, { color: c.text }]}>{label}</Text>
      <View style={[styles.menuIcon, { backgroundColor: itemColor + "1A" }]}>
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

  const { data: transactions } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => apiFetch<Transaction[]>("/api/transactions"),
    staleTime: 60_000,
  });

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => apiFetch<Expense[]>("/api/expenses"),
    staleTime: 60_000,
  });

  // FIX 6: دعم كلا الحقلين type و direction
  const totalIn = (transactions || [])
    .filter((t) => t.type === "in" || t.direction === "in")
    .reduce((a, t) => a + Number(t.amount), 0);

  const totalOut = (transactions || [])
    .filter((t) => t.type === "out" || t.direction === "out")
    .reduce((a, t) => a + Number(t.amount), 0);

  const cashBalance = totalIn - totalOut;
  const totalExpenses = (expenses || []).reduce((a, e) => a + Number(e.amount), 0);

  const roleLabel =
    user?.role === "super_admin" ? "مدير النظام" :
    user?.role === "admin" ? "مدير" :
    user?.role === "manager" ? "مشرف" :
    user?.role === "salesperson" ? "مندوب مبيعات" :
    "كاشير";

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 67 : insets.top + 12, borderBottomColor: c.border }]}>
        <View style={[styles.headerLine, { backgroundColor: AMBER }]} />
        <Text style={[styles.headerTitle, { color: c.text }]}>المزيد</Text>
        <Text style={[styles.headerSub, { color: AMBER }]}>Halal Tech ERP</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* بروفايل */}
        <View style={[styles.profileCard, { backgroundColor: c.card, borderColor: AMBER + "30" }]}>
          <View style={[styles.profileTopLine, { backgroundColor: AMBER }]} />
          <View style={styles.profileRow}>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: c.text }]}>{user?.name}</Text>
              <View style={[styles.rolePill, { backgroundColor: AMBER + "1A" }]}>
                <Text style={[styles.rolePillText, { color: AMBER }]}>{roleLabel}</Text>
              </View>
              <Text style={[styles.profileUsername, { color: c.mutedForeground }]}>@{user?.username}</Text>
            </View>
            <View style={[styles.logoWrap, { backgroundColor: AMBER + "15", borderColor: AMBER + "25" }]}>
              <Image
                source={require("@/assets/images/halal-logo.png")}
                style={styles.logoImg}
                contentFit="contain"
              />
            </View>
          </View>
        </View>

        {/* مبدّل الثيم */}
        <SectionCard title="مظهر التطبيق" color="#7C3AED">
          <View style={styles.themePad}>
            <Text style={[styles.themeHint, { color: c.mutedForeground }]}>اختر بين الوضع الفاتح والداكن</Text>
            <ThemeSwitcher />
          </View>
        </SectionCard>

        {/* الخزينة */}
        <SectionCard title="الخزينة">
          <MenuItem icon="trending-up"   label="إجمالي الواردات"  value={`${formatCurrency(totalIn)} ج.م`}         color="#10B981" />
          <MenuItem icon="trending-down" label="إجمالي المدفوعات" value={`${formatCurrency(totalOut)} ج.م`}        color="#EF4444" />
          <MenuItem icon="dollar-sign"   label="الرصيد النقدي"    value={`${formatCurrency(cashBalance)} ج.م`}     color={cashBalance >= 0 ? "#10B981" : "#EF4444"} last />
        </SectionCard>

        {/* العمليات */}
        <SectionCard title="العمليات">
          <MenuItem icon="shopping-bag"  label="فواتير المشتريات"  badge="عرض"   onPress={() => router.push("/purchases")}    color="#7C3AED" />
          <MenuItem icon="plus-circle"   label="فاتورة شراء جديدة" badge="جديد" onPress={() => router.push("/new-purchase")}  color="#7C3AED" />
          <MenuItem icon="credit-card"   label="المصروفات"         value={`${formatCurrency(totalExpenses)} ج.م`}  onPress={() => router.push("/expenses")} color={AMBER} />
          <MenuItem icon="bar-chart-2"   label="التقارير"          badge="عرض"   onPress={() => router.push("/reports")}      color="#06B6D4" last />
        </SectionCard>

        {/* الإعدادات */}
        <SectionCard title="الإعدادات" color="#10B981">
          <MenuItem icon="settings" label="إعدادات النظام"   onPress={() => router.push("/settings")} color="#10B981" last />
        </SectionCard>

        {/* الحساب */}
        <SectionCard title="الحساب" color="#EF4444">
          <MenuItem icon="log-out" label="تسجيل الخروج" color="#EF4444" onPress={handleLogout} last />
        </SectionCard>

        <Text style={[styles.version, { color: c.mutedForeground }]}>Halal Tech ERP v1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 20, position: "relative", borderBottomWidth: StyleSheet.hairlineWidth },
  headerLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  headerTitle: { fontSize: 22, fontFamily: "Tajawal_700Bold", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "right", marginTop: 2 },
  content: { padding: 16, gap: 4 },
  profileCard: { borderRadius: 20, borderWidth: 1, overflow: "hidden", marginBottom: 12 },
  profileTopLine: { height: 2 },
  profileRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 18 },
  profileInfo: { alignItems: "flex-end", gap: 6 },
  profileName: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  rolePill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  rolePillText: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
  profileUsername: { fontSize: 12, fontFamily: "Tajawal_400Regular" },
  logoWrap: { width: 56, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  logoImg: { width: 40, height: 40 },
  section: { marginBottom: 12 },
  sectionHeaderRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 6, marginRight: 4 },
  sectionDot: { width: 3, height: 14, borderRadius: 2 },
  sectionTitle: { fontSize: 12, fontFamily: "Tajawal_500Medium" },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  menuItem: {
    flexDirection: "row-reverse", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16, gap: 10,
  },
  menuIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuLabel: { flex: 1, fontSize: 14, fontFamily: "Tajawal_500Medium", textAlign: "right" },
  menuValue: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: "Tajawal_700Bold" },
  themePad: { padding: 14, gap: 10 },
  themeHint: { fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "center" },
  themeSwitcher: {
    flexDirection: "row-reverse",
    borderRadius: 14, borderWidth: 1,
    padding: 4, gap: 4,
  },
  themeOption: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 10, paddingVertical: 10,
  },
  themeLabel: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  version: { fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "center", marginTop: 16 },
});
