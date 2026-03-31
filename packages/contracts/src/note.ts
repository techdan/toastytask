import { z } from "zod";

/**
 * Note DTOs for API communication
 * Notes are stored per-line with versioning for conflict resolution
 */

// Single note row DTO
export const NoteRowDTOSchema = z.object({
  id: z.number(),
  taskId: z.number(),
  ordinal: z.number(),
  currentText: z.string(),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(), // ISO 8601
  deletedAt: z.string().nullable().optional(), // ISO 8601 — present when note is soft-deleted
});

export type NoteRowDTO = z.infer<typeof NoteRowDTOSchema>;

// DTO for updating task notes (full text replacement)
export const UpdateNotesDTOSchema = z.object({
  text: z.string(),
});

export type UpdateNotesDTO = z.infer<typeof UpdateNotesDTOSchema>;

// Legacy note data structure (for backwards compatibility)
export const NoteRowDataSchema = z.object({
  id: z.number(),
  currentText: z.string(),
  updatedAt: z.union([z.number(), z.string()]), // Unix timestamp or ISO string
});

export type NoteRowData = z.infer<typeof NoteRowDataSchema>;
