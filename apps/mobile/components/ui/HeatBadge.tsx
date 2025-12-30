/**
 * HeatBadge Component
 *
 * Displays heat (0-145) or importance (2-14) score as a colored badge.
 * Tappable to toggle between heat and importance display modes.
 */

import { View, Text, StyleSheet, Pressable } from "react-native";
import {
  getHeatColor,
  getImportanceColor,
  state,
} from "@/constants/colors";
import {
  componentSize,
  borderRadius,
} from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

export type BadgeMode = "heat" | "importance";

interface HeatBadgeProps {
  /** Heat score (0-145 scale) */
  heat: number;
  /** Importance score (2-14 scale) */
  importance: number;
  /** Current display mode */
  mode: BadgeMode;
  /** Whether the task is completed (muted styling) */
  isCompleted?: boolean;
  /** Callback when badge is tapped (to toggle mode) */
  onPress?: () => void;
}

export function HeatBadge({
  heat,
  importance,
  mode,
  isCompleted = false,
  onPress,
}: HeatBadgeProps) {
  const themeColors = useThemeColors();

  const isHeatMode = mode === "heat";
  const displayValue = isHeatMode ? Math.round(heat) : Math.round(importance);
  const backgroundColor = isCompleted
    ? themeColors.completedBadge
    : isHeatMode
      ? getHeatColor(heat)
      : getImportanceColor(importance);
  const textColor = isCompleted ? themeColors.textMuted : "#ffffff";

  // Heat badge is slightly wider for 3-digit numbers
  const badgeWidth = isHeatMode
    ? componentSize.heatBadgeWidth
    : componentSize.importanceBadgeSize;
  const badgeHeight = componentSize.heatBadgeHeight;

  const badge = (
    <View
      style={[
        styles.badge,
        {
          backgroundColor,
          width: badgeWidth,
          height: badgeHeight,
        },
      ]}
    >
      <Text style={[styles.text, { color: textColor }]}>{displayValue}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8}>
        {badge}
      </Pressable>
    );
  }

  return badge;
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: borderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    ...textStyles.badge,
    color: "#ffffff",
  },
});
