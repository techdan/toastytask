/**
 * Theme configuration for the Toasty Task mobile app
 *
 * Provides light/dark theme support using React context
 */

import { createContext, useContext } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";
import * as colors from "./colors";
import * as typography from "./typography";
import * as spacing from "./spacing";

export type ColorScheme = "light" | "dark";

// Theme colors interface
export interface ThemeColors {
  // Backgrounds
  background: string;
  card: string;
  muted: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Borders
  border: string;
  borderMuted: string;

  // Priority text
  priorityTop: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;

  // Completed badge
  completedBadge: string;
}

// Light theme colors
export const lightTheme: ThemeColors = {
  background: colors.background.light.primary,
  card: colors.background.light.card,
  muted: colors.background.light.muted,

  text: colors.text.light.primary,
  textSecondary: colors.text.light.secondary,
  textMuted: colors.text.light.muted,
  textInverse: colors.text.light.inverse,

  border: colors.border.light.default,
  borderMuted: colors.border.light.muted,

  priorityTop: colors.priority.light.top,
  priorityHigh: colors.priority.light.high,
  priorityMedium: colors.priority.light.medium,
  priorityLow: colors.priority.light.low,

  completedBadge: colors.state.completedBadge.light,
};

// Dark theme colors
export const darkTheme: ThemeColors = {
  background: colors.background.dark.primary,
  card: colors.background.dark.card,
  muted: colors.background.dark.muted,

  text: colors.text.dark.primary,
  textSecondary: colors.text.dark.secondary,
  textMuted: colors.text.dark.muted,
  textInverse: colors.text.dark.inverse,

  border: colors.border.dark.default,
  borderMuted: colors.border.dark.muted,

  priorityTop: colors.priority.dark.top,
  priorityHigh: colors.priority.dark.high,
  priorityMedium: colors.priority.dark.medium,
  priorityLow: colors.priority.dark.low,

  completedBadge: colors.state.completedBadge.dark,
};

// Full theme object
export interface Theme {
  colorScheme: ColorScheme;
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
}

// Create themes
export const themes: Record<ColorScheme, Theme> = {
  light: {
    colorScheme: "light",
    colors: lightTheme,
    typography,
    spacing,
  },
  dark: {
    colorScheme: "dark",
    colors: darkTheme,
    typography,
    spacing,
  },
};

// Theme context
const ThemeContext = createContext<Theme>(themes.light);

// Hook to use theme
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// Hook to use color scheme (native or manual override)
export function useColorScheme(): ColorScheme {
  const systemScheme = useRNColorScheme();
  return systemScheme ?? "light";
}

// Hook to get theme colors
export function useThemeColors(): ThemeColors {
  const theme = useTheme();
  return theme.colors;
}

// Export context provider
export const ThemeProvider = ThemeContext.Provider;

// Export the context for direct access if needed
export { ThemeContext };

// Re-export all constants for convenience
export { colors, typography, spacing };

// Shared colors that don't change with theme
export const sharedColors = {
  brand: colors.brand,
  heat: colors.heat,
  star: colors.star,
  semantic: colors.semantic,
  checkbox: colors.checkbox,
  dueDate: colors.dueDate,
  swipe: colors.swipe,
  state: colors.state,
} as const;
