import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

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
              borderColor: i < count ? AMBER : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
              shadowColor: AMBER,
              shadowOpacity: i < count ? 0.5 : 0,
              shadowRadius: 6,
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
        backgroundColor: c.isDark ? "rgba(255,255,255,0.06)" : c.secondary,
        borderColor: c.isDark ? "rgba(255,255,255,0.1)" : c.border,
      }]}
      onPress={onPress}
      activeOpacity={0.6}
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

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"username" | "pin">("username");
  const inputRef = useRef<TextInput>(null);

  const bg = c.isDark ? "#0F1117" : "#F4F6FA";
  const cardBg = c.isDark ? "rgba(26,32,53,0.97)" : "#FFFFFF";
  const cardBorder = c.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const handleNumPress = (num: string) => {
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

  const handleNext = () => {
    if (!username.trim()) { setError("أدخل اسم المستخدم"); return; }
    setStep("pin");
    setError("");
  };

  const handleLogin = async () => {
    if (pin.length < 4) { setError("الرقم السري قصير جداً"); return; }
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), pin);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "خطأ في تسجيل الدخول");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (pin.length === PIN_LENGTH && step === "pin") handleLogin();
  }, [pin]);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* خلفية ضوئية */}
      <View style={[styles.glow, { opacity: c.isDark ? 1 : 0.5 }]} pointerEvents="none" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: isWeb ? 80 : insets.top + 32, paddingBottom: isWeb ? 40 : insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── الشعار ── */}
          <View style={styles.headerSection}>
            <View style={[styles.logoWrap, {
              backgroundColor: AMBER + "15",
              borderColor: AMBER + "30",
              shadowColor: AMBER,
              shadowOpacity: 0.2,
              shadowRadius: 20,
            }]}>
              <Image
                source={require("@/assets/images/halal-logo.png")}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
            <Text style={[styles.companyName, { color: c.text }]}>Halal Tech</Text>
            <Text style={[styles.slogan, { color: AMBER }]}>الحلال = البركة</Text>
          </View>

          {/* ── البطاقة ── */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder,
            shadowColor: c.isDark ? "#000" : "rgba(0,0,0,0.08)" }]}>
            <View style={styles.cardAccentLine} />

            {step === "username" ? (
              <>
                <Text style={[styles.cardTitle, { color: c.text }]}>تسجيل الدخول</Text>
                <Text style={[styles.cardSub, { color: c.mutedForeground }]}>أدخل اسم المستخدم للمتابعة</Text>

                <View style={[styles.inputWrap, {
                  backgroundColor: c.isDark ? "rgba(255,255,255,0.05)" : c.secondary,
                  borderColor: error ? "#EF4444" : c.border,
                }]}>
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
                    returnKeyType="next"
                    onSubmitEditing={handleNext}
                  />
                  <Feather name="user" size={18} color={c.mutedForeground} style={{ marginLeft: 10 }} />
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.nextBtn, { opacity: username.trim() ? 1 : 0.4 }]}
                  onPress={handleNext}
                  disabled={!username.trim()}
                >
                  <Text style={styles.nextBtnText}>التالي</Text>
                  <Feather name="arrow-left" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.backRow}
                  onPress={() => { setStep("username"); setPin(""); setError(""); }}
                >
                  <Text style={[styles.backUsername, { color: AMBER }]}>{username}</Text>
                  <Feather name="edit-2" size={13} color={AMBER} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                <Text style={[styles.cardTitle, { color: c.text }]}>الرقم السري</Text>
                <Text style={[styles.cardSub, { color: c.mutedForeground }]}>أدخل رقمك السري للدخول</Text>

                <PinDots count={pin.length} max={PIN_LENGTH} isDark={c.isDark} />
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {loading ? (
                  <ActivityIndicator color={AMBER} size="large" style={{ marginTop: 32 }} />
                ) : (
                  <View style={styles.pad}>
                    {["1","2","3","4","5","6","7","8","9"].map((n) => (
                      <PinButton key={n} label={n} onPress={() => handleNumPress(n)} />
                    ))}
                    <View style={{ width: 80, height: 80 }} />
                    <PinButton label="0" onPress={() => handleNumPress("0")} />
                    <PinButton onPress={handleDelete} icon={<Feather name="delete" size={22} color={c.text} />} />
                  </View>
                )}
              </>
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
  glow: {
    position: "absolute", top: -80, left: "50%", marginLeft: -160,
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: "rgba(245,158,11,0.10)",
  },
  scroll: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },

  headerSection: { alignItems: "center", marginBottom: 28 },
  logoWrap: {
    width: 80, height: 80, borderRadius: 22,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, marginBottom: 14,
  },
  logo: { width: 56, height: 56 },
  companyName: { fontSize: 26, fontFamily: "Tajawal_700Bold", textAlign: "center", marginBottom: 4 },
  slogan:      { fontSize: 14, fontFamily: "Tajawal_400Regular", textAlign: "center" },

  card: {
    width: "100%", maxWidth: 420,
    borderRadius: 20, padding: 28,
    borderWidth: 1, overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 8,
  },
  cardAccentLine: {
    position: "absolute", top: 0, left: 0, right: 0, height: 2.5,
    backgroundColor: AMBER,
  },
  cardTitle: { fontSize: 20, fontFamily: "Tajawal_700Bold", textAlign: "right", marginBottom: 6, marginTop: 8 },
  cardSub:   { fontSize: 14, fontFamily: "Tajawal_400Regular", textAlign: "right", marginBottom: 22 },

  backRow: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 12 },
  backUsername: { fontSize: 14, fontFamily: "Tajawal_700Bold" },

  inputWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 8,
  },
  inputField: { flex: 1, fontSize: 16, fontFamily: "Tajawal_400Regular", paddingVertical: 12 },

  errorText: {
    fontSize: 13, fontFamily: "Tajawal_400Regular",
    color: "#EF4444", textAlign: "right", marginBottom: 8,
  },
  nextBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    backgroundColor: AMBER, borderRadius: 12, paddingVertical: 16, gap: 8, marginTop: 8,
  },
  nextBtnText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Tajawal_700Bold" },

  dotsRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 14, marginBottom: 8, marginTop: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },

  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 24 },
  pinBtn: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: "center", alignItems: "center", borderWidth: 1,
  },
  pinBtnText: { fontSize: 26, fontFamily: "Tajawal_400Regular" },

  footer: { marginTop: 28, fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "center" },
});
