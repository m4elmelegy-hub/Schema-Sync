import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
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
import { useAuth } from "@/context/AuthContext";

const PIN_LENGTH = 6;
const AMBER = "#F59E0B";
const DARK_BG = "#090c14";
const CARD_BG = "rgba(13,17,32,0.95)";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#F0F7FF";
const MUTED = "#7A8FA6";

function PinDots({ count, max }: { count: number; max: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < count ? AMBER : "transparent",
              borderColor: i < count ? AMBER : "rgba(255,255,255,0.2)",
              shadowColor: i < count ? AMBER : "transparent",
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
  return (
    <TouchableOpacity style={styles.pinBtn} onPress={onPress} activeOpacity={0.6}>
      {icon || <Text style={styles.pinBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"username" | "pin">("username");
  const inputRef = useRef<TextInput>(null);

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
    <View style={[styles.container, { backgroundColor: DARK_BG }]}>
      {/* خلفية ضوئية */}
      <View style={styles.glow} pointerEvents="none" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: isWeb ? 80 : insets.top + 32, paddingBottom: isWeb ? 40 : insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── الشعار والاسم ── */}
          <View style={styles.headerSection}>
            <View style={styles.logoWrap}>
              <Image
                source={require("@/assets/images/halal-logo.png")}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
            <Text style={styles.companyName}>Halal Tech</Text>
            <Text style={styles.slogan}>الحلال = البركة</Text>
          </View>

          {/* ── بطاقة الدخول ── */}
          <View style={[styles.card, { backgroundColor: CARD_BG, borderColor: CARD_BORDER }]}>
            {/* خط أعلى الكارد بلون ذهبي */}
            <View style={styles.cardAccentLine} />

            {step === "username" ? (
              <>
                <Text style={styles.cardTitle}>تسجيل الدخول</Text>
                <Text style={styles.cardSub}>أدخل اسم المستخدم للمتابعة</Text>
                <View style={[styles.inputWrap, { borderColor: error ? "#EF4444" : "rgba(255,255,255,0.12)" }]}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="اسم المستخدم"
                    placeholderTextColor={MUTED}
                    value={username}
                    onChangeText={(t) => { setUsername(t); setError(""); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign="right"
                    returnKeyType="next"
                    onSubmitEditing={handleNext}
                  />
                  <Feather name="user" size={18} color={MUTED} style={{ marginLeft: 10 }} />
                </View>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <TouchableOpacity
                  style={[styles.nextBtn, { opacity: username.trim() ? 1 : 0.4 }]}
                  onPress={handleNext}
                  disabled={!username.trim()}
                >
                  <Text style={styles.nextBtnText}>التالي</Text>
                  <Feather name="arrow-left" size={18} color="#0a0500" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.backRow} onPress={() => { setStep("username"); setPin(""); setError(""); }}>
                  <Text style={styles.backUsername}>{username}</Text>
                  <Feather name="edit-2" size={13} color={AMBER} style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                <Text style={styles.cardTitle}>الرقم السري</Text>
                <Text style={styles.cardSub}>أدخل رقمك السري للدخول</Text>

                <PinDots count={pin.length} max={PIN_LENGTH} />
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
                    <PinButton onPress={handleDelete} icon={<Feather name="delete" size={22} color={TEXT} />} />
                  </View>
                )}
              </>
            )}
          </View>

          <Text style={styles.footer}>نظام إدارة موارد المؤسسة</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  glow: {
    position: "absolute",
    top: -100, left: "50%", marginLeft: -200,
    width: 400, height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  scroll: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },

  headerSection: { alignItems: "center", marginBottom: 32 },
  logoWrap: {
    width: 80, height: 80, borderRadius: 22,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderWidth: 1, borderColor: "rgba(245,158,11,0.2)",
    justifyContent: "center", alignItems: "center",
    marginBottom: 14,
  },
  logo: { width: 56, height: 56 },
  companyName: {
    fontSize: 26, fontFamily: "Tajawal_700Bold",
    color: TEXT, textAlign: "center", marginBottom: 4,
  },
  slogan: {
    fontSize: 14, fontFamily: "Tajawal_400Regular",
    color: AMBER, textAlign: "center",
  },

  card: {
    width: "100%", maxWidth: 420,
    borderRadius: 20, padding: 28,
    borderWidth: 1, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 10,
  },
  cardAccentLine: {
    position: "absolute", top: 0, left: 0, right: 0, height: 2,
    backgroundColor: AMBER,
  },
  cardTitle: {
    fontSize: 20, fontFamily: "Tajawal_700Bold",
    color: TEXT, textAlign: "right", marginBottom: 6, marginTop: 8,
  },
  cardSub: {
    fontSize: 14, fontFamily: "Tajawal_400Regular",
    color: MUTED, textAlign: "right", marginBottom: 24,
  },
  backRow: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 12 },
  backUsername: {
    fontSize: 14, fontFamily: "Tajawal_700Bold",
    color: AMBER,
  },

  inputWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 4,
    marginBottom: 8,
  },
  input: {
    flex: 1, fontSize: 16, fontFamily: "Tajawal_400Regular",
    color: TEXT, paddingVertical: 12,
  },
  errorText: {
    fontSize: 13, fontFamily: "Tajawal_400Regular",
    color: "#EF4444", textAlign: "right", marginBottom: 8,
  },
  nextBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    backgroundColor: AMBER, borderRadius: 12, paddingVertical: 16, gap: 8, marginTop: 8,
  },
  nextBtnText: {
    color: "#0a0500", fontSize: 16, fontFamily: "Tajawal_700Bold",
  },

  dotsRow: {
    flexDirection: "row-reverse", justifyContent: "center",
    gap: 14, marginBottom: 8, marginTop: 12,
  },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },

  pad: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "center", gap: 14, marginTop: 24,
  },
  pinBtn: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  pinBtnText: {
    fontSize: 26, fontFamily: "Tajawal_400Regular", color: TEXT,
  },

  footer: {
    marginTop: 28, fontSize: 12, fontFamily: "Tajawal_400Regular",
    color: "rgba(255,255,255,0.25)", textAlign: "center",
  },
});
