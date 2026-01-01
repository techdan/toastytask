/**
 * React hooks for the Toasty Task mobile app
 */

// Database access
export { useLocalDatabase } from "./useLocalDatabase";

// Task hooks - primary offline-first API
export {
  useTasks,
  useTask,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCompleteTask,
  useUncompleteTask,
  useHeatTask,
  useCoolTask,
  useCycleStarTask,
} from "./useTasks";
export type { ProjectFilter } from "./useTasks";

// Notes hooks - for offline-first notes management
export { useSaveNotes, useNotesText } from "./useNotes";

// Project hooks - for v2 drawer navigation
export { useProjects, useProject } from "./useProjects";
export type { ProjectWithCount, UseProjectsResult } from "./useProjects";

// Filter state hooks - for v2 project/search filtering
export { useFilterState } from "./useFilterState";
export type { FilterState } from "./useFilterState";

// Local tasks hooks - alternative lower-level API
export {
  useLocalTasks,
  useLocalTask,
  useTaskMutations,
} from "./useLocalTasks";

// Sync status hooks
export {
  useSyncStatus,
  useDatabaseStats,
} from "./useSyncStatus";
