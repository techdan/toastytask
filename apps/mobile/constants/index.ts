/**
 * Design system constants index
 *
 * Centralized exports for the Toasty Task mobile design system
 */

// Export all colors
export * from "./colors";

// Export all typography
export * from "./typography";

// Export all spacing
export * from "./spacing";

// Export theme utilities (avoiding re-export conflicts with namespace exports)
export {
  type ColorScheme,
  type ThemeColors,
  type Theme,
  lightTheme,
  darkTheme,
  themes,
  useTheme,
  useColorScheme,
  useThemeColors,
  ThemeProvider,
  ThemeContext,
  sharedColors,
} from "./theme";
