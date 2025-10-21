// Re-export all query hooks for convenient importing
export { useTasksQuery } from "./use-tasks-query";
export { useProjectsQuery } from "./use-projects-query";
export { useSettingsQuery } from "./use-settings-query";
export { useNotesQuery } from "./use-notes-query";

// Re-export all mutation hooks
export {
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from "./use-task-mutations";
export {
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "./use-project-mutations";
export { useUpdateSettings } from "./use-settings-mutations";
export { useSaveNotes } from "./use-notes-mutations";

// Re-export types
export type { NoteRowData } from "./use-notes-query";
