/**
 * Date utilities for domain calculations
 * These are platform-agnostic and work on both web and mobile
 */

/**
 * Convert various date formats to Date object
 */
export function toDate(
  dateValue: Date | number | string | null | undefined
): Date | null {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return dateValue;
  } else if (typeof dateValue === "number") {
    // Unix timestamp in seconds (SQLite format) or milliseconds
    const timestamp = dateValue < 10000000000 ? dateValue * 1000 : dateValue;
    return new Date(timestamp);
  } else if (typeof dateValue === "string") {
    return new Date(dateValue);
  }

  return null;
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
