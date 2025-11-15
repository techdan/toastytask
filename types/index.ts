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
  MONTHLY: "monthly",
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
} as const;

export type SortMode = (typeof SortMode)[keyof typeof SortMode];

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

// Client-calculated scoring fields that supplement Task data
export type TaskWithFreshValues = Task & {
  _freshImportance: number;
  _freshHeat: number;
};
