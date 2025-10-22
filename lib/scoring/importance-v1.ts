import type { Priority, Task } from "@/types";

/**
 * Importance v1 - Toodledo-compatible scoring algorithm
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
 * Score range: 2-12
 *
 * Components:
 * - Priority weight: Low=2, Medium=3, High=4, Top=5
 * - Due date weight: None=0, Future=3, Today=5, Past=6
 * - Star bonus: +1 if starred
 *
 * Formula: (priority_weight + due_weight) + (star ? 1 : 0)
 */

export interface ImportanceV1Factors {
  priorityWeight: number;
  dueWeight: number;
  starBonus: number;
  totalScore: number;
}

/**
 * Get priority weight for importance calculation
 */
function getPriorityWeight(priority: Priority): number {
  switch (priority) {
    case "low":
      return 2;
    case "medium":
      return 3;
    case "high":
      return 4;
    case "top":
      return 5;
    default:
      return 3; // Default to medium
  }
}

/**
 * Get due date weight for importance calculation
 */
function getDueWeight(dueAt: Date | number | string | null | undefined): number {
  if (!dueAt) {
    return 0; // No due date
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
    return 0;
  }

  // Validate the date is valid
  if (isNaN(dueDate.getTime())) {
    return 0;
  }

  const today = new Date();

  // Reset hours for date-only comparison
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  const diffMs = dueStart.getTime() - todayStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 6; // Past due
  } else if (diffDays === 0) {
    return 5; // Due today
  } else {
    return 3; // Future
  }
}

/**
 * Calculate importance v1 score for a task
 */
export function calculateImportanceV1(task: Pick<Task, "priority" | "star" | "dueAt">): number {
  const priorityWeight = getPriorityWeight(task.priority);
  const dueWeight = getDueWeight(task.dueAt);
  const starBonus = task.star ? 1 : 0;

  return priorityWeight + dueWeight + starBonus;
}

/**
 * Calculate importance v1 score with detailed breakdown
 */
export function calculateImportanceV1WithFactors(
  task: Pick<Task, "priority" | "star" | "dueAt">
): ImportanceV1Factors {
  const priorityWeight = getPriorityWeight(task.priority);
  const dueWeight = getDueWeight(task.dueAt);
  const starBonus = task.star ? 1 : 0;
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
 * Maps 2-12 range to visual indicators
 */
export function getImportanceColor(score: number): string {
  if (score <= 3) return "bg-blue-400"; // Low importance (2-3)
  if (score <= 5) return "bg-green-400"; // Medium-low (4-5)
  if (score <= 7) return "bg-yellow-400"; // Medium (6-7)
  if (score <= 9) return "bg-orange-400"; // Medium-high (8-9)
  return "bg-red-400"; // High importance (10-12)
}

/**
 * Get a label for importance score
 */
export function getImportanceLabel(score: number): string {
  if (score <= 3) return "Low";
  if (score <= 5) return "Medium-Low";
  if (score <= 7) return "Medium";
  if (score <= 9) return "Medium-High";
  return "High";
}
