/**
 * Mutations for offline-first operations
 *
 * These mutations write to local SQLite first, then queue operations
 * to the outbox for sync with the server.
 */

export { TaskMutations } from "./task-mutations";
export type { TaskMutationsConfig } from "./task-mutations";

export { NotesMutations } from "./notes-mutations";
export type { NotesMutationsConfig } from "./notes-mutations";
