/**
 * DueDateDisplay Component
 *
 * Displays a task's due date with smart formatting:
 * - "Today", "Tomorrow" for nearby dates
 * - "Jan 5" for same year
 * - "Jan 5 '26" for different year
 * - Red pill for overdue dates
 * - "No Due Date" in muted text when no date set
 */

import { View, Text, StyleSheet } from "react-native";
import { dueDate as dueDateColors } from "@/constants/colors";
import { textStyles } from "@/constants/typography";
import { borderRadius, spacing } from "@/constants/spacing";
import { useThemeColors } from "@/constants/theme";

interface DueDateDisplayProps {
  /** Due date (null if not set) */
  dueAt: Date | string | null;
  /** Whether the task is completed (no special overdue styling) */
  isCompleted?: boolean;
  /** Size variant */
  size?: "small" | "normal";
}

/**
 * Format a date for display
 */
function formatDueDate(
  date: Date,
  isOverdue: boolean,
  isToday: boolean,
  isTomorrow: boolean
): string {
  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";

  const now = new Date();
  const currentYear = now.getFullYear();
  const dateYear = date.getFullYear();

  const month = date.toLocaleDateString(undefined, { month: "short" });
  const day = date.getDate();

  if (dateYear !== currentYear) {
    const yearSuffix = `'${String(dateYear).slice(-2)}`;
    return `${month} ${day} ${yearSuffix}`;
  }

  return `${month} ${day}`;
}

/**
 * Check if date is today
 */
function checkIsToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Check if date is tomorrow
 */
function checkIsTomorrow(date: Date): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  );
}

/**
 * Check if date is overdue (before today)
 */
function checkIsOverdue(date: Date): boolean {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  return dateStart < todayStart;
}

export function DueDateDisplay({
  dueAt,
  isCompleted = false,
  size = "normal",
}: DueDateDisplayProps) {
  const themeColors = useThemeColors();

  // No due date case
  if (!dueAt) {
    return (
      <Text
        style={[
          size === "small" ? styles.textSmall : styles.text,
          { color: themeColors.textMuted },
        ]}
      >
        No Due Date
      </Text>
    );
  }

  // Parse date
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;

  // Check date states
  const isToday = checkIsToday(date);
  const isTomorrow = checkIsTomorrow(date);
  const isOverdue = !isCompleted && checkIsOverdue(date);

  // Format the date text
  const dateText = formatDueDate(date, isOverdue, isToday, isTomorrow);

  // Overdue styling (red pill)
  if (isOverdue) {
    return (
      <View style={styles.overduePill}>
        <Text
          style={[
            size === "small" ? styles.textSmall : styles.text,
            styles.overdueText,
          ]}
        >
          {dateText}
        </Text>
      </View>
    );
  }

  // Today/Tomorrow styling (bold)
  if (isToday || isTomorrow) {
    return (
      <Text
        style={[
          size === "small" ? styles.textSmall : styles.text,
          styles.boldText,
          { color: themeColors.text },
        ]}
      >
        {dateText}
      </Text>
    );
  }

  // Normal date
  return (
    <Text
      style={[
        size === "small" ? styles.textSmall : styles.text,
        { color: themeColors.textSecondary },
      ]}
    >
      {dateText}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...textStyles.meta,
  },
  textSmall: {
    ...textStyles.caption,
  },
  boldText: {
    fontWeight: "600",
  },
  overduePill: {
    backgroundColor: dueDateColors.overdueBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  overdueText: {
    color: dueDateColors.overdueText,
    fontWeight: "500",
  },
});
