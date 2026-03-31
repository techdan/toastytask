import { z } from "zod";
import { TaskDTOSchema } from "./task";
import { ProjectDTOSchema } from "./project";
import { NoteRowDTOSchema } from "./note";
import { SettingsDTOSchema } from "./settings";

/**
 * Sync DTOs for offline-first mobile sync
 */

// Sync pull response - entities updated since cursor
export const SyncPullResponseSchema = z.object({
  entities: z.object({
    tasks: z.array(TaskDTOSchema),
    projects: z.array(ProjectDTOSchema),
    notes: z.array(NoteRowDTOSchema),
    settings: SettingsDTOSchema.optional(),
  }),
  // Task IDs whose note sets were fully refreshed in this page.
  // Mobile should replace (not merge) all local notes for these task IDs.
  noteTaskIds: z.array(z.number()).optional(),
  cursor: z.string(), // ISO 8601 timestamp or opaque cursor
  hasMore: z.boolean(),
});

export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

// Single operation in a sync push batch
export const SyncOperationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  method: z.enum(["POST", "PATCH", "DELETE"]),
  path: z.string(),
  body: z.record(z.unknown()).optional(),
});

export type SyncOperation = z.infer<typeof SyncOperationSchema>;

// Sync push request - batch of operations
export const SyncPushRequestSchema = z.object({
  operations: z.array(SyncOperationSchema).max(100),
});

export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

// Result of a single operation in push response
export const SyncOperationSuccessSchema = z.object({
  idempotencyKey: z.string(),
  status: z.literal("success"),
  clientId: z.string().optional(),
  serverId: z.number().optional(),
  entity: z.unknown().optional(),
});

export const SyncOperationErrorSchema = z.object({
  idempotencyKey: z.string(),
  status: z.literal("error"),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const SyncOperationResultSchema = z.union([
  SyncOperationSuccessSchema,
  SyncOperationErrorSchema,
]);

export type SyncOperationResult = z.infer<typeof SyncOperationResultSchema>;

// Sync push response
export const SyncPushResponseSchema = z.object({
  results: z.array(SyncOperationResultSchema),
  cursor: z.string().optional(), // Updated cursor after push
});

export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
