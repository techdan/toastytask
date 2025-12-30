/**
 * PriorityText Component
 *
 * Text component that applies priority-based styling:
 * - top: bold, dark red
 * - high: bold, blue-gray
 * - medium: regular weight, default color
 * - low: light weight, muted color
 *
 * Special states override priority styling:
 * - New/untouched: bold green
 * - Completed: strikethrough, italic, muted
 */

import { Text, StyleSheet, TextStyle } from "react-native";
import { state } from "@/constants/colors";
import { textStyles, fontWeight } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";
import type { Priority } from "@toasty/contracts";

interface PriorityTextProps {
  /** The text content */
  children: React.ReactNode;
  /** Task priority level */
  priority: Priority;
  /** Whether the task is new/untouched (overrides priority styling) */
  isNew?: boolean;
  /** Whether the task is completed (overrides priority styling) */
  isCompleted?: boolean;
  /** Maximum number of lines before truncating */
  numberOfLines?: number;
  /** Additional style overrides */
  style?: TextStyle;
}

export function PriorityText({
  children,
  priority,
  isNew = false,
  isCompleted = false,
  numberOfLines,
  style,
}: PriorityTextProps) {
  const themeColors = useThemeColors();

  // Completed state overrides everything
  if (isCompleted) {
    return (
      <Text
        style={[
          styles.base,
          styles.completed,
          { color: state.completed.text },
          style,
        ]}
        numberOfLines={numberOfLines}
      >
        {children}
      </Text>
    );
  }

  // New/untouched state overrides priority
  if (isNew) {
    return (
      <Text
        style={[styles.base, styles.newTask, style]}
        numberOfLines={numberOfLines}
      >
        {children}
      </Text>
    );
  }

  // Priority-based styling
  const priorityStyle = getPriorityStyle(priority, themeColors);

  return (
    <Text
      style={[styles.base, priorityStyle, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

/**
 * Get text style based on priority
 */
function getPriorityStyle(
  priority: Priority,
  themeColors: ReturnType<typeof useThemeColors>
): TextStyle {
  switch (priority) {
    case "top":
      return {
        fontWeight: fontWeight.bold,
        color: themeColors.priorityTop,
      };
    case "high":
      return {
        fontWeight: fontWeight.bold,
        color: themeColors.priorityHigh,
      };
    case "medium":
      return {
        fontWeight: fontWeight.regular,
        color: themeColors.priorityMedium,
      };
    case "low":
      return {
        fontWeight: fontWeight.light,
        color: themeColors.priorityLow,
      };
    default:
      return {
        fontWeight: fontWeight.regular,
        color: themeColors.priorityMedium,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    ...textStyles.taskTitle,
  },
  completed: {
    textDecorationLine: "line-through",
    fontStyle: "italic",
  },
  newTask: {
    fontWeight: fontWeight.bold,
    color: state.untouched,
  },
});

/**
 * Export utility function for external use
 */
export { getPriorityStyle };
