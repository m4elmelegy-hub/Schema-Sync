import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatCard({ title, value, subtitle, icon, color, trend }: StatCardProps) {
  const c = useColors();
  const iconColor = color || c.primary;

  return (
    <View style={[styles.card, { backgroundColor: c.card, shadowColor: c.shadow }]}>
      <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
        <Feather name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.value, { color: c.text }]}>{value}</Text>
      <Text style={[styles.title, { color: c.mutedForeground }]}>{title}</Text>
      {subtitle ? (
        <View style={styles.subtitleRow}>
          {trend === "up" && <Feather name="trending-up" size={12} color={colors.light.success} />}
          {trend === "down" && <Feather name="trending-down" size={12} color={colors.light.destructive} />}
          <Text style={[styles.subtitle, {
            color: trend === "up" ? colors.light.success : trend === "down" ? colors.light.destructive : c.mutedForeground,
            marginRight: trend ? 4 : 0,
          }]}>{subtitle}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    flex: 1,
    minWidth: "45%",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    alignItems: "flex-end",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  value: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  subtitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: 4,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
