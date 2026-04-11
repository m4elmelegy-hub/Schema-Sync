import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { Alert } from "react-native";

const MIN_PIN = 4;
const PIN_LENGTH = 6;
const AMBER = "#F59E0B";

function PinDots({ count, max, isDark }: { count: number; max: number; isDark: boolean }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < count ? AMBER : "transparent",
              borderColor: i < count ? AMBER : isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)",
            },
          ]}
        />
      ))}
    </View>
  );
}

function PinButton({ label, onPress, icon }: { label?: string; onPress: () => void; icon?: React.ReactNode }) {
  const c = useColors();
  return (
    <TouchableOpacity
      style={[styles.pinBtn, {
        backgroundColor: c.isDark ? "rgba(255,255,255,0.07)" : "#F0F0F5",
        borderColor: c.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
      }]}
      onPress={onPress}
      activeOpacity={0.55}
    >
      {icon || <Text style={[styles.pinBtnText, { color: c.text }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const c = useColors();
  const { login } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);

  const bg = c.isDark ? "#0D0F17" : "#F2F4FA";
  const cardBg = c.isDark ? "rgba(22,27,45,0.98)" : "#FFFFFF";

  useEffect(() => {
    getBiometricStatus().then(setBiometric);
  }, []);

  const handleNumPress = (num: string) => {
    if (!username.trim()) { setError("أدخل اسم المستخدم أولاً"); return; }
    if (pin.length >= PIN_LENGTH) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((p) => p + num);
    setError("");
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const performLogin = async (u: string, p: string) => {
    if (!u.trim()) { setError("أدخل اسم المستخدم"); return; }
    if (p.length < MIN_PIN) { setError(`الرقم السري يجب أن يكون ${MIN_PIN} أرقام على الأقل`); return; }
    setLoading(true);
    setError("");
    try {
      await login(u.trim(), p);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const bStatus = await getBiometricStatus();
      if (bStatus.available && bStatus.enrolled && !bStatus.enabled && Platform.OS !== "web") {
        Alert.alert(
          "دخول أسرع بالبصمة",
          "فعّل البصمة / Face ID للدخول بدون رقم سري في المرة القادمة",
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
      setError(e.message || "خطأ في تسجيل الدخول");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !loading) {
      performLogin(username, pin);
    }
  }, [pin]);

  const handleBiometricLogin = async () => {
    if (!biometric?.enabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await authenticateWithBiometric();
    if (!ok) { setError("فشل التحقق بالبصمة"); return; }
    const creds = await getBiometricCredentials();
    if (!creds) { setError("لا توجد بيانات محفوظة — أدخل اسم المستخدم والرقم السري"); return; }
    setUsername(creds.username);
    await performLogin(creds.username, creds.pin);
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.ambientGlow, { opacity: c.isDark ? 1 : 0.4 }]} pointerEvents="none" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: isWeb ? 40 : insets.top + 20, paddingBottom: isWeb ? 30 : insets.bottom + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* الشعار */}
          <View style={styles.logoSection}>
            <View style={[styles.logoWrap, { backgroundColor: AMBER + "18", borderColor: AMBER + "35" }]}>
              <Image source={require("@/assets/images/halal-logo.png")} style={styles.logo} contentFit="contain" />
            </View>
            <Text style={[styles.brand, { color: c.text }]}>Halal Tech</Text>
            <Text style={[styles.slogan, { color: AMBER }]}>الحلال = البركة</Text>
          </View>

          {/* البطاقة */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: c.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)" }]}>
            <View style={styles.cardAccent} />

            <Text style={[styles.cardTitle, { color: c.text }]}>تسجيل الدخول</Text>

            {/* حقل اسم المستخدم */}
            <View style={[styles.inputWrap, {
              backgroundColor: c.isDark ? "rgba(255,255,255,0.05)" : "#F5F6FA",
              borderColor: error && !username.trim() ? "#EF4444" : c.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.09)",
            }]}>
              <Feather name="user" size={17} color={username ? AMBER : c.mutedForeground} style={{ marginLeft: 10 }} />
              <TextInput
                ref={inputRef}
                style={[styles.inputField, { color: c.text }]}
                placeholder="اسم المستخدم"
                placeholderTextColor={c.mutedForeground}
                value={username}
                onChangeText={(t) => { setUsername(t); setError(""); }}
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="right"
                returnKeyType="done"
                onSubmitEditing={() => inputRef.current?.blur()}
              />
            </View>

            {/* مؤشر الرقم السري */}
            <View style={styles.pinLabelRow}>
              <Text style={[styles.pinLabel, { color: c.mutedForeground }]}>الرقم السري</Text>
              {pin.length > 0 && (
                <TouchableOpacity onPress={() => setPin("")}>
                  <Text style={[styles.clearPin, { color: AMBER }]}>مسح</Text>
                </TouchableOpacity>
              )}
            </View>
            <PinDots count={pin.length} max={PIN_LENGTH} isDark={c.isDark} />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* لوحة الأرقام */}
            {loading ? (
              <ActivityIndicator color={AMBER} size="large" style={{ marginVertical: 28 }} />
            ) : (
              <View style={styles.pad}>
                {["1","2","3","4","5","6","7","8","9"].map((n) => (
                  <PinButton key={n} label={n} onPress={() => handleNumPress(n)} />
                ))}
                {biometric?.enabled ? (
                  <PinButton onPress={handleBiometricLogin} icon={
                    <Feather name={biometric.type === "face" ? "smile" : "aperture"} size={24} color={AMBER} />
                  } />
                ) : (
                  <View style={{ width: 80, height: 72 }} />
                )}
                <PinButton label="0" onPress={() => handleNumPress("0")} />
                <PinButton onPress={handleDelete} icon={<Feather name="delete" size={21} color={c.text} />} />
              </View>
            )}

            {/* زر الدخول */}
            {!loading && pin.length >= MIN_PIN && (
              <TouchableOpacity
                style={styles.loginBtn}
                onPress={() => performLogin(username, pin)}
              >
                <Text style={styles.loginBtnText}>دخول</Text>
                <Feather name="log-in" size={18} color="#0a0500" />
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.footer, { color: c.mutedForeground }]}>نظام إدارة موارد المؤسسة</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ambientGlow: {
    position: "absolute", top: -60, alignSelf: "center",
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: "rgba(245,158,11,0.10)",
  },
  scroll: { flexGrow: 1, paddingHorizontal: 20, alignItems: "center" },

  logoSection: { alignItems: "center", marginBottom: 20 },
  logoWrap: { width: 72, height: 72, borderRadius: 20, justifyContent: "center", alignItems: "center", borderWidth: 1, marginBottom: 12 },
  logo: { width: 50, height: 50 },
  brand: { fontSize: 24, fontFamily: "Tajawal_700Bold", textAlign: "center", marginBottom: 2 },
  slogan: { fontSize: 13, fontFamily: "Tajawal_400Regular", textAlign: "center" },

  card: {
    width: "100%", maxWidth: 400, borderRadius: 22, padding: 22, borderWidth: 1, overflow: "hidden",
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2.5, backgroundColor: AMBER },
  cardTitle: { fontSize: 18, fontFamily: "Tajawal_700Bold", textAlign: "center", marginTop: 6, marginBottom: 16 },

  inputWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 2, marginBottom: 18,
  },
  inputField: { flex: 1, fontSize: 15, fontFamily: "Tajawal_400Regular", paddingVertical: 13, textAlign: "right" },

  pinLabelRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  pinLabel: { fontSize: 13, fontFamily: "Tajawal_500Medium" },
  clearPin: { fontSize: 12, fontFamily: "Tajawal_700Bold" },

  dotsRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 12, marginBottom: 4 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 2 },

  errorText: { fontSize: 12, color: "#EF4444", textAlign: "center", marginTop: 6, fontFamily: "Tajawal_400Regular" },

  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 14 },
  pinBtn: {
    width: 80, height: 72, borderRadius: 14,
    justifyContent: "center", alignItems: "center", borderWidth: 1,
  },
  pinBtnText: { fontSize: 24, fontFamily: "Tajawal_400Regular" },

  loginBtn: {
    backgroundColor: AMBER, borderRadius: 12, paddingVertical: 14, marginTop: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
  },
  loginBtnText: { color: "#0a0500", fontSize: 16, fontFamily: "Tajawal_800ExtraBold" },

  footer: { marginTop: 20, fontSize: 11, fontFamily: "Tajawal_400Regular", textAlign: "center" },
});
