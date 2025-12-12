/**
 * Custom Recurrence Calculation Engine
 *
 * Implements date calculation for all custom recurrence rule types.
 * Handles edge cases: month overflow, leap years, last day of month.
 */

import type {
  RecurrenceRule,
  IntervalRule,
  MonthlyWeekdayRule,
  WeeklyPatternRule,
  SpecialWeekdayRule,
} from "@/types/recurrence";

/**
 * Main entry point: Calculate next due date based on custom rule
 */
export function calculateNextDueDate(
  dueDate: Date,
  rule: RecurrenceRule
): Date {
  switch (rule.ruleType) {
    case "interval":
      return calculateInterval(dueDate, rule);
    case "monthlyByWeekday":
      return calculateMonthlyWeekday(dueDate, rule);
    case "weeklyPattern":
      return calculateWeeklyPattern(dueDate, rule);
    case "specialPattern":
      return calculateSpecialPattern(dueDate, rule);
  }
}

/**
 * Format 1: "Every X T" (interval-based)
 * Examples: "Every 3 days", "Every 2 weeks", "Every 16 weeks"
 */
function calculateInterval(date: Date, rule: IntervalRule): Date {
  const result = new Date(date);

  switch (rule.unit) {
    case "day":
      result.setDate(result.getDate() + rule.amount);
      break;

    case "week":
      result.setDate(result.getDate() + rule.amount * 7);
      break;

    case "month":
      // Handle month overflow properly (Jan 31 + 1 month = Feb 28/29, not Mar 3)
      result.setMonth(result.getMonth() + rule.amount);
      // If day of month changed due to overflow, set to last day of target month
      if (result.getDate() !== date.getDate()) {
        result.setDate(0); // Set to last day of previous month
      }
      break;

    case "year":
      // Handle leap year edge case (Feb 29 → Feb 28 on non-leap years)
      const targetYear = result.getFullYear() + rule.amount;
      result.setFullYear(targetYear);
      // If date changed (Feb 29 → Mar 1 on non-leap year), fix it
      if (result.getDate() !== date.getDate()) {
        result.setDate(0); // Set to Feb 28
      }
      break;
  }

  return result;
}

/**
 * Format 2: "On the X D of each month" (monthly by weekday)
 * Examples: "2nd Monday", "Last Friday", "3rd Saturday"
 */
function calculateMonthlyWeekday(
  date: Date,
  rule: MonthlyWeekdayRule
): Date {
  const targetWeekday = rule.weekday;
  let result = new Date(date);

  // Move to next month
  result.setMonth(result.getMonth() + 1);
  result.setDate(1); // Start at first day of month

  if (rule.ordinal === "last") {
    // Find last occurrence of weekday in month
    // Start from last day of month and work backwards
    result.setMonth(result.getMonth() + 1); // Go to next month
    result.setDate(0); // Back to last day of target month

    // Find the last occurrence of target weekday
    const lastDayWeekday = result.getDay();
    const daysToSubtract =
      lastDayWeekday >= targetWeekday
        ? lastDayWeekday - targetWeekday
        : 7 - (targetWeekday - lastDayWeekday);

    result.setDate(result.getDate() - daysToSubtract);
  } else {
    // Find Nth occurrence (first, second, third, fourth, or numeric)
    const ordinalNum =
      typeof rule.ordinal === "string"
        ? { first: 1, second: 2, third: 3, fourth: 4 }[rule.ordinal]!
        : rule.ordinal;

    // Find first occurrence of target weekday
    const firstDayWeekday = result.getDay();
    const daysToAdd =
      targetWeekday >= firstDayWeekday
        ? targetWeekday - firstDayWeekday
        : 7 - (firstDayWeekday - targetWeekday);

    result.setDate(1 + daysToAdd);

    // Add weeks to get to Nth occurrence
    result.setDate(result.getDate() + (ordinalNum - 1) * 7);

    // Validate: if we've moved to next month, the Nth occurrence doesn't exist
    // In this case, fall back to last occurrence
    if (result.getMonth() !== (date.getMonth() + 1) % 12) {
      // Reset to target month's last day
      result = new Date(date);
      result.setMonth(result.getMonth() + 1);
      result.setMonth(result.getMonth() + 1);
      result.setDate(0);

      // Find last occurrence
      const lastDayWeekday = result.getDay();
      const daysToSubtract =
        lastDayWeekday >= targetWeekday
          ? lastDayWeekday - targetWeekday
          : 7 - (targetWeekday - lastDayWeekday);

      result.setDate(result.getDate() - daysToSubtract);
    }
  }

  return result;
}

/**
 * Format 3: "Every W" (weekly pattern)
 * Examples: "Mon/Wed/Fri", "Tue/Thu"
 */
function calculateWeeklyPattern(
  date: Date,
  rule: WeeklyPatternRule
): Date {
  const result = new Date(date);
  const currentWeekday = result.getDay();

  // Sort days to make finding next occurrence easier
  const sortedDays = [...rule.days].sort((a, b) => a - b);

  // Find next day in pattern
  let nextDay = sortedDays.find((day) => day > currentWeekday);

  if (nextDay === undefined) {
    // No day later this week, wrap to first day next week
    nextDay = sortedDays[0]!;
    const daysToAdd = 7 - currentWeekday + nextDay;
    result.setDate(result.getDate() + daysToAdd);
  } else {
    // Found a day later this week
    const daysToAdd = nextDay - currentWeekday;
    result.setDate(result.getDate() + daysToAdd);
  }

  return result;
}

/**
 * Special pattern for weekdays/weekends
 * Examples: "Every weekday (Mon-Fri)", "Every weekend (Sat-Sun)"
 */
function calculateSpecialPattern(
  date: Date,
  rule: SpecialWeekdayRule
): Date {
  const result = new Date(date);
  const currentWeekday = result.getDay();

  if (rule.pattern === "weekdays") {
    // Weekdays: Mon (1) - Fri (5)
    if (currentWeekday === 5) {
      // Friday → Monday (add 3 days)
      result.setDate(result.getDate() + 3);
    } else if (currentWeekday === 6) {
      // Saturday → Monday (add 2 days)
      result.setDate(result.getDate() + 2);
    } else {
      // Any other day → next day (add 1 day)
      result.setDate(result.getDate() + 1);
    }
  } else {
    // Weekends: Sat (6) - Sun (0)
    if (currentWeekday === 6) {
      // Saturday → Sunday (add 1 day)
      result.setDate(result.getDate() + 1);
    } else {
      // Any other day → next Saturday
      const daysToAdd = 6 - currentWeekday;
      result.setDate(result.getDate() + daysToAdd);
    }
  }

  return result;
}


