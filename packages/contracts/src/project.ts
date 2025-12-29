import { z } from "zod";

/**
 * Project DTOs for API communication
 */

// Full project DTO returned from API
export const ProjectDTOSchema = z.object({
  id: z.number(),
  name: z.string(),
  colorHex: z.string(),
  sortOrder: z.number(),
  archived: z.boolean(),
  userId: z.string().nullable(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
  // Tombstone for sync
  deletedAt: z.string().nullable().optional(), // ISO 8601
});

export type ProjectDTO = z.infer<typeof ProjectDTOSchema>;

// DTO for creating a new project
export const CreateProjectDTOSchema = z.object({
  name: z.string().min(1),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().optional(),
  // Client-generated ID for offline sync
  clientId: z.string().optional(),
});

export type CreateProjectDTO = z.infer<typeof CreateProjectDTOSchema>;

// DTO for updating an existing project
export const UpdateProjectDTOSchema = z.object({
  name: z.string().min(1).optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().optional(),
  archived: z.boolean().optional(),
});

export type UpdateProjectDTO = z.infer<typeof UpdateProjectDTOSchema>;
