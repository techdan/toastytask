/**
 * Typography tokens for the Toasty Task mobile app
 *
 * Derived from mobile-ui-spec.md
 */

import { TextStyle } from "react-native";

// Font sizes
export const fontSize = {
  xs: 10,
  sm: 11,
  md: 12,
  base: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
} as const;

// Line heights
export const lineHeight = {
  xs: 12,
  sm: 14,
  md: 16,
  base: 20,
  lg: 22,
  xl: 24,
  xxl: 28,
  xxxl: 32,
} as const;

// Font weights
export const fontWeight = {
  light: "300" as const,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
} as const;

// Pre-defined text styles
export const textStyles = {
  // Task title (16px, line height 22)
  taskTitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.regular,
  } as TextStyle,

  // Task title bold (for priority top/high and untouched)
  taskTitleBold: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.bold,
  } as TextStyle,

  // Task title light (for low priority)
  taskTitleLight: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.light,
  } as TextStyle,

  // Meta/secondary text (11px, line height 14)
  meta: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: fontWeight.regular,
  } as TextStyle,

  // Badge text (10px bold)
  badge: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  } as TextStyle,

  // Labels (14px semibold)
  label: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontWeight: fontWeight.semibold,
  } as TextStyle,

  // Body text (16px, line height 24)
  body: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.xl,
    fontWeight: fontWeight.regular,
  } as TextStyle,

  // Screen title
  screenTitle: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
  } as TextStyle,

  // Section header
  sectionHeader: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  } as TextStyle,

  // Button text
  button: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  } as TextStyle,

  // Small text
  small: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.regular,
  } as TextStyle,

  // Caption (very small, muted)
  caption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: fontWeight.regular,
  } as TextStyle,
} as const;
