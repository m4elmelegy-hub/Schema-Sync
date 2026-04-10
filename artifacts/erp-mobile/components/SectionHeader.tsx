import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

interface SectionHeaderProps {
  title: string;
  color?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: keyof typeof Feather.glyphMap;
}

export function SectionHeader({ title, color, actionLabel, onAction, actionIcon }: SectionHeaderProps) {
  const c = useColors();
  const dotColor = color || COLORS.primary;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {actionLabel && onAction ? (
          <TouchableOpacity style={styles.action} onPress={onAction} activeOpacity={0.7}>
            {actionIcon ? <Feather name={actionIcon} size={14} color={dotColor} /> : null}
            <Text style={[styles.actionText, { color: dotColor }]}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: c.mutedForeground }]}>{title}</Text>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    marginRight: 4,
    marginLeft: 4,
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  dot: { width: 3, height: 14, borderRadius: 2 },
  title: { fontSize: 12, fontFamily: "Tajawal_500Medium" },
  left: { flexDirection: "row-reverse", alignItems: "center" },
  action: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
});
