import { z } from "zod";
import {
  PrioritySchema,
  BucketSchema,
  RepeatTypeSchema,
  StarLevelSchema,
} from "./enums";
import { NoteRowDTOSchema } from "./note";

/**
 * Task DTOs for API communication
 * These are mobile-safe types with ISO 8601 strings for dates
 */

// Full task DTO returned from API
export const TaskDTOSchema = z.object({
  id: z.number(),
  title: z.string(),
  projectId: z.number().nullable(),
  userId: z.string().nullable(),

  // Core fields
  priority: PrioritySchema,
  bucket: BucketSchema,
  starLevel: StarLevelSchema,
  starIntentVersion: z.number(),
  dueAt: z.string().nullable(), // ISO 8601

  // Recurrence
  repeatType: RepeatTypeSchema,
  repeatRule: z.string().nullable(),

  // Heat model fields
  heat: z.number(),
  heatCalculatedAt: z.string().nullable(), // ISO 8601
  heatAdjustment: z.number(),
  lastHeatTouchedAt: z.string().nullable(), // ISO 8601
  lastTouchedAt: z.string().nullable(), // ISO 8601
  touchCount: z.number(),

  // Calculated fields
  importanceV1: z.number(),

  // Status fields
  completedAt: z.string().nullable(), // ISO 8601
  archivedAt: z.string().nullable(), // ISO 8601
  deletedAt: z.string().nullable(), // ISO 8601

  // Focus model
  isFocused: z.boolean(),
  focusSnoozeUntil: z.string().nullable(), // ISO 8601

  // Timestamps
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601

  // Derived fields (populated by API)
  notes: z.array(NoteRowDTOSchema).optional(),
  notesCount: z.number().optional(),
  notesLastModified: z.string().nullable().optional(), // ISO 8601
});

export type TaskDTO = z.infer<typeof TaskDTOSchema>;

// DTO for creating a new task
export const CreateTaskDTOSchema = z.object({
  title: z.string().min(1),
  projectId: z.number().nullable().optional(),
  priority: PrioritySchema.optional(),
  bucket: BucketSchema.optional(),
  starLevel: StarLevelSchema.optional(),
  dueAt: z.string().nullable().optional(), // ISO 8601
  repeatType: RepeatTypeSchema.optional(),
  repeatRule: z.string().nullable().optional(),
  isFocused: z.boolean().optional(),
  // Client-generated ID for offline sync
  clientId: z.string().optional(),
});

export type CreateTaskDTO = z.infer<typeof CreateTaskDTOSchema>;

// DTO for updating an existing task
export const UpdateTaskDTOSchema = z.object({
  title: z.string().min(1).optional(),
  projectId: z.number().nullable().optional(),
  priority: PrioritySchema.optional(),
  bucket: BucketSchema.optional(),
  starLevel: StarLevelSchema.optional(),
  dueAt: z.string().nullable().optional(), // ISO 8601
  repeatType: RepeatTypeSchema.optional(),
  repeatRule: z.string().nullable().optional(),
  heatAdjustment: z.number().optional(),
  isFocused: z.boolean().optional(),
  focusSnoozeUntil: z.string().nullable().optional(), // ISO 8601
});

export type UpdateTaskDTO = z.infer<typeof UpdateTaskDTOSchema>;

// Task with fresh calculated values (for client-side display)
export const TaskWithFreshValuesDTOSchema = TaskDTOSchema.extend({
  _freshImportance: z.number(),
  _freshHeat: z.number(),
});

export type TaskWithFreshValuesDTO = z.infer<typeof TaskWithFreshValuesDTOSchema>;
