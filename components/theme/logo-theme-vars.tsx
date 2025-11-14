"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { getLogoColorMode, logoColorConfig } from "@/lib/logo-color-config";

export function LogoThemeVars() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const mode = getLogoColorMode(resolvedTheme);
    const colors = logoColorConfig[mode];
    const root = document.documentElement;

    root.style.setProperty("--logo-toast", colors.toast);
    root.style.setProperty("--logo-check", colors.check);
    root.style.setProperty("--logo-line", colors.toast);
    root.style.setProperty("--logo-title-toasty", colors.titleToasty);
    root.style.setProperty("--logo-title-task", colors.titleTask);
  }, [resolvedTheme]);

  return null;
}
