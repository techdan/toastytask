import { z } from "zod";

/**
 * Error types for API and sync operations
 */

// Standard sync error codes
export const SyncErrorCodeSchema = z.enum([
  "VALIDATION_ERROR", // Request body validation failed
  "NOT_FOUND", // Entity not found
  "FORBIDDEN", // User doesn't have access
  "CONFLICT", // Entity was modified by another client
  "UNAUTHORIZED", // Authentication required or invalid
  "RATE_LIMITED", // Too many requests
  "SERVER_ERROR", // Internal server error
  "NETWORK_ERROR", // Network request failed
  "TIMEOUT", // Request timed out
]);

export type SyncErrorCode = z.infer<typeof SyncErrorCodeSchema>;

export const SyncErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  RATE_LIMITED: "RATE_LIMITED",
  SERVER_ERROR: "SERVER_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
} as const;

// Sync error structure
export const SyncErrorSchema = z.object({
  code: SyncErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export type SyncError = z.infer<typeof SyncErrorSchema>;

// API error response
export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Determine if an error code is retryable
 */
export function isRetryableError(code: SyncErrorCode): boolean {
  switch (code) {
    case "NETWORK_ERROR":
    case "TIMEOUT":
    case "SERVER_ERROR":
    case "RATE_LIMITED":
      return true;
    case "VALIDATION_ERROR":
    case "NOT_FOUND":
    case "FORBIDDEN":
    case "CONFLICT":
    case "UNAUTHORIZED":
      return false;
    default:
      return false;
  }
}
