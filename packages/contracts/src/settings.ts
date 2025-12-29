import { z } from "zod";
import {
  PrioritySchema,
  BucketSchema,
  DefaultDueDateSchema,
  GroupingModeSchema,
  SortModeSchema,
} from "./enums";

/**
 * Settings DTOs for API communication
 */

// Full settings DTO returned from API
export const SettingsDTOSchema = z.object({
  id: z.number(),
  userId: z.string().nullable(),

  // Default values for new tasks
  defaultPriority: PrioritySchema,
  defaultBucket: BucketSchema,
  defaultDueDate: DefaultDueDateSchema,

  // Heat model settings
  heatDecayHalfLifeTodo: z.number(),
  heatDecayHalfLifeWatch: z.number(),
  heatDecayHalfLifeLater: z.number(),
  activityNormalizationConstant: z.number(),
  newTaskHeatBoost: z.number(),
  newTaskHeatHalfLife: z.number(),

  // Automation settings
  escalationThreshold: z.number(),
  deEscalationThresholdTodoWatch: z.number(),
  deEscalationThresholdWatchLater: z.number(),
  retirementThreshold: z.number(),
  retirementDays: z.number(),
  reviewCadenceWatch: z.number(),
  reviewCadenceLater: z.number(),

  // UI preferences
  groupingMode: GroupingModeSchema,
  sortMode: SortModeSchema,

  updatedAt: z.string(), // ISO 8601
});

export type SettingsDTO = z.infer<typeof SettingsDTOSchema>;

// DTO for updating settings
export const UpdateSettingsDTOSchema = z.object({
  // Default values for new tasks
  defaultPriority: PrioritySchema.optional(),
  defaultBucket: BucketSchema.optional(),
  defaultDueDate: DefaultDueDateSchema.optional(),

  // Heat model settings
  heatDecayHalfLifeTodo: z.number().optional(),
  heatDecayHalfLifeWatch: z.number().optional(),
  heatDecayHalfLifeLater: z.number().optional(),
  activityNormalizationConstant: z.number().optional(),
  newTaskHeatBoost: z.number().optional(),
  newTaskHeatHalfLife: z.number().optional(),

  // Automation settings
  escalationThreshold: z.number().optional(),
  deEscalationThresholdTodoWatch: z.number().optional(),
  deEscalationThresholdWatchLater: z.number().optional(),
  retirementThreshold: z.number().optional(),
  retirementDays: z.number().optional(),
  reviewCadenceWatch: z.number().optional(),
  reviewCadenceLater: z.number().optional(),

  // UI preferences
  groupingMode: GroupingModeSchema.optional(),
  sortMode: SortModeSchema.optional(),
});

export type UpdateSettingsDTO = z.infer<typeof UpdateSettingsDTOSchema>;
