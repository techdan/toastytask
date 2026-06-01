// Re-export all query hooks for convenient importing
export { useTasksQuery } from "./use-tasks-query";
export { useProjectsQuery } from "./use-projects-query";
export { useSettingsQuery } from "./use-settings-query";
export { getNotesText, useNotesQuery } from "./use-notes-query";
export { useNotesAutosave } from "./use-notes-autosave";

// Re-export all mutation hooks
export {
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useStarTask,
  useCompleteTask,
  useUncompleteTask,
  useMarkTaskTouched,
} from "./use-task-mutations";
export {
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useReorderProjects,
} from "./use-project-mutations";
export { useUpdateSettings } from "./use-settings-mutations";
export { useSaveNotes } from "./use-notes-mutations";
export { useTouchAllTasks } from "./use-touch-all-tasks";

// Re-export types
export type { NoteRowData } from "./use-notes-query";
export type { NotesSaveState } from "./use-notes-autosave";
