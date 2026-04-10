import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

const PIN_LENGTH = 6;

function PinDots({ count, max }: { count: number; max: number }) {
  const c = useColors();
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < count ? c.primary : "transparent",
              borderColor: i < count ? c.primary : c.border,
            },
          ]}
        />
      ))}
    </View>
  );
}

function PinButton({
  label,
  onPress,
  icon,
}: {
  label?: string;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <TouchableOpacity
      style={[styles.pinBtn, { backgroundColor: c.card, shadowColor: c.shadow }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon || <Text style={[styles.pinBtnText, { color: c.text }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"username" | "pin">("username");
  const usernameRef = useRef<TextInput>(null);

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
    if (!username.trim()) {
      setError("أدخل اسم المستخدم");
      return;
    }
    setStep("pin");
    setError("");
  };

  const handleLogin = async () => {
    if (pin.length < 4) {
      setError("الرقم السري قصير جداً");
      return;
    }
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
    if (pin.length === PIN_LENGTH && step === "pin") {
      handleLogin();
    }
  }, [pin]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: isWeb ? 80 : insets.top + 40, paddingBottom: isWeb ? 34 : insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.logoWrap, { backgroundColor: c.primary }]}>
              <Feather name="activity" size={32} color="#fff" />
            </View>
            <Text style={[styles.appName, { color: c.text }]}>نظام ERP</Text>
            <Text style={[styles.tagline, { color: c.mutedForeground }]}>
              نظام إدارة موارد المؤسسة
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.card, shadowColor: c.shadow }]}>
            {step === "username" ? (
              <>
                <Text style={[styles.cardTitle, { color: c.text }]}>تسجيل الدخول</Text>
                <Text style={[styles.cardSub, { color: c.mutedForeground }]}>
                  أدخل اسم المستخدم للمتابعة
                </Text>
                <TextInput
                  ref={usernameRef}
                  style={[
                    styles.input,
                    {
                      backgroundColor: c.muted,
                      color: c.text,
                      borderColor: error ? c.destructive : c.border,
                    },
                  ]}
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
                {error ? (
                  <Text style={[styles.error, { color: c.destructive }]}>{error}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.nextBtn, { backgroundColor: c.primary, opacity: username.trim() ? 1 : 0.5 }]}
                  onPress={handleNext}
                  disabled={!username.trim()}
                >
                  <Text style={styles.nextBtnText}>التالي</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.backRow}
                  onPress={() => { setStep("username"); setPin(""); setError(""); }}
                >
                  <Text style={[styles.backUsername, { color: c.primary }]}>{username}</Text>
                  <Feather name="edit-2" size={14} color={c.primary} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
                <Text style={[styles.cardTitle, { color: c.text }]}>الرقم السري</Text>
                <Text style={[styles.cardSub, { color: c.mutedForeground }]}>
                  أدخل رقمك السري للدخول
                </Text>
                <PinDots count={pin.length} max={PIN_LENGTH} />
                {error ? (
                  <Text style={[styles.error, { color: c.destructive }]}>{error}</Text>
                ) : null}
                {loading ? (
                  <ActivityIndicator color={c.primary} size="large" style={{ marginTop: 24 }} />
                ) : (
                  <View style={styles.pad}>
                    {["1","2","3","4","5","6","7","8","9"].map((n) => (
                      <PinButton key={n} label={n} onPress={() => handleNumPress(n)} />
                    ))}
                    <View style={styles.pinBtn} />
                    <PinButton label="0" onPress={() => handleNumPress("0")} />
                    <PinButton
                      onPress={handleDelete}
                      icon={<Feather name="delete" size={22} color={c.text} />}
                    />
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, alignItems: "center" },
  header: { alignItems: "center", marginBottom: 32 },
  logoWrap: {
    width: 72, height: 72, borderRadius: 20,
    justifyContent: "center", alignItems: "center",
    marginBottom: 16,
  },
  appName: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: {
    width: "100%", maxWidth: 400,
    borderRadius: 20, padding: 28,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 5,
  },
  cardTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "right", marginBottom: 6 },
  cardSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "right", marginBottom: 24 },
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", marginBottom: 8 },
  nextBtn: { borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  nextBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  backRow: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 12 },
  backUsername: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dotsRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 12, marginBottom: 8, marginTop: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  pad: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "center", gap: 12,
    marginTop: 24,
  },
  pinBtn: {
    width: 76, height: 76, borderRadius: 38,
    justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 6, elevation: 2,
  },
  pinBtnText: { fontSize: 24, fontFamily: "Inter_500Medium" },
});
