import { Platform, TextStyle, ViewStyle } from "react-native";

/**
 * Broadsheet tokens for NutriAgent AI, mirrored from the design handoff.
 * Source Serif 4 is not bundled in the Expo app, so the nearest platform
 * serif carries the newsprint character.
 */
export const colors = {
  bg: "#f6f5f3",
  surface: "#ffffff",
  divider: "#e7e4df",
  text: "#2a2420",
  neutral100: "#f5f3f0",
  neutral200: "#eae7e2",
  neutral300: "#ddd8d0",
  neutral400: "#b3aca1",
  neutral500: "#8a8378",
  neutral800: "#3a322b",
  accent: "#2e9e5b",
  accent100: "#e1f2e7",
  accent200: "#c9e8d4",
  accent600: "#26884d",
  accent700: "#1f7040",
  accent800: "#184f2f",
  accent2: "#d6006c",
  accent2100: "#fbe1ec",
  accent2700: "#a3004f",
};

/** Text colour mixed down against the ground (color-mix has no RN equivalent). */
export const textMuted = {
  50: "#948c85",
  55: "#8b837c",
  60: "#827a73",
  70: "#6f6760",
};

export const space = {
  1: 6,
  2: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export const fonts = {
  heading: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }),
  body: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }),
};

export const shadow: Record<"sm" | "md" | "lg", ViewStyle> = {
  sm: {
    shadowColor: "#1e1914",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: "#1e1914",
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  lg: {
    shadowColor: "#1e1914",
    shadowOpacity: 0.14,
    shadowRadius: 44,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
};

export function serif(size: number, extra?: TextStyle): TextStyle {
  return { fontFamily: fonts.heading, fontWeight: "600", fontSize: size, color: colors.text, ...extra };
}

/** Ring palette used by the flower-node nutrition graphic. */
export const ringColors: Record<string, string> = {
  Protein: "#6b6b6b",
  "Sat. fat": "#3fa15c",
  Sodium: "#d98a3d",
  Sugar: "#d98a3d",
  Fiber: "#2f9d95",
  Fat: "#d6437e",
  Carbs: "#4a90d9",
};
