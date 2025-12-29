import type { Priority } from "@toasty/contracts";

/**
 * Importance v1 - Toodledo-compatible scoring algorithm (updated for Heat v3)
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
  starBonus: number;
  totalScore: number;
}

/**
 * Importance configuration constants
 */
export const IMPORTANCE_CONFIG = {
  PRIORITY_WEIGHTS: {
    low: 2,
    medium: 3,
    high: 4,
    top: 5,
  },
  DUE_WEIGHTS: {
    none: 0, // No due date
    future: 1, // >= 8 days away
    nextWeek: 2, // 4-7 days away
    thisWeek: 3, // 2-3 days away
    tomorrowOrNext: 4, // 1-2 days away
    today: 5, // Due today
    overdue: 6, // Past due
  },
  STAR_POINTS: {
    0: 0, // None
    1: 1, // Blue
    2: 2, // Yellow
    3: 3, // Orange
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
      return IMPORTANCE_CONFIG.PRIORITY_WEIGHTS.medium;
  }
}

/**
 * Get due date weight for importance calculation
 * @param dueAt - Due date (can be Date, timestamp, or ISO string)
 * @param now - Current timestamp for comparison
 */
function getDueWeight(
  dueAt: Date | number | string | null | undefined,
  now: Date = new Date()
): number {
  if (!dueAt) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.none;
  }

  let dueDate: Date;
  if (dueAt instanceof Date) {
    dueDate = dueAt;
  } else if (typeof dueAt === "number") {
    // Unix timestamp in seconds (SQLite format)
    dueDate = new Date(dueAt * 1000);
  } else if (typeof dueAt === "string") {
    dueDate = new Date(dueAt);
  } else {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.none;
  }

  if (isNaN(dueDate.getTime())) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.none;
  }

  // Reset hours for date-only comparison
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate()
  );

  const diffMs = dueStart.getTime() - todayStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.overdue;
  } else if (diffDays === 0) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.today;
  } else if (diffDays === 1 || diffDays === 2) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.tomorrowOrNext;
  } else if (diffDays === 3) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.thisWeek;
  } else if (diffDays >= 4 && diffDays <= 7) {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.nextWeek;
  } else {
    return IMPORTANCE_CONFIG.DUE_WEIGHTS.future;
  }
}

/**
 * Task fields required for importance calculation
 */
export interface ImportanceTask {
  priority: Priority;
  dueAt?: Date | number | string | null;
  starLevel?: number | null;
}

/**
 * Calculate importance v1 score for a task
 */
export function calculateImportanceV1(
  task: ImportanceTask,
  now: Date = new Date()
): number {
  const priorityWeight = getPriorityWeight(task.priority);
  const dueWeight = getDueWeight(task.dueAt, now);
  const starBonus = task.starLevel ?? 0;

  return priorityWeight + dueWeight + starBonus;
}

/**
 * Calculate importance v1 score with detailed breakdown
 */
export function calculateImportanceV1WithFactors(
  task: ImportanceTask,
  now: Date = new Date()
): ImportanceV1Factors {
  const priorityWeight = getPriorityWeight(task.priority);
  const dueWeight = getDueWeight(task.dueAt, now);
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
 * Maps 2-14 range to visual indicators
 */
export function getImportanceColor(score: number): string {
  if (score <= 3) return "bg-blue-400";
  if (score <= 5) return "bg-green-400";
  if (score <= 8) return "bg-yellow-400";
  if (score <= 11) return "bg-orange-400";
  return "bg-red-400";
}

/**
 * Get a label for importance score
 */
export function getImportanceLabel(score: number): string {
  if (score <= 3) return "Low";
  if (score <= 5) return "Medium-Low";
  if (score <= 8) return "Medium";
  if (score <= 11) return "Medium-High";
  return "High";
}

/**
 * Get theoretical minimum importance value
 */
export function getMinImportance(): number {
  const minPriority = Math.min(
    ...Object.values(IMPORTANCE_CONFIG.PRIORITY_WEIGHTS)
  );
  const minDue = Math.min(...Object.values(IMPORTANCE_CONFIG.DUE_WEIGHTS));
  const minStar = Math.min(...Object.values(IMPORTANCE_CONFIG.STAR_POINTS));

  return minPriority + minDue + minStar;
}

/**
 * Get theoretical maximum importance value
 */
export function getMaxImportance(): number {
  const maxPriority = Math.max(
    ...Object.values(IMPORTANCE_CONFIG.PRIORITY_WEIGHTS)
  );
  const maxDue = Math.max(...Object.values(IMPORTANCE_CONFIG.DUE_WEIGHTS));
  const maxStar = Math.max(...Object.values(IMPORTANCE_CONFIG.STAR_POINTS));

  return maxPriority + maxDue + maxStar;
}

/**
 * Get importance range (max - min)
 */
export function getImportanceRange(): number {
  return getMaxImportance() - getMinImportance();
}
