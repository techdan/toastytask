// Export interfaces
export type { ITaskRepository, IProjectRepository, ISettingsRepository, TaskQueryOptions } from "./interfaces";
export type { INoteRepository, NoteRowWithVersion } from "./notes-repository";

// Import SQLite implementations
import { SQLiteTaskRepository } from "./task-repository";
import { SQLiteProjectRepository } from "./project-repository";
import { SQLiteSettingsRepository } from "./settings-repository";
import { SQLiteNoteRepository } from "./notes-repository";

// Re-export SQLite implementations
export { SQLiteTaskRepository, SQLiteProjectRepository, SQLiteSettingsRepository, SQLiteNoteRepository };

// Repository factory - returns the appropriate implementation based on environment
// In the future, this can be extended to support PostgreSQL
export function createTaskRepository() {
  // For now, always return SQLite implementation
  // Later: check process.env.DATABASE_TYPE
  return new SQLiteTaskRepository();
}

export function createProjectRepository() {
  return new SQLiteProjectRepository();
}

export function createSettingsRepository() {
  return new SQLiteSettingsRepository();
}

export function createNoteRepository() {
  return new SQLiteNoteRepository();
}

// Singleton instances for convenience
export const taskRepository = createTaskRepository();
export const projectRepository = createProjectRepository();
export const settingsRepository = createSettingsRepository();
export const noteRepository = createNoteRepository();
