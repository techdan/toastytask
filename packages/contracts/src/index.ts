/**
 * @toasty/contracts
 *
 * Mobile-safe type definitions and Zod schemas for the Toasty Task API.
 * This package defines the contract between server and clients (web/mobile).
 *
 * All DTOs use ISO 8601 strings for dates to ensure JSON serialization compatibility.
 */

// Enums
export {
  Priority,
  PrioritySchema,
  Bucket,
  BucketSchema,
  RepeatType,
  RepeatTypeSchema,
  StarLevel,
  StarLevelSchema,
  GroupingMode,
  GroupingModeSchema,
  SortMode,
  SortModeSchema,
  DefaultDueDate,
  DefaultDueDateSchema,
} from "./enums";

export type {
  Priority as PriorityType,
  Bucket as BucketType,
  RepeatType as RepeatTypeType,
  StarLevel as StarLevelType,
  GroupingMode as GroupingModeType,
  SortMode as SortModeType,
  DefaultDueDate as DefaultDueDateType,
} from "./enums";

// Task DTOs
export {
  TaskDTOSchema,
  CreateTaskDTOSchema,
  UpdateTaskDTOSchema,
  TaskWithFreshValuesDTOSchema,
} from "./task";

export type {
  TaskDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
  TaskWithFreshValuesDTO,
} from "./task";

// Project DTOs
export {
  ProjectDTOSchema,
  CreateProjectDTOSchema,
  UpdateProjectDTOSchema,
} from "./project";

export type {
  ProjectDTO,
  CreateProjectDTO,
  UpdateProjectDTO,
} from "./project";

// Note DTOs
export {
  NoteRowDTOSchema,
  UpdateNotesDTOSchema,
  NoteRowDataSchema,
} from "./note";

export type {
  NoteRowDTO,
  UpdateNotesDTO,
  NoteRowData,
} from "./note";

// Settings DTOs
export {
  SettingsDTOSchema,
  UpdateSettingsDTOSchema,
} from "./settings";

export type {
  SettingsDTO,
  UpdateSettingsDTO,
} from "./settings";

// Sync DTOs
export {
  SyncPullResponseSchema,
  SyncOperationSchema,
  SyncPushRequestSchema,
  SyncOperationSuccessSchema,
  SyncOperationErrorSchema,
  SyncOperationResultSchema,
  SyncPushResponseSchema,
} from "./sync";

export type {
  SyncPullResponse,
  SyncOperation,
  SyncPushRequest,
  SyncOperationResult,
  SyncPushResponse,
} from "./sync";

// Errors
export {
  SyncErrorCode,
  SyncErrorCodeSchema,
  SyncErrorSchema,
  ApiErrorResponseSchema,
  isRetryableError,
} from "./errors";

export type {
  SyncErrorCode as SyncErrorCodeType,
  SyncError,
  ApiErrorResponse,
} from "./errors";
