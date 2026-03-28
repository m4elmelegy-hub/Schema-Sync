import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useAppSettings } from "@/contexts/app-settings";

export function ThemeToggle() {
  const { settings, update } = useAppSettings();
  const isDark = (settings.theme ?? "dark") === "dark";

  return (
    <motion.button
      onClick={() => update({ theme: isDark ? "light" : "dark" })}
      whileTap={{ scale: 0.92 }}
      dir="ltr"
      aria-label={isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
      title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      className="relative flex items-center select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-full"
      style={{ width: 80, height: 36 }}
    >
      {/* Track */}
      <motion.div
        className="absolute inset-0 rounded-full transition-colors duration-500"
        animate={{
          backgroundColor: isDark ? "rgba(15,23,42,0.85)" : "rgba(241,245,249,0.92)",
          borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
        }}
        transition={{ duration: 0.35 }}
        style={{
          border: "1.5px solid",
          boxShadow: isDark
            ? "inset 0 2px 8px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)"
            : "inset 0 1px 4px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.08)",
        }}
      />

      {/* Moon icon — left */}
      <motion.div
        className="relative z-10 flex items-center justify-center"
        style={{ width: 36, height: 36 }}
        animate={{ opacity: isDark ? 1 : 0.35 }}
        transition={{ duration: 0.3 }}
      >
        <Moon
          size={14}
          className="transition-colors duration-300"
          style={{ color: isDark ? "#fcd34d" : "#94a3b8" }}
          strokeWidth={2.2}
        />
      </motion.div>

      {/* Sun icon — right */}
      <motion.div
        className="relative z-10 flex items-center justify-center"
        style={{ width: 36, height: 36 }}
        animate={{ opacity: isDark ? 0.35 : 1 }}
        transition={{ duration: 0.3 }}
      >
        <Sun
          size={14}
          className="transition-colors duration-300"
          style={{ color: isDark ? "#64748b" : "#f59e0b" }}
          strokeWidth={2.2}
        />
      </motion.div>

      {/* Sliding knob */}
      <motion.div
        className="absolute z-20 rounded-full"
        animate={{ left: isDark ? 3 : 43 }}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.75 }}
        style={{
          top: 3,
          width: 28,
          height: 28,
          background: "white",
          boxShadow: isDark
            ? "0 2px 10px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.35)"
            : "0 2px 8px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10)",
        }}
      />
    </motion.button>
  );
}
