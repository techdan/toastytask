export const logoColorConfig = {
  light: {
    favicon: "#f24c05",
    toast: "#f24c05",
    check: "#f24c05",
    titleToasty: "#f24c05",
    titleTask: "#f24c05",
  },
  dark: {
    favicon: "#c4c9cc",
    toast: "#c4c9cc",
    check: "#c4c9cc",
    titleToasty: "#c4c9cc",
    titleTask: "#c4c9cc",
  },
} as const;

export type LogoColorMode = keyof typeof logoColorConfig;

export function getLogoColorMode(theme?: string | null) {
  if (theme === "dark") {
    return "dark";
  }
  return "light";
}
