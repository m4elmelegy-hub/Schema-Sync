import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import {
  authenticateWithBiometric,
  getBiometricCredentials,
  getBiometricStatus,
  saveBiometricCredentials,
  setBiometricEnabled,
  type BiometricStatus,
} from "@/hooks/useBiometric";

const AMBER = "#F59E0B";
const APP_VERSION = "1.0.0";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const c = useColors();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);

  const bg = c.isDark ? "#0B0E1A" : "#F0F2FA";
  const cardBg = c.isDark ? "rgba(18,22,40,0.98)" : "#FFFFFF";
  const inputBg = c.isDark ? "rgba(255,255,255,0.05)" : "#F7F8FC";
  const inputBorder = c.isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const labelColor = c.isDark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.50)";

  useEffect(() => {
    getBiometricStatus().then(setBiometric);
  }, []);

  const performLogin = async (u: string, p: string) => {
    if (!u.trim()) { setError("أدخل اسم المستخدم"); return; }
    if (!p.trim()) { setError("أدخل كلمة المرور"); return; }
    setLoading(true);
    setError("");
    try {
      await login(u.trim(), p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const bStatus = await getBiometricStatus();
      if (bStatus.available && bStatus.enrolled && !bStatus.enabled && Platform.OS !== "web") {
        Alert.alert(
          "دخول أسرع بالبصمة",
          "فعّل البصمة / Face ID للدخول بدون كلمة مرور في المرات القادمة",
          [
            { text: "لاحقاً", style: "cancel", onPress: () => router.replace("/(tabs)") },
            {
              text: "تفعيل",
              onPress: async () => {
                const ok = await authenticateWithBiometric();
                if (ok) {
                  await saveBiometricCredentials(u.trim(), p);
                  await setBiometricEnabled(true);
                }
                router.replace("/(tabs)");
              },
            },
          ]
        );
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setError(e.message || "اسم المستخدم أو كلمة المرور غير صحيحة");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!biometric?.enabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await authenticateWithBiometric();
    if (!ok) { setError("فشل التحقق بالبصمة"); return; }
    const creds = await getBiometricCredentials();
    if (!creds) { setError("لا توجد بيانات محفوظة — أدخل بياناتك مرة أخرى"); return; }
    await performLogin(creds.username, creds.pin);
  };

  const canLogin = username.trim().length > 0 && password.trim().length > 0;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* خلفية ضوئية */}
      <View style={[styles.glow, { opacity: c.isDark ? 1 : 0.3 }]} pointerEvents="none" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: isWeb ? 50 : insets.top + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* الشعار */}
          <View style={styles.logoSection}>
            <View style={[styles.logoWrap, {
              backgroundColor: c.isDark ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.10)",
              borderColor: c.isDark ? "rgba(245,158,11,0.28)" : "rgba(245,158,11,0.22)",
            }]}>
              <Image
                source={require("@/assets/images/halal-logo.png")}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
            <Text style={[styles.brandName, { color: c.text }]}>Halal Tech</Text>
            <Text style={[styles.brandSlogan, { color: AMBER }]}>الحلال = البركة</Text>
          </View>

          {/* البطاقة الرئيسية */}
          <View style={[styles.card, {
            backgroundColor: cardBg,
            borderColor: c.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
          }]}>
            {/* شريط أعلى البطاقة */}
            <View style={styles.cardTopBar} />

            {/* حقل اسم المستخدم */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: labelColor }]}>اسم المستخدم</Text>
              <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <TextInput
                  style={[styles.inputText, { color: c.text }]}
                  placeholder="أدخل اسم المستخدم"
                  placeholderTextColor={c.isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
                  value={username}
                  onChangeText={(t) => { setUsername(t); setError(""); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="right"
                  returnKeyType="next"
                />
                <Feather name="user" size={18} color={username ? AMBER : labelColor} style={styles.inputIcon} />
              </View>
            </View>

            {/* حقل كلمة المرور */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: labelColor }]}>كلمة المرور</Text>
              <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                  <Feather name={showPassword ? "eye" : "eye-off"} size={18} color={labelColor} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.inputText, { color: c.text }]}
                  placeholder="أدخل كلمة المرور"
                  placeholderTextColor={c.isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(""); }}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                  returnKeyType="done"
                  onSubmitEditing={() => canLogin && performLogin(username, password)}
                />
                <Feather name="lock" size={18} color={password ? AMBER : labelColor} style={styles.inputIcon} />
              </View>
            </View>

            {/* رسالة الخطأ */}
            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* صف الأزرار */}
            <View style={styles.actionsRow}>
              {/* زر البصمة */}
              {biometric?.enabled && Platform.OS !== "web" ? (
                <TouchableOpacity
                  style={[styles.biometricBtn, {
                    backgroundColor: c.isDark ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.10)",
                    borderColor: c.isDark ? "rgba(245,158,11,0.30)" : "rgba(245,158,11,0.25)",
                  }]}
                  onPress={handleBiometricLogin}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={biometric.type === "face" ? "smile" : "aperture"}
                    size={26}
                    color={AMBER}
                  />
                </TouchableOpacity>
              ) : null}

              {/* زر تسجيل الدخول */}
              <TouchableOpacity
                style={[styles.loginBtn, {
                  backgroundColor: canLogin ? AMBER : c.isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB",
                  flex: biometric?.enabled ? 1 : undefined,
                  width: biometric?.enabled ? undefined : "100%",
                }]}
                onPress={() => performLogin(username, password)}
                disabled={loading || !canLogin}
                activeOpacity={0.82}
              >
                {loading ? (
                  <ActivityIndicator color={canLogin ? "#0a0500" : labelColor} size="small" />
                ) : (
                  <>
                    <Text style={[styles.loginBtnText, { color: canLogin ? "#0a0500" : labelColor }]}>
                      تسجيل الدخول
                    </Text>
                    <Feather name="log-in" size={18} color={canLogin ? "#0a0500" : labelColor} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* الإصدار */}
          <Text style={[styles.versionText, { color: labelColor }]}>إصدار التطبيق {APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* شريط التواصل السفلي */}
      <View style={[styles.bottomBar, {
        backgroundColor: c.isDark ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.12)",
        borderTopColor: c.isDark ? "rgba(245,158,11,0.20)" : "rgba(245,158,11,0.18)",
        paddingBottom: isWeb ? 14 : insets.bottom + 6,
      }]}>
        <Feather name="headphones" size={15} color={AMBER} />
        <Text style={[styles.bottomBarText, { color: c.isDark ? "rgba(255,255,255,0.70)" : "rgba(0,0,0,0.55)" }]}>
          نظام إدارة موارد المؤسسة
        </Text>
        <View style={[styles.bottomDot, { backgroundColor: AMBER }]} />
        <Text style={[styles.bottomBarBrand, { color: AMBER }]}>Halal Tech ERP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: {
    position: "absolute", top: -80, alignSelf: "center",
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: "rgba(245,158,11,0.09)",
  },
  scroll: {
    flexGrow: 1, paddingHorizontal: 24, paddingBottom: 20,
    alignItems: "center",
  },

  logoSection: { alignItems: "center", marginBottom: 28 },
  logoWrap: {
    width: 80, height: 80, borderRadius: 22,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, marginBottom: 14,
  },
  logo: { width: 56, height: 56 },
  brandName: {
    fontSize: 26, fontFamily: "Tajawal_700Bold",
    textAlign: "center", marginBottom: 4, letterSpacing: 0.3,
  },
  brandSlogan: {
    fontSize: 13, fontFamily: "Tajawal_400Regular", textAlign: "center",
  },

  card: {
    width: "100%", maxWidth: 420, borderRadius: 20,
    padding: 24, borderWidth: 1, overflow: "hidden",
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12,
    shadowRadius: 24, elevation: 8,
  },
  cardTopBar: {
    position: "absolute", top: 0, left: 0, right: 0, height: 3,
    backgroundColor: AMBER,
  },

  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 13, fontFamily: "Tajawal_500Medium",
    textAlign: "right", marginBottom: 7,
  },
  inputRow: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 2,
  },
  inputIcon: { marginLeft: 6 },
  eyeBtn: { padding: 8, marginRight: 2 },
  inputText: {
    flex: 1, fontSize: 15, fontFamily: "Tajawal_400Regular",
    paddingVertical: 14, textAlign: "right",
  },

  errorBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
  },
  errorText: {
    fontSize: 13, color: "#EF4444",
    fontFamily: "Tajawal_400Regular", flex: 1, textAlign: "right",
  },

  actionsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  biometricBtn: {
    width: 58, height: 54, borderRadius: 12,
    justifyContent: "center", alignItems: "center", borderWidth: 1.5,
  },
  loginBtn: {
    height: 54, borderRadius: 12,
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "center", gap: 8, paddingHorizontal: 20,
  },
  loginBtnText: { fontSize: 16, fontFamily: "Tajawal_700Bold" },

  versionText: {
    fontSize: 11, fontFamily: "Tajawal_400Regular",
    textAlign: "center", marginTop: 22,
  },

  bottomBar: {
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "center", gap: 8, paddingTop: 12,
    borderTopWidth: 1,
  },
  bottomBarText: { fontSize: 12, fontFamily: "Tajawal_400Regular" },
  bottomDot: { width: 4, height: 4, borderRadius: 2 },
  bottomBarBrand: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
});
