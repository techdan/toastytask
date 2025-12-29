import { z } from "zod";

/**
 * Core enums for Toasty Task
 * These are the shared type definitions used across web and mobile
 */

// Priority levels for tasks
export const PrioritySchema = z.enum(["low", "medium", "high", "top"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const Priority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  TOP: "top",
} as const;

// Bucket categories for task organization
export const BucketSchema = z.enum(["todo", "watch", "later"]);
export type Bucket = z.infer<typeof BucketSchema>;

export const Bucket = {
  TODO: "todo",
  WATCH: "watch",
  LATER: "later",
} as const;

// Repeat/recurrence types
export const RepeatTypeSchema = z.enum([
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "semiannual",
  "annual",
  "custom",
]);
export type RepeatType = z.infer<typeof RepeatTypeSchema>;

export const RepeatType = {
  NONE: "none",
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  SEMIANNUAL: "semiannual",
  ANNUAL: "annual",
  CUSTOM: "custom",
} as const;

// Star levels (0=none, 1=blue, 2=yellow, 3=orange)
export const StarLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export type StarLevel = z.infer<typeof StarLevelSchema>;

export const StarLevel = {
  NONE: 0,
  BLUE: 1,
  YELLOW: 2,
  ORANGE: 3,
} as const;

// Grouping mode for task list display
export const GroupingModeSchema = z.enum(["ungrouped", "importance", "heat"]);
export type GroupingMode = z.infer<typeof GroupingModeSchema>;

export const GroupingMode = {
  UNGROUPED: "ungrouped",
  IMPORTANCE: "importance",
  HEAT: "heat",
} as const;

// Sort mode for task list
export const SortModeSchema = z.enum(["importance", "heat"]);
export type SortMode = z.infer<typeof SortModeSchema>;

export const SortMode = {
  IMPORTANCE: "importance",
  HEAT: "heat",
} as const;

// Default due date options for settings
export const DefaultDueDateSchema = z.enum([
  "none",
  "today",
  "tomorrow",
  "next_week",
]);
export type DefaultDueDate = z.infer<typeof DefaultDueDateSchema>;

export const DefaultDueDate = {
  NONE: "none",
  TODAY: "today",
  TOMORROW: "tomorrow",
  NEXT_WEEK: "next_week",
} as const;
