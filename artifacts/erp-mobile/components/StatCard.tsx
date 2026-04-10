import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

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
  const iconColor = color || "#F59E0B";

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.value, { color: c.text }]}>{value}</Text>
      <Text style={[styles.title, { color: c.mutedForeground }]}>{title}</Text>
      {subtitle ? (
        <View style={styles.subtitleRow}>
          {trend === "up" && <Feather name="trending-up" size={11} color="#10B981" />}
          {trend === "down" && <Feather name="trending-down" size={11} color="#EF4444" />}
          <Text style={[styles.subtitle, {
            color: trend === "up" ? "#10B981" : trend === "down" ? "#EF4444" : c.mutedForeground,
            marginRight: trend ? 4 : 0,
          }]}>{subtitle}</Text>
        </View>
      ) : null}
      {/* خط سفلي ملون */}
      <View style={[styles.bottomLine, { backgroundColor: iconColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    flex: 1,
    minWidth: "45%",
    borderWidth: 1,
    alignItems: "flex-end",
    position: "relative",
    overflow: "hidden",
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
    marginBottom: 12,
  },
  value: {
    fontSize: 20,
    fontFamily: "Tajawal_700Bold",
    textAlign: "right",
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    fontFamily: "Tajawal_400Regular",
    textAlign: "right",
  },
  subtitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: 4,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: "Tajawal_500Medium",
  },
  bottomLine: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: 2,
    opacity: 0.6,
  },
});
