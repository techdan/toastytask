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
