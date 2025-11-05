// Export interfaces
export type { ITaskRepository, IProjectRepository, ISettingsRepository, TaskQueryOptions } from "./interfaces";
export type { INoteRepository, NoteRowWithVersion } from "./notes-repository";

// Import repository implementations
import { TaskRepository } from "./task-repository";
import { ProjectRepository } from "./project-repository";
import { SettingsRepository } from "./settings-repository";
import { NoteRepository } from "./notes-repository";

// Re-export repository implementations
export { TaskRepository, ProjectRepository, SettingsRepository, NoteRepository };

// Repository factory - returns the appropriate implementation based on environment
// In the future, this can be extended to support multiple database types
export function createTaskRepository() {
  // For now, always return the default implementation
  // Later: check process.env.DATABASE_TYPE
  return new TaskRepository();
}

export function createProjectRepository() {
  return new ProjectRepository();
}

export function createSettingsRepository() {
  return new SettingsRepository();
}

export function createNoteRepository() {
  return new NoteRepository();
}

// Singleton instances for convenience
export const taskRepository = createTaskRepository();
export const projectRepository = createProjectRepository();
export const settingsRepository = createSettingsRepository();
export const noteRepository = createNoteRepository();
