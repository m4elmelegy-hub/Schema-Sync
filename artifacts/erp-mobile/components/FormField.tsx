import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
  suffix?: string;
}

export function FormField({ label, error, required, suffix, style, ...props }: FormFieldProps) {
  const c = useColors();
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: c.mutedForeground }]}>
        {label} {required && <Text style={{ color: "#F59E0B" }}>*</Text>}
      </Text>
      <View style={[styles.row, { backgroundColor: c.card, borderColor: error ? "#EF4444" : c.border }]}>
        {suffix && <Text style={[styles.suffix, { color: c.mutedForeground }]}>{suffix}</Text>}
        <TextInput
          style={[styles.input, { color: c.text }, style]}
          placeholderTextColor={c.mutedForeground}
          textAlign="right"
          {...props}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { fontSize: 13, fontFamily: "Tajawal_500Medium", textAlign: "right", marginBottom: 6 },
  row: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Tajawal_400Regular", paddingVertical: 12 },
  suffix: { fontSize: 13, fontFamily: "Tajawal_400Regular", paddingLeft: 8 },
  error: { fontSize: 12, color: "#EF4444", fontFamily: "Tajawal_400Regular", textAlign: "right", marginTop: 4 },
});
