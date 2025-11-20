import type { Priority, Task } from "@/types";

/**
 * Importance v1 - Toodledo-compatible scoring algorithm (updated for Heat v3)
 *
 * ⚠️ SINGLE SOURCE OF TRUTH ⚠️
 * This is the ONLY place where importance calculation logic should exist.
 *
 * Architecture:
 * - SERVER: Always calculates and stores importance in DB (source of truth)
 * - CLIENT: Uses server-provided value from task.importanceV1
 * - CLIENT OPTIMISTIC UPDATES: May temporarily recalculate for immediate UI feedback,
 *   but server response will always replace with authoritative value
 *
 * If you need to modify the importance calculation:
 * 1. Update the logic in this file ONLY
 * 2. The change will automatically apply to both server and client optimistic updates
 * 3. No other files should contain importance calculation logic
 *
 * Score range: 2-14 (Heat v3: increased from 2-12 due to enhanced star system)
 *
 * Components:
 * - Priority weight: Low=2, Medium=3, High=4, Top=5
 * - Due date weight: None=0, Future=1, Next week=2, This week=3, Tomorrow/Day after=4, Today=5, Past Due=6
 * - Star bonus (Heat v3): None=0, Blue=+1, Yellow=+2, Orange=+3
 *
 * Formula: priority_weight + due_weight + star_level
 */

export interface ImportanceV1Factors {
  priorityWeight: number;
  dueWeight: number;
  starBonus: number; // Heat v3: 0-3 (star level points)
  totalScore: number;
}

/**
 * Importance configuration constants
 * Heat v4: Centralized for dynamic calculations
 */
export const IMPORTANCE_CONFIG = {
  PRIORITY_WEIGHTS: {
    low: 2,
    medium: 3,
    high: 4,
    top: 5,
  },
  DUE_WEIGHTS: {
    none: 0,           // No due date
    future: 1,         // >= 8 days away
    nextWeek: 2,       // 4-7 days away
    thisWeek: 3,       // 2-3 days away
    tomorrowOrNext: 4, // 1-2 days away
    today: 5,          // Due today
    overdue: 6,        // Past due
  },
  STAR_POINTS: {
    0: 0,  // None
    1: 1,  // Blue
    2: 2,  // Yellow
    3: 3,  // Orange
  },
} as const;

/**
 * Get priority weight for importance calculation
 */
function getPriorityWeight(priority: Priority): number {
  switch (priority) {
    case "low":
      return IMPORTANCE_CONFIG.PRIORITY_WEIGHTS.low;
    case "medium":
      return IMPORTANCE_CONFIG.PRIORITY_WEIGHTS.medium;
    case "high":
      return IMPORTANCE_CONFIG.PRIORITY_WEIGHTS.high;
    case "top":
      return IMPORTANCE_CONFIG.PRIORITY_WEIGHTS.top;
    default:
      return IMPORTANCE_CONFIG.PRIORITY_WEIGHTS.medium; // Default to medium
  }
}

/**
 * Get due date weight for importance calculation
 * @param dueAt - Due date (can be Date, timestamp, or string)
 * @param now - Current timestamp for comparison (defaults to new Date())
 */
function getDueWeight(dueAt: Date | number | string | null | undefined, now: Date = new Date()): number {
  if (!dueAt) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.none; // No due date
  }

  // Robust date conversion - handle Date objects, Unix timestamps (seconds), and ISO strings
  let dueDate: Date;
  if (dueAt instanceof Date) {
    dueDate = dueAt;
  } else if (typeof dueAt === "number") {
    // Unix timestamp in seconds (SQLite format)
    dueDate = new Date(dueAt * 1000);
  } else if (typeof dueAt === "string") {
    // ISO string or other date string
    dueDate = new Date(dueAt);
  } else {
    // Fallback for unknown types
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.none;
  }

  // Validate the date is valid
  if (isNaN(dueDate.getTime())) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.none;
  }

  // Reset hours for date-only comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  const diffMs = dueStart.getTime() - todayStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.overdue; // Past due = 6
  } else if (diffDays === 0) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.today; // Due today = 5
  } else if (diffDays === 1 || diffDays === 2) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.tomorrowOrNext; // Tomorrow / day after = 4
  } else if (diffDays === 3) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.thisWeek; // This week = 3
  } else if (diffDays >= 4 && diffDays <= 7) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.nextWeek; // Next week = 2
  } else {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.future; // Future (8+ days) = 1
  }
}

/**
 * Calculate importance v1 score for a task
 * Heat v3: Uses starLevel (0-3) instead of star boolean
 * Backwards compatible: Falls back to star boolean if starLevel not present
 * @param task - Task with priority, dueAt, and optionally star/starLevel
 * @param now - Current timestamp for due date comparison (defaults to new Date())
 */
export function calculateImportanceV1(
  task: Pick<Task, "priority" | "dueAt" | "starLevel">,
  now: Date = new Date()
): number {
  const priorityWeight = getPriorityWeight(task.priority);
  const dueWeight = getDueWeight(task.dueAt, now);

  // Heat v3: Use starLevel (0-3 scale)
  const starBonus = task.starLevel ?? 0;

  return priorityWeight + dueWeight + starBonus;
}

/**
 * Calculate importance v1 score with detailed breakdown
 * Heat v3: Uses starLevel (0-3) instead of star boolean
 * @param task - Task with priority, dueAt, and starLevel
 * @param now - Current timestamp for due date comparison (defaults to new Date())
 */
export function calculateImportanceV1WithFactors(
  task: Pick<Task, "priority" | "dueAt" | "starLevel">,
  now: Date = new Date()
): ImportanceV1Factors {
  const priorityWeight = getPriorityWeight(task.priority);
  const dueWeight = getDueWeight(task.dueAt, now);

  // Heat v3: Use starLevel (0-3 scale)
  const starBonus = task.starLevel ?? 0;

  const totalScore = priorityWeight + dueWeight + starBonus;

  return {
    priorityWeight,
    dueWeight,
    starBonus,
    totalScore,
  };
}

/**
 * Get a color class based on importance score
 * Maps 2-14 range to visual indicators (Heat v3: updated for new range)
 */
export function getImportanceColor(score: number): string {
  if (score <= 3) return "bg-blue-400"; // Low importance (2-3)
  if (score <= 5) return "bg-green-400"; // Medium-low (4-5)
  if (score <= 8) return "bg-yellow-400"; // Medium (6-8)
  if (score <= 11) return "bg-orange-400"; // Medium-high (9-11)
  return "bg-red-400"; // High importance (12-14)
}

/**
 * Get a label for importance score
 * Heat v3: Updated for 2-14 range
 */
export function getImportanceLabel(score: number): string {
  if (score <= 3) return "Low";
  if (score <= 5) return "Medium-Low";
  if (score <= 8) return "Medium";
  if (score <= 11) return "Medium-High";
  return "High";
}

// ============================================================================
// Dynamic Min/Max Calculations (Heat v4)
// ============================================================================

/**
 * Get theoretical minimum importance value
 * Heat v4: Dynamically calculated from IMPORTANCE_CONFIG
 *
 * Calculation: min(priority) + min(due) + min(star)
 * Currently: 2 + 0 + 0 = 2
 *
 * @returns Minimum possible importance score
 */
export function getMinImportance(): number {
  const minPriority = Math.min(...Object.values(IMPORTANCE_CONFIG.PRIORITY_WEIGHTS));
  const minDue = Math.min(...Object.values(IMPORTANCE_CONFIG.DUE_WEIGHTS));
  const minStar = Math.min(...Object.values(IMPORTANCE_CONFIG.STAR_POINTS));

  return minPriority + minDue + minStar;
}

/**
 * Get theoretical maximum importance value
 * Heat v4: Dynamically calculated from IMPORTANCE_CONFIG
 *
 * Calculation: max(priority) + max(due) + max(star)
 * Currently: 5 + 6 + 3 = 14
 *
 * @returns Maximum possible importance score
 */
export function getMaxImportance(): number {
  const maxPriority = Math.max(...Object.values(IMPORTANCE_CONFIG.PRIORITY_WEIGHTS));
  const maxDue = Math.max(...Object.values(IMPORTANCE_CONFIG.DUE_WEIGHTS));
  const maxStar = Math.max(...Object.values(IMPORTANCE_CONFIG.STAR_POINTS));

  return maxPriority + maxDue + maxStar;
}

/**
 * Get importance range (max - min)
 * Heat v4: Dynamically calculated from IMPORTANCE_CONFIG
 *
 * Calculation: max - min
 * Currently: 14 - 2 = 12
 *
 * @returns Range of importance scores
 */
export function getImportanceRange(): number {
  return getMaxImportance() - getMinImportance();
}
