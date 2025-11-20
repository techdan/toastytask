// Recurrence Registry - Central source of truth for all recurrence patterns

import type { RepeatType } from "@/types";
import type { RecurrenceConfig } from "@/types/recurrence";
import { parseRecurrenceConfig, describeRecurrenceRule } from "@/types/recurrence";
import { calculateNextDueDate as calculateCustomDueDate } from "@/lib/recurrence/calculator";

/**
 * Recurrence rule definition
 */
export interface RecurrenceRuleDef {
  id: RepeatType;
  label: string;
  description: string;
  sortOrder: number;
  group: "common" | "extended" | "custom";

  /**
   * Calculate the next due date for this recurrence pattern
   * @param dueDate The current due date
   * @returns The next due date
   */
  calculateNext: (dueDate: Date) => Date;

  /**
   * Get display text for this recurrence pattern
   */
  getDisplayText: () => string;
}

/**
 * Helper: Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Helper: Add months to a date with overflow handling
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);

  // Handle month overflow (e.g., Jan 31 + 1 month = Feb 28/29, not Mar 3)
  if (result.getDate() !== originalDay) {
    result.setDate(0); // Go to last day of previous month
  }

  return result;
}

/**
 * Helper: Add years to a date with leap year handling
 */
function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  const originalMonth = result.getMonth();
  result.setFullYear(result.getFullYear() + years);

  // Handle leap year edge case (Feb 29 -> Feb 28 on non-leap years)
  if (result.getMonth() !== originalMonth) {
    result.setDate(0); // Go to last day of previous month (Feb 28)
  }

  return result;
}

/**
 * Recurrence Registry - All built-in patterns
 */
export const RECURRENCE_REGISTRY: Record<RepeatType, RecurrenceRuleDef> = {
  none: {
    id: "none",
    label: "Does not repeat",
    description: "Task does not recur",
    sortOrder: 0,
    group: "common",
    calculateNext: (_dueDate) => {
      throw new Error("Cannot calculate next due date for non-recurring task");
    },
    getDisplayText: () => "Does not repeat",
  },

  daily: {
    id: "daily",
    label: "Daily",
    description: "Repeats every day",
    sortOrder: 1,
    group: "common",
    calculateNext: (dueDate) => addDays(dueDate, 1),
    getDisplayText: () => "Daily",
  },

  weekly: {
    id: "weekly",
    label: "Weekly",
    description: "Repeats every week",
    sortOrder: 2,
    group: "common",
    calculateNext: (dueDate) => addDays(dueDate, 7),
    getDisplayText: () => "Weekly",
  },

  biweekly: {
    id: "biweekly",
    label: "Biweekly",
    description: "Repeats every 2 weeks",
    sortOrder: 3,
    group: "common",
    calculateNext: (dueDate) => addDays(dueDate, 14),
    getDisplayText: () => "Every 2 weeks",
  },

  monthly: {
    id: "monthly",
    label: "Monthly",
    description: "Repeats every month on the same day",
    sortOrder: 4,
    group: "common",
    calculateNext: (dueDate) => addMonths(dueDate, 1),
    getDisplayText: () => "Monthly",
  },

  semiannual: {
    id: "semiannual",
    label: "Semiannually",
    description: "Repeats every 6 months",
    sortOrder: 5,
    group: "extended",
    calculateNext: (dueDate) => addMonths(dueDate, 6),
    getDisplayText: () => "Every 6 months",
  },

  annual: {
    id: "annual",
    label: "Annually",
    description: "Repeats every year on the same date",
    sortOrder: 6,
    group: "extended",
    calculateNext: (dueDate) => addYears(dueDate, 1),
    getDisplayText: () => "Annually",
  },

  custom: {
    id: "custom",
    label: "Custom...",
    description: "Custom recurrence rule (advanced)",
    sortOrder: 99,
    group: "custom",
    calculateNext: () => {
      throw new Error("Custom recurrence requires parseAndCalculate with repeatRule");
    },
    getDisplayText: () => "Custom",
  },
};

/**
 * Get all recurrence options for display in UI (excludes "none")
 */
export function getRecurrenceOptions(): RecurrenceRuleDef[] {
  return Object.values(RECURRENCE_REGISTRY)
    .filter(rule => rule.id !== "none" && rule.id !== "custom") // Exclude none and custom for now
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get a recurrence rule by ID
 */
export function getRecurrenceRule(id: RepeatType): RecurrenceRuleDef {
  const rule = RECURRENCE_REGISTRY[id];
  if (!rule) {
    throw new Error(`Unknown recurrence type: ${id}`);
  }
  return rule;
}

/**
 * Calculate the next due date for a task
 * @param repeatType The recurrence pattern
 * @param currentDueDate The current due date
 * @returns The next due date
 */
export function calculateNextDueDate(
  repeatType: RepeatType,
  currentDueDate: Date
): Date {
  const rule = getRecurrenceRule(repeatType);
  return rule.calculateNext(currentDueDate);
}

/**
 * Check if a repeat type is a recurring pattern (not "none")
 */
export function isRecurring(repeatType: RepeatType): boolean {
  return repeatType !== "none";
}

/**
 * Get display text for a repeat type
 */
export function getRecurrenceDisplayText(repeatType: RepeatType): string {
  const rule = getRecurrenceRule(repeatType);
  return rule.getDisplayText();
}

/**
 * Parse and calculate next due date for custom recurrence rules
 * @param dueDate The current due date
 * @param repeatRule JSON string containing the custom recurrence config
 * @returns The next due date
 */
export function parseAndCalculate(dueDate: Date, repeatRule: string): Date {
  const config = parseRecurrenceConfig(repeatRule);

  // Use the custom calculation engine
  return calculateCustomDueDate(dueDate, config.rule);
}

/**
 * Get display text for custom recurrence rules
 * @param repeatRule JSON string containing the custom recurrence config
 * @returns Human-readable description
 */
export function getCustomRuleDisplayText(repeatRule: string): string {
  try {
    const config = parseRecurrenceConfig(repeatRule);
    return describeRecurrenceRule(config.rule);
  } catch (error) {
    return "Custom (invalid)";
  }
}
