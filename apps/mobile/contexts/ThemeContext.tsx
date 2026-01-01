/**
 * Theme Context
 *
 * Provides theme state to the entire app, respecting the user's theme preference
 * from AppSettings (light, dark, or system).
 */

import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";
import { themes, type Theme, type ColorScheme } from "@/constants/theme";

/**
 * Context value for resolved theme
 */
interface ThemeContextValue {
  theme: Theme;
  colorScheme: ColorScheme;
  systemColorScheme: ColorScheme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeContextProviderProps {
  children: ReactNode;
  /** The user's theme preference from settings */
  themeSetting: "light" | "dark" | "system";
}

/**
 * Provider that resolves the theme based on user preference and system setting
 */
export function ThemeContextProvider({ children, themeSetting }: ThemeContextProviderProps) {
  const systemScheme = useRNColorScheme();
  const systemColorScheme: ColorScheme = systemScheme ?? "light";

  const value = useMemo(() => {
    // Resolve the actual color scheme based on user preference
    let resolvedScheme: ColorScheme;

    if (themeSetting === "system") {
      resolvedScheme = systemColorScheme;
    } else {
      resolvedScheme = themeSetting;
    }

    return {
      theme: themes[resolvedScheme],
      colorScheme: resolvedScheme,
      systemColorScheme,
    };
  }, [themeSetting, systemColorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access the resolved theme context
 */
export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useThemeContext must be used within a ThemeContextProvider");
  }
  return context;
}

/**
 * Hook to get just the resolved color scheme
 */
export function useResolvedColorScheme(): ColorScheme {
  const { colorScheme } = useThemeContext();
  return colorScheme;
}
