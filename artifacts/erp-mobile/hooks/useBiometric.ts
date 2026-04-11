import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BIOMETRIC_ENABLED_KEY = "biometric_enabled";
const BIOMETRIC_CREDS_KEY = "biometric_creds";

export interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
  type: "fingerprint" | "face" | "iris" | "none";
  enabled: boolean;
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const isWeb = Platform.OS === "web";
  if (isWeb) return { available: false, enrolled: false, type: "none", enabled: false };

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

  let type: BiometricStatus["type"] = "none";
  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    type = "face";
  } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    type = "fingerprint";
  } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    type = "iris";
  }

  const enabledFlag = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
  const enabled = enabledFlag === "true" && hasHardware && isEnrolled;

  return { available: hasHardware, enrolled: isEnrolled, type, enabled };
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? "true" : "false");
}

export async function saveBiometricCredentials(username: string, pin: string): Promise<void> {
  const data = JSON.stringify({ username, pin });
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(BIOMETRIC_CREDS_KEY, data);
  } else {
    await SecureStore.setItemAsync(BIOMETRIC_CREDS_KEY, data);
  }
}

export async function getBiometricCredentials(): Promise<{ username: string; pin: string } | null> {
  try {
    let raw: string | null;
    if (Platform.OS === "web") {
      raw = await AsyncStorage.getItem(BIOMETRIC_CREDS_KEY);
    } else {
      raw = await SecureStore.getItemAsync(BIOMETRIC_CREDS_KEY);
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  if (Platform.OS !== "web") {
    await SecureStore.deleteItemAsync(BIOMETRIC_CREDS_KEY);
  } else {
    await AsyncStorage.removeItem(BIOMETRIC_CREDS_KEY);
  }
}

export async function authenticateWithBiometric(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "تأكيد الهوية للدخول",
    cancelLabel: "إلغاء",
    disableDeviceFallback: false,
  });
  return result.success;
}
