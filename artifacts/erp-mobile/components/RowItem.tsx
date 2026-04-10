import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface RowItemProps {
  title: string;
  subtitle?: string;
  right?: string;
  rightColor?: string;
  badge?: string;
  badgeColor?: string;
  onPress?: () => void;
  showArrow?: boolean;
}

export function RowItem({ title, subtitle, right, rightColor, badge, badgeColor, onPress, showArrow = true }: RowItemProps) {
  const c = useColors();

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        {showArrow && <Feather name="chevron-left" size={18} color={c.mutedForeground} />}
      </View>
      <View style={styles.center}>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: (badgeColor || c.primary) + "18" }]}>
            <Text style={[styles.badgeText, { color: badgeColor || c.primary }]}>{badge}</Text>
          </View>
        ) : null}
        {right ? <Text style={[styles.right, { color: rightColor || c.primary }]}>{right}</Text> : null}
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: c.mutedForeground }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
    alignItems: "flex-end",
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    textAlign: "right",
  },
  center: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  left: {
    marginLeft: 4,
  },
  right: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
