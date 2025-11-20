// Core enums
export const Priority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  TOP: "top",
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

export const Bucket = {
  TODO: "todo",
  WATCH: "watch",
  LATER: "later",
} as const;

export type Bucket = (typeof Bucket)[keyof typeof Bucket];

export const RepeatType = {
  NONE: "none",
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  SEMIANNUAL: "semiannual",
  ANNUAL: "annual",
  CUSTOM: "custom", // For future advanced rule-based recurrence
} as const;

export type RepeatType = (typeof RepeatType)[keyof typeof RepeatType];

export const GroupingMode = {
  UNGROUPED: "ungrouped",
  IMPORTANCE: "importance",
  HEAT: "heat",
} as const;

export type GroupingMode = (typeof GroupingMode)[keyof typeof GroupingMode];

export const SortMode = {
  IMPORTANCE: "importance",
  HEAT: "heat",
  CREATED_AT: "createdAt",
  UPDATED_AT: "updatedAt",
} as const;

export type SortMode = (typeof SortMode)[keyof typeof SortMode];

export const SortDirection = {
  ASC: "asc",
  DESC: "desc",
} as const;

export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

export const TaskDensity = {
  COMFORTABLE: "comfortable",
  COMPACT: "compact",
} as const;

export type TaskDensity = (typeof TaskDensity)[keyof typeof TaskDensity];

// Re-export types from schema for convenience
export type { Task as BaseTask, NewTask, Project, NewProject, Settings, NewSettings } from "@/lib/db/schema";

// Note row data structure
export interface NoteRowData {
  id: number;
  currentText: string;
  updatedAt: number | Date;
}

// Extended Task type with notes data (added by API)
import type { Task as BaseTaskType } from "@/lib/db/schema";
export type Task = BaseTaskType & {
  notes?: NoteRowData[];
  notesCount?: number;
  notesLastModified?: Date | null;
};

/**
 * Task with fresh calculated values for display.
 *
 * HYBRID PATTERN: The system uses a two-stage calculation approach:
 *
 * 1. CACHED VALUES (from database):
 *    - task.heat: Cached value written by server during mutations
 *    - task.importanceV1: Cached importance value
 *    - Used for: Database-level sorting (ORDER BY heat) with index support
 *    - Characteristic: May become stale between mutations
 *
 * 2. FRESH VALUES (calculated on client):
 *    - _freshHeat: Recalculated on every render from current time
 *    - _freshImportance: Recalculated from current due date status
 *    - Used for: Display, tooltips, badges, client-side sorting
 *    - Characteristic: Always accurate for current time/timezone
 *
 * Why Both?
 * - Cached: Enables fast initial page load with database sorting (1000+ tasks)
 * - Fresh: Ensures accurate display without staleness issues
 *
 * Usage Pattern:
 * 1. Server writes cached values during mutations → database
 * 2. Client fetches tasks with cached values (fast ORDER BY)
 * 3. Client immediately calculates fresh values on render
 * 4. UI uses _freshHeat and _freshImportance for display
 *
 * Example:
 * ```typescript
 * const tasksWithFresh: TaskWithFreshValues[] = tasks.map(task => ({
 *   ...task,
 *   _freshHeat: calculateHeat(task, now),
 *   _freshImportance: calculateImportance(task)
 * }))
 * // Sort by _freshHeat, not task.heat
 * tasksWithFresh.sort((a, b) => b._freshHeat - a._freshHeat)
 * ```
 */
export type TaskWithFreshValues = Task & {
  _freshImportance: number;
  _freshHeat: number;
};
