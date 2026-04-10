import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const AMBER = "#F59E0B";

interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean };
}

export function ModalHeader({ title, subtitle, onBack, rightAction }: ModalHeaderProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  return (
    <View style={[styles.header, { backgroundColor: c.headerBg, paddingTop: isWeb ? 20 : insets.top + 8 }]}>
      <View style={styles.topLine} />
      <View style={styles.row}>
        {rightAction ? (
          <TouchableOpacity
            style={[styles.actionBtn, { opacity: rightAction.disabled ? 0.4 : 1 }]}
            onPress={rightAction.onPress}
            disabled={rightAction.disabled}
          >
            <Text style={styles.actionText}>{rightAction.loading ? "..." : rightAction.label}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}

        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: c.mutedForeground }]}>{subtitle}</Text>}
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={onBack ?? (() => router.back())}>
          <Feather name="x" size={22} color={c.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 14, paddingHorizontal: 16, position: "relative" },
  topLine: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: AMBER },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  backBtn: { padding: 6 },
  titleWrap: { alignItems: "center", flex: 1 },
  title: { fontSize: 17, fontFamily: "Tajawal_700Bold", textAlign: "center" },
  subtitle: { fontSize: 12, fontFamily: "Tajawal_400Regular", textAlign: "center", marginTop: 2 },
  actionBtn: {
    backgroundColor: AMBER, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, minWidth: 60, alignItems: "center",
  },
  actionText: { color: "#0a0500", fontFamily: "Tajawal_700Bold", fontSize: 14 },
});
