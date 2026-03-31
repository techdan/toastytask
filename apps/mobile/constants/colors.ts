/**
 * Color tokens for the Toasty Task mobile app
 *
 * Derived from mobile-ui-spec.md and web app implementation
 */

// Brand colors
export const brand = {
  primary: "#f24c05",
  primaryLight: "#fca67a",
} as const;

// Heat/Importance badge colors (0-145 heat scale, 2-14 importance scale)
export const heat = {
  blue: "#60A5FA", // 0-8 heat, 2-3 importance
  green: "#4ADE80", // 9-24 heat, 4-5 importance
  yellow: "#FACC15", // 25-48 heat, 6-8 importance
  orange: "#FB923C", // 49-71 heat, 9-11 importance
  red: "#F87171", // 72-145 heat, 12-14 importance
} as const;

// Heat thresholds for color selection
export const heatThresholds = {
  blue: { max: 8 },
  green: { max: 24 },
  yellow: { max: 48 },
  orange: { max: 71 },
  // red: anything above 71
} as const;

// Importance thresholds for color selection
export const importanceThresholds = {
  blue: { max: 3 },
  green: { max: 5 },
  yellow: { max: 8 },
  orange: { max: 11 },
  // red: 12-14
} as const;

// Star level colors
export const star = {
  none: "#9ca3af", // Level 0 - gray
  blue: "#60A5FA", // Level 1
  yellow: "#FACC15", // Level 2
  orange: "#FB923C", // Level 3
} as const;

// Priority text colors
export const priority = {
  light: {
    top: "#990000",
    high: "#344C63",
    medium: "#1f2937", // default text
    low: "#6b7280", // muted
  },
  dark: {
    top: "#DD5555",
    high: "#7A9EC6",
    medium: "#f3f4f6", // default text dark
    low: "#9ca3af", // muted dark
  },
} as const;

// Semantic colors
export const semantic = {
  success: "#10b981",
  error: "#dc2626",
  warning: "#f59e0b",
  info: "#3b82f6",
} as const;

// Checkbox colors
export const checkbox = {
  unchecked: "#d1d5db",
  checked: "#10b981",
  checkmark: "#ffffff",
} as const;

// Due date colors
export const dueDate = {
  overdueBg: "#ef4444",
  overdueText: "#ffffff",
  today: "#1f2937",
  normal: "#6b7280",
} as const;

// Background colors
export const background = {
  light: {
    primary: "#f9fafb",
    card: "#ffffff",
    muted: "#f3f4f6",
  },
  dark: {
    primary: "#111111",
    card: "#1a1a1a",
    muted: "#242424",
  },
} as const;

// Text colors
export const text = {
  light: {
    primary: "#1f2937",
    secondary: "#6b7280",
    muted: "#9ca3af",
    inverse: "#ffffff",
  },
  dark: {
    primary: "#f3f4f6",
    secondary: "#d1d5db",
    muted: "#9ca3af",
    inverse: "#1f2937",
  },
} as const;

// Border colors
export const border = {
  light: {
    default: "#e5e7eb",
    muted: "#f3f4f6",
  },
  dark: {
    default: "#2a2a2a",
    muted: "#222222",
  },
} as const;

// Swipe action colors
export const swipe = {
  heat: "#FB923C", // orange for heat action
  cool: "#60A5FA", // blue for cool action
} as const;

// Special state colors
export const state = {
  untouched: "#4ADE80", // green for new/untouched tasks
  focused: "rgba(74, 222, 128, 0.1)", // subtle green tint for focused tasks
  completed: {
    background: "rgba(0, 0, 0, 0.05)",
    text: "#9ca3af",
  },
  completedBadge: {
    light: "#e5e7eb",
    dark: "#404040",
  },
} as const;

// Utility function to get heat color based on heat value
export function getHeatColor(heatValue: number): string {
  if (heatValue <= heatThresholds.blue.max) return heat.blue;
  if (heatValue <= heatThresholds.green.max) return heat.green;
  if (heatValue <= heatThresholds.yellow.max) return heat.yellow;
  if (heatValue <= heatThresholds.orange.max) return heat.orange;
  return heat.red;
}

// Utility function to get importance color based on importance value
export function getImportanceColor(importanceValue: number): string {
  if (importanceValue <= importanceThresholds.blue.max) return heat.blue;
  if (importanceValue <= importanceThresholds.green.max) return heat.green;
  if (importanceValue <= importanceThresholds.yellow.max) return heat.yellow;
  if (importanceValue <= importanceThresholds.orange.max) return heat.orange;
  return heat.red;
}

// Utility function to get star color based on level
export function getStarColor(level: number): string {
  switch (level) {
    case 1:
      return star.blue;
    case 2:
      return star.yellow;
    case 3:
      return star.orange;
    default:
      return star.none;
  }
}
