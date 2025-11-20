/**
 * Custom Recurrence Rules Type System
 *
 * Defines TypeScript types for advanced custom recurrence patterns.
 * These types are stored as JSON in the `repeatRule` database field.
 */

/**
 * Format 1: "Every X T" (interval-based)
 * Examples: "Every 3 days", "Every 2 weeks", "Every 16 weeks"
 */
export interface IntervalRule {
  ruleType: "interval";
  amount: number; // e.g., 3
  unit: "day" | "week" | "month" | "year"; // e.g., "weeks"
}

/**
 * Format 2: "On the X D of each month" (monthly by weekday)
 * Examples: "On the 2nd Monday", "On the last Friday", "On the 3rd Saturday"
 */
export interface MonthlyWeekdayRule {
  ruleType: "monthlyByWeekday";
  ordinal: "first" | "second" | "third" | "fourth" | "last" | number;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday, 6=Saturday
}

/**
 * Format 3: "Every W" (weekly pattern)
 * Examples: "Every Monday", "Every Tue & Thu", "Mon/Wed/Fri"
 */
export interface WeeklyPatternRule {
  ruleType: "weeklyPattern";
  days: number[]; // e.g., [1, 3, 5] for Mon/Wed/Fri
}

/**
 * Special case for weekdays/weekends
 * Examples: "Every weekday", "Every weekend"
 */
export interface SpecialWeekdayRule {
  ruleType: "specialPattern";
  pattern: "weekdays" | "weekends";
}

/**
 * Union type for all recurrence rules
 */
export type RecurrenceRule =
  | IntervalRule
  | MonthlyWeekdayRule
  | WeeklyPatternRule
  | SpecialWeekdayRule;

/**
 * Wrapper configuration stored in repeatRule field
 */
export interface RecurrenceConfig {
  rule: RecurrenceRule;
  fromCompletion?: boolean; // Optional: repeat from completion vs. due date
}

/**
 * Type guard to validate RecurrenceRule
 */
export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const rule = value as Record<string, unknown>;

  switch (rule.ruleType) {
    case "interval":
      return (
        typeof rule.amount === "number" &&
        rule.amount > 0 &&
        ["day", "week", "month", "year"].includes(rule.unit as string)
      );

    case "monthlyByWeekday":
      return (
        (["first", "second", "third", "fourth", "last"].includes(
          rule.ordinal as string
        ) ||
          typeof rule.ordinal === "number") &&
        typeof rule.weekday === "number" &&
        rule.weekday >= 0 &&
        rule.weekday <= 6
      );

    case "weeklyPattern":
      return (
        Array.isArray(rule.days) &&
        rule.days.every(
          (day) => typeof day === "number" && day >= 0 && day <= 6
        ) &&
        rule.days.length > 0
      );

    case "specialPattern":
      return ["weekdays", "weekends"].includes(rule.pattern as string);

    default:
      return false;
  }
}

/**
 * Type guard to validate RecurrenceConfig
 */
export function isRecurrenceConfig(value: unknown): value is RecurrenceConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const config = value as Record<string, unknown>;

  return (
    isRecurrenceRule(config.rule) &&
    (config.fromCompletion === undefined ||
      typeof config.fromCompletion === "boolean")
  );
}

/**
 * Generate human-readable description of a recurrence rule
 */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  switch (rule.ruleType) {
    case "interval": {
      const unit = rule.amount === 1 ? rule.unit : `${rule.unit}s`;
      return rule.amount === 1
        ? `Every ${unit}`
        : `Every ${rule.amount} ${unit}`;
    }

    case "monthlyByWeekday": {
      const weekdays = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const ordinals = {
        first: "1st",
        second: "2nd",
        third: "3rd",
        fourth: "4th",
        last: "last",
      };
      const ordinal =
        typeof rule.ordinal === "string"
          ? ordinals[rule.ordinal]
          : `${rule.ordinal}${getOrdinalSuffix(rule.ordinal)}`;
      return `On the ${ordinal} ${weekdays[rule.weekday]}`;
    }

    case "weeklyPattern": {
      if (rule.days.length === 1) {
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return `Every ${weekdays[rule.days[0]]}`;
      }
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayNames = rule.days.map((d) => weekdays[d]).join(", ");
      return `Every ${dayNames}`;
    }

    case "specialPattern": {
      return rule.pattern === "weekdays"
        ? "Every weekday (Mon-Fri)"
        : "Every weekend (Sat-Sun)";
    }
  }
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
 */
function getOrdinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) {
    return "st";
  }
  if (j === 2 && k !== 12) {
    return "nd";
  }
  if (j === 3 && k !== 13) {
    return "rd";
  }
  return "th";
}

/**
 * Parse JSON string to RecurrenceConfig with validation
 */
export function parseRecurrenceConfig(json: string): RecurrenceConfig {
  try {
    const parsed = JSON.parse(json);
    if (!isRecurrenceConfig(parsed)) {
      throw new Error("Invalid recurrence configuration");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to parse recurrence config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Serialize RecurrenceConfig to JSON string
 */
export function serializeRecurrenceConfig(config: RecurrenceConfig): string {
  if (!isRecurrenceConfig(config)) {
    throw new Error("Invalid recurrence configuration");
  }
  return JSON.stringify(config);
}
