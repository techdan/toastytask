/**
 * Spacing tokens for the Toasty Task mobile app
 *
 * Derived from mobile-ui-spec.md
 */

// Base spacing scale (in pixels)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Border radius scale
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Component-specific sizing
export const componentSize = {
  // Checkbox
  checkbox: 24,
  checkboxBorder: 2,

  // Heat badge
  heatBadgeWidth: 26, // for 3-digit numbers
  heatBadgeHeight: 20,

  // Importance badge (smaller, max 2 digits)
  importanceBadgeSize: 20,

  // Star button
  starIcon: 20,
  starTouchTarget: 40,

  // Color strip (left edge indicator)
  colorStripWidth: 4,

  // FAB (Floating Action Button)
  fabSize: 56,
  fabIconSize: 24,

  // Tab bar
  tabBarHeight: 60,
  tabBarIconSize: 24,

  // Notes icon
  notesIconSize: 16,

  // Project color dot
  colorDotSize: 10,
} as const;

// Layout constants
export const layout = {
  // Screen padding
  screenPadding: spacing.lg,

  // Card/list item
  cardPadding: spacing.md,
  cardMarginBottom: spacing.sm,
  cardBorderRadius: borderRadius.lg,

  // Task list item
  taskItemPaddingCompact: spacing.xs,
  taskItemPaddingComfortable: spacing.md,

  // Safe area insets (approximations, actual values from useSafeAreaInsets)
  safeAreaTop: 44,
  safeAreaBottom: 34,

  // FAB positioning
  fabBottom: 20,
  fabRight: 16,

  // Modal
  modalPadding: spacing.lg,
  modalBorderRadius: borderRadius.xl,

  // Bottom sheet
  bottomSheetHandle: 4,
  bottomSheetHandleWidth: 40,

  // Settings
  settingRowHeight: 48,
} as const;

// Shadow definitions (for React Native)
export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;
