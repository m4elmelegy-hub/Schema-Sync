import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ModalHeader } from "@/components/ModalHeader";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatCurrency } from "@/lib/api";

const AMBER = "#F59E0B";

interface Warehouse { id: number; name: string; }
interface Safe { id: number; name: string; balance: string; }
interface SystemUser { id: number; name: string; username: string; role: string; }

const ROLE_OPTIONS = [
  { label: "مدير", value: "admin" },
  { label: "محاسب", value: "accountant" },
  { label: "مشرف", value: "manager" },
  { label: "مندوب مبيعات", value: "salesperson" },
  { label: "كاشير", value: "cashier" },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "مدير النظام",
  admin: "مدير",
  accountant: "محاسب",
  manager: "مشرف",
  salesperson: "مندوب",
  cashier: "كاشير",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "#EF4444",
  admin: AMBER,
  accountant: "#06B6D4",
  manager: "#7C3AED",
  salesperson: "#06B6D4",
  cashier: "#10B981",
};

// ── Add User Modal ─────────────────────────────────────────────────────────────

function AddUserModal({
  visible, onClose, onSubmit, loading,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; username: string; pin: string; role: string }) => void;
  loading: boolean;
}) {
  const c = useColors();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("cashier");

  const reset = () => { setName(""); setUsername(""); setPin(""); setRole("cashier"); };

  const handleClose = () => { reset(); onClose(); };
  const handleSubmit = () => {
    if (!name.trim() || !username.trim() || pin.length < 4) {
      Alert.alert("تنبيه", "يرجى تعبئة جميع الحقول والرقم السري 4 أرقام على الأقل");
      return;
    }
    onSubmit({ name: name.trim(), username: username.trim(), pin, role });
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: "rgba(245,158,11,0.3)" }]}>
            <View style={styles.modalTopLine} />
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleClose}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: c.text }]}>إضافة مستخدم</Text>
            </View>

            {[
              { label: "الاسم الكامل", value: name, set: setName, placeholder: "مثال: أحمد محمد" },
              { label: "اسم المستخدم", value: username, set: setUsername, placeholder: "مثال: ahmed" },
              { label: "الرقم السري (4+ أرقام)", value: pin, set: setPin, placeholder: "••••••", numeric: true },
            ].map((f) => (
              <View key={f.label} style={{ marginBottom: 12 }}>
                <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>{f.label}</Text>
                <View style={[styles.fieldInput, { backgroundColor: c.background, borderColor: c.border }]}>
                  <TextInput
                    style={[styles.fieldText, { color: c.text }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={c.mutedForeground}
                    value={f.value}
                    onChangeText={f.set}
                    keyboardType={f.numeric ? "numeric" : "default"}
                    secureTextEntry={f.label.includes("السري")}
                    textAlign="right"
                  />
                </View>
              </View>
            ))}

            {/* FIX 4: Role Dropdown */}
            <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>الدور</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={styles.roleRow}>
                {ROLE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.roleChip,
                      {
                        backgroundColor: role === opt.value ? AMBER : c.background,
                        borderColor: role === opt.value ? AMBER : c.border,
                      },
                    ]}
                    onPress={() => setRole(opt.value)}
                  >
                    <Text style={[styles.roleChipText, { color: role === opt.value ? "#0a0500" : c.mutedForeground }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSubmit, { opacity: loading ? 0.6 : 1 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#0a0500" /> : <Text style={styles.modalSubmitText}>إضافة المستخدم</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Add Simple Modal ──────────────────────────────────────────────────────────

function AddSimpleModal({
  visible, title, fields, onClose, onSubmit, loading,
}: {
  visible: boolean;
  title: string;
  fields: { key: string; label: string; placeholder?: string; keyboardType?: any }[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
  loading: boolean;
}) {
  const c = useColors();
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: "rgba(245,158,11,0.3)" }]}>
            <View style={styles.modalTopLine} />
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={onClose}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: c.text }]}>{title}</Text>
            </View>
            {fields.map((f) => (
              <View key={f.key} style={{ marginBottom: 12 }}>
                <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>{f.label}</Text>
                <View style={[styles.fieldInput, { backgroundColor: c.background, borderColor: c.border }]}>
                  <TextInput
                    style={[styles.fieldText, { color: c.text }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={c.mutedForeground}
                    value={values[f.key] || ""}
                    onChangeText={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                    keyboardType={f.keyboardType || "default"}
                    textAlign="right"
                  />
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.modalSubmit, { opacity: loading ? 0.6 : 1 }]}
              onPress={() => onSubmit(values)}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#0a0500" /> : <Text style={styles.modalSubmitText}>إضافة</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "warehouses" | "safes" | "users";

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isWeb = Platform.OS === "web";

  const [tab, setTab] = useState<Tab>("warehouses");
  const [modal, setModal] = useState<"warehouse" | "safe" | "user" | null>(null);

  const { data: warehouses, isLoading: whLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch<Warehouse[]>("/api/settings/warehouses"),
    staleTime: 60_000,
  });

  const { data: safes, isLoading: sfLoading } = useQuery({
    queryKey: ["safes"],
    queryFn: () => apiFetch<Safe[]>("/api/settings/safes"),
    staleTime: 60_000,
  });

  const { data: users, isLoading: usLoading } = useQuery({
    queryKey: ["settings-users"],
    queryFn: () => apiFetch<SystemUser[]>("/api/settings/users"),
    staleTime: 60_000,
  });

  const { mutate: addWarehouse, isPending: addingWh } = useMutation({
    mutationFn: (v: Record<string, string>) =>
      apiFetch("/api/settings/warehouses", { method: "POST", body: JSON.stringify({ name: v.name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["warehouses"] }); setModal(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e: any) => Alert.alert("خطأ", e.message),
  });

  const { mutate: addSafe, isPending: addingSf } = useMutation({
    mutationFn: (v: Record<string, string>) =>
      apiFetch("/api/settings/safes", { method: "POST", body: JSON.stringify({ name: v.name, balance: Number(v.balance) || 0 }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["safes"] }); setModal(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e: any) => Alert.alert("خطأ", e.message),
  });

  const { mutate: addUser, isPending: addingUs } = useMutation({
    mutationFn: (v: { name: string; username: string; pin: string; role: string }) =>
      apiFetch("/api/settings/users", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings-users"] }); setModal(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e: any) => Alert.alert("خطأ", e.message),
  });

  const { mutate: deleteWarehouse } = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/settings/warehouses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warehouses"] }),
    onError: (e: any) => Alert.alert("خطأ", e.message),
  });

  const { mutate: deleteSafe } = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/settings/safes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["safes"] }),
    onError: (e: any) => Alert.alert("خطأ", e.message),
  });

  // FIX 5: حذف مستخدم
  const { mutate: deleteUser } = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/settings/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings-users"] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e: any) => Alert.alert("خطأ", e.message),
  });

  const confirmDelete = (label: string, onConfirm: () => void) => {
    Alert.alert("تأكيد الحذف", `هل تريد حذف "${label}"؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: onConfirm },
    ]);
  };

  const tabs: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "warehouses", label: "المخازن", icon: "home" },
    { key: "safes", label: "الخزائن", icon: "dollar-sign" },
    { key: "users", label: "المستخدمون", icon: "users" },
  ];

  const isLoading = whLoading || sfLoading || usLoading;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ModalHeader title="الإعدادات" />

      <View style={[styles.tabBar, { backgroundColor: c.headerBg, borderBottomColor: c.border }]}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Feather name={t.icon} size={16} color={tab === t.key ? AMBER : c.mutedForeground} />
            <Text style={[styles.tabLabel, { color: tab === t.key ? AMBER : c.mutedForeground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 48 }} />
      ) : (
        <View style={{ flex: 1 }}>
          {tab === "warehouses" && (
            <FlatList
              data={warehouses || []}
              keyExtractor={(w) => String(w.id)}
              contentContainerStyle={[styles.listContent, { paddingBottom: isWeb ? 34 : insets.bottom + 40 }]}
              ListHeaderComponent={
                isAdmin ? (
                  <TouchableOpacity style={styles.addBtn} onPress={() => setModal("warehouse")}>
                    <Feather name="plus-circle" size={18} color={AMBER} />
                    <Text style={styles.addBtnText}>إضافة مخزن جديد</Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item: wh }) => (
                <View style={[styles.listCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => confirmDelete(wh.name, () => deleteWarehouse(wh.id))} style={styles.deleteBtn}>
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                  <View style={styles.listCardInfo}>
                    <Text style={[styles.listCardName, { color: c.text }]}>{wh.name}</Text>
                    <Text style={[styles.listCardSub, { color: c.mutedForeground }]}>#{wh.id}</Text>
                  </View>
                  <View style={[styles.listIconWrap, { backgroundColor: AMBER + "18" }]}>
                    <Feather name="home" size={20} color={AMBER} />
                  </View>
                </View>
              )}
              ListEmptyComponent={<View style={styles.empty}><Feather name="home" size={32} color={c.mutedForeground} /><Text style={[styles.emptyText, { color: c.mutedForeground }]}>لا توجد مخازن</Text></View>}
            />
          )}

          {tab === "safes" && (
            <FlatList
              data={safes || []}
              keyExtractor={(s) => String(s.id)}
              contentContainerStyle={[styles.listContent, { paddingBottom: isWeb ? 34 : insets.bottom + 40 }]}
              ListHeaderComponent={
                isAdmin ? (
                  <TouchableOpacity style={styles.addBtn} onPress={() => setModal("safe")}>
                    <Feather name="plus-circle" size={18} color={AMBER} />
                    <Text style={styles.addBtnText}>إضافة خزينة جديدة</Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item: s }) => (
                <View style={[styles.listCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => confirmDelete(s.name, () => deleteSafe(s.id))} style={styles.deleteBtn}>
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                  <View style={styles.listCardInfo}>
                    <Text style={[styles.listCardName, { color: c.text }]}>{s.name}</Text>
                    <Text style={[styles.listCardSub, { color: Number(s.balance) >= 0 ? "#10B981" : "#EF4444" }]}>
                      {formatCurrency(Number(s.balance))} ج.م
                    </Text>
                  </View>
                  <View style={[styles.listIconWrap, { backgroundColor: "#10B981" + "18" }]}>
                    <Feather name="dollar-sign" size={20} color="#10B981" />
                  </View>
                </View>
              )}
              ListEmptyComponent={<View style={styles.empty}><Feather name="dollar-sign" size={32} color={c.mutedForeground} /><Text style={[styles.emptyText, { color: c.mutedForeground }]}>لا توجد خزائن</Text></View>}
            />
          )}

          {tab === "users" && (
            <FlatList
              data={users || []}
              keyExtractor={(u) => String(u.id)}
              contentContainerStyle={[styles.listContent, { paddingBottom: isWeb ? 34 : insets.bottom + 40 }]}
              ListHeaderComponent={
                isAdmin ? (
                  <TouchableOpacity style={styles.addBtn} onPress={() => setModal("user")}>
                    <Feather name="user-plus" size={18} color={AMBER} />
                    <Text style={styles.addBtnText}>إضافة مستخدم جديد</Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item: u }) => {
                const roleColor = ROLE_COLORS[u.role] || c.mutedForeground;
                const isSelf = u.username === (user?.username || "");
                return (
                  <View style={[styles.listCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                    {/* FIX 5: زر حذف المستخدم */}
                    {isAdmin && !isSelf && u.role !== "super_admin" && (
                      <TouchableOpacity
                        onPress={() => confirmDelete(u.name, () => deleteUser(u.id))}
                        style={styles.deleteBtn}
                      >
                        <Feather name="trash-2" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                    <View style={[styles.roleBadge, { backgroundColor: roleColor + "18" }]}>
                      <Text style={[styles.roleBadgeText, { color: roleColor }]}>{ROLE_LABELS[u.role] || u.role}</Text>
                    </View>
                    <View style={styles.listCardInfo}>
                      <Text style={[styles.listCardName, { color: c.text }]}>{u.name}</Text>
                      <Text style={[styles.listCardSub, { color: c.mutedForeground }]}>@{u.username}</Text>
                    </View>
                    <View style={[styles.userAvatar, { backgroundColor: AMBER + "18" }]}>
                      <Text style={[styles.userAvatarText, { color: AMBER }]}>{u.name.charAt(0)}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={<View style={styles.empty}><Feather name="users" size={32} color={c.mutedForeground} /><Text style={[styles.emptyText, { color: c.mutedForeground }]}>لا يوجد مستخدمون</Text></View>}
            />
          )}
        </View>
      )}

      <AddSimpleModal
        visible={modal === "warehouse"}
        title="إضافة مخزن جديد"
        fields={[{ key: "name", label: "اسم المخزن", placeholder: "مثال: المخزن الرئيسي" }]}
        onClose={() => setModal(null)}
        onSubmit={addWarehouse}
        loading={addingWh}
      />
      <AddSimpleModal
        visible={modal === "safe"}
        title="إضافة خزينة جديدة"
        fields={[
          { key: "name", label: "اسم الخزينة", placeholder: "مثال: الخزينة الرئيسية" },
          { key: "balance", label: "الرصيد الابتدائي", placeholder: "0", keyboardType: "numeric" },
        ]}
        onClose={() => setModal(null)}
        onSubmit={addSafe}
        loading={addingSf}
      />
      <AddUserModal
        visible={modal === "user"}
        onClose={() => setModal(null)}
        onSubmit={addUser}
        loading={addingUs}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexDirection: "row-reverse", borderBottomWidth: 1, paddingHorizontal: 16 },
  tabItem: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: AMBER },
  tabLabel: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
  listContent: { padding: 16, gap: 10 },
  addBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.4)", borderRadius: 14,
    borderStyle: "dashed", padding: 14, marginBottom: 4, justifyContent: "center",
  },
  addBtnText: { color: AMBER, fontSize: 15, fontFamily: "Tajawal_700Bold" },
  listCard: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  listIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  listCardInfo: { flex: 1, alignItems: "flex-end" },
  listCardName: { fontSize: 15, fontFamily: "Tajawal_700Bold" },
  listCardSub: { fontSize: 13, fontFamily: "Tajawal_400Regular", marginTop: 2 },
  deleteBtn: { padding: 8 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  roleBadgeText: { fontSize: 11, fontFamily: "Tajawal_700Bold" },
  userAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  userAvatarText: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Tajawal_400Regular" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { borderRadius: 20, borderWidth: 1, padding: 20, overflow: "hidden", margin: 16 },
  modalTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Tajawal_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 6 },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  fieldText: { fontSize: 15, fontFamily: "Tajawal_400Regular", paddingVertical: 11, textAlign: "right" },
  modalSubmit: { backgroundColor: AMBER, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  modalSubmitText: { color: "#0a0500", fontFamily: "Tajawal_800ExtraBold", fontSize: 16 },
  roleRow: { flexDirection: "row-reverse", gap: 8, paddingBottom: 4 },
  roleChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  roleChipText: { fontSize: 13, fontFamily: "Tajawal_700Bold" },
});
