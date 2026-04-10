import colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

/**
 * Returns the design tokens for the current theme (light or dark).
 * Uses ThemeContext which supports system / light / dark with AsyncStorage persistence.
 */
export function useColors() {
  const { isDark } = useTheme();
  const palette = isDark ? colors.dark : colors.light;
  return { ...palette, isDark, radius: colors.radius };
}
