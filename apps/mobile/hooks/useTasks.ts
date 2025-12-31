import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type {
  TaskDTO,
  Bucket,
  CreateTaskDTO,
  UpdateTaskDTO,
  TaskWithFreshValuesDTO,
} from "@toasty/contracts";
import { calculateHeat, calculateImportanceV1 } from "@toasty/domain";
import { useLocalDatabase } from "./useLocalDatabase";
import { TaskMutations } from "../lib/mutations/task-mutations";
import { useAuth } from "@clerk/clerk-expo";
import {
  sortTasksByMode,
  type MobileSortMode,
  type SortDirection,
} from "../lib/sorting";

/**
 * Filter for project-based filtering in the v2 UI
 * - number: specific project ID
 * - null: "No Project" filter (tasks without a project)
 * - 'all': show all tasks
 * - 'focus': show only focused tasks
 */
export type ProjectFilter = number | null | "all" | "focus";

/**
 * Options for the useTasks hook
 * Supports both legacy bucket-based filtering and new v2 project-based filtering
 */
interface UseTasksOptions {
  /**
   * @deprecated Use projectId filter with 'all' instead
   * Legacy bucket filter - kept for backward compatibility during migration
   */
  bucket?: Bucket;

  /**
   * Project filter for v2 UI
   * - number: specific project ID
   * - null: "No Project" filter
   * - 'all': show all tasks (default)
   * - 'focus': show only focused tasks
   */
  projectId?: ProjectFilter;

  /**
   * Sort mode for the task list
   * @default 'importance'
   */
  sortMode?: MobileSortMode;

  /**
   * Sort direction
   * @default 'desc'
   */
  sortDirection?: SortDirection;

  /**
   * Whether to include completed tasks
   * @default false
   */
  includeCompleted?: boolean;

  /**
   * Search query to filter tasks by title
   */
  searchQuery?: string;
}

/**
 * Calculate fresh heat and importance values for a task
 */
function calculateFreshValues(task: TaskDTO): TaskWithFreshValuesDTO {
  const now = new Date();

  const freshImportance = calculateImportanceV1(
    {
      priority: task.priority,
      dueAt: task.dueAt,
      starLevel: task.starLevel,
    },
    now
  );

  const freshHeat = calculateHeat(
    {
      heatAdjustment: task.heatAdjustment,
      lastTouchedAt: task.lastTouchedAt,
      lastHeatTouchedAt: task.lastHeatTouchedAt,
      importanceV1: freshImportance,
      isFocused: task.isFocused,
      focusSnoozeUntil: task.focusSnoozeUntil,
    },
    now,
    freshImportance
  );

  return {
    ...task,
    _freshImportance: freshImportance,
    _freshHeat: freshHeat,
  };
}

/**
 * Sort tasks by heat with untouched tasks pinned to top
 */
function sortTasksByHeat(
  tasks: TaskWithFreshValuesDTO[]
): TaskWithFreshValuesDTO[] {
  return [...tasks].sort((a, b) => {
    // Untouched tasks first
    const aUntouched = !a.lastTouchedAt && !a.lastHeatTouchedAt;
    const bUntouched = !b.lastTouchedAt && !b.lastHeatTouchedAt;

    if (aUntouched && !bUntouched) return -1;
    if (!aUntouched && bUntouched) return 1;

    // Then by fresh heat descending
    return b._freshHeat - a._freshHeat;
  });
}

/**
 * Process tasks: calculate fresh values and sort
 */
function processTasksWithFreshValues(
  tasks: TaskDTO[]
): TaskWithFreshValuesDTO[] {
  const tasksWithFresh = tasks.map(calculateFreshValues);
  return sortTasksByHeat(tasksWithFresh);
}

/**
 * Hook for accessing tasks from local SQLite database
 * Reads from local storage for offline-first operation
 * Mutations write locally and queue to outbox for sync
 *
 * Supports both legacy bucket-based filtering (v1) and new project-based filtering (v2)
 */
export function useTasks(options?: UseTasksOptions) {
  const { database, isReady } = useLocalDatabase();
  const queryClient = useQueryClient();

  // Extract options with defaults
  const sortMode = options?.sortMode ?? "importance";
  const sortDirection = options?.sortDirection ?? "desc";
  const includeCompleted = options?.includeCompleted ?? false;
  const searchQuery = options?.searchQuery ?? "";

  // Build query key including all filter/sort params
  const queryKey = [
    "local-tasks",
    options?.bucket,
    options?.projectId,
    sortMode,
    sortDirection,
    includeCompleted,
    searchQuery,
  ];

  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!database) {
        return [];
      }

      // Get tasks from local database
      // Legacy bucket filtering still supported
      let localTasks = database.getTasks(options?.bucket);

      // v2 project-based filtering
      if (options?.projectId !== undefined && options?.projectId !== "all") {
        if (options.projectId === "focus") {
          // Focus filter - show only focused tasks
          localTasks = localTasks.filter((t) => t.isFocused);
        } else if (options.projectId === null) {
          // "No Project" filter - tasks without a project
          localTasks = localTasks.filter((t) => t.projectId === null);
        } else if (typeof options.projectId === "number") {
          // Specific project filter
          localTasks = localTasks.filter(
            (t) => t.projectId === options.projectId
          );
        }
      }

      // Filter out completed unless requested
      if (!includeCompleted) {
        localTasks = localTasks.filter((t) => !t.completedAt);
      }

      // Search filter - filter by title (case-insensitive)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        localTasks = localTasks.filter((t) =>
          t.title.toLowerCase().includes(query)
        );
      }

      // Calculate fresh values for all tasks
      const tasksWithFresh = localTasks.map(calculateFreshValues);

      // Sort using the new sorting utilities
      return sortTasksByMode(tasksWithFresh, sortMode, sortDirection);
    },
    enabled: isReady,
    // Recalculate fresh values frequently since heat decays over time
    staleTime: 1000 * 30, // 30 seconds
  });

  // Function to invalidate tasks queries
  const invalidateTasks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
  }, [queryClient]);

  // Separate completed and uncompleted tasks for v2 UI
  const { uncompletedTasks, completedTasks } = useMemo(() => {
    const tasks = query.data ?? [];
    if (!includeCompleted) {
      return { uncompletedTasks: tasks, completedTasks: [] };
    }
    return {
      uncompletedTasks: tasks.filter((t) => !t.completedAt),
      completedTasks: tasks.filter((t) => t.completedAt),
    };
  }, [query.data, includeCompleted]);

  return {
    tasks: query.data ?? [],
    uncompletedTasks,
    completedTasks,
    isLoading: query.isLoading || !isReady,
    error: query.error,
    refetch: query.refetch,
    invalidateTasks,
  };
}

/**
 * Hook for accessing a single task from local SQLite database
 */
export function useTask(taskId: number) {
  const { database, isReady } = useLocalDatabase();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["local-task", taskId],
    queryFn: () => {
      if (!database) {
        return null;
      }

      const task = database.getTask(taskId);
      return task ? calculateFreshValues(task) : null;
    },
    enabled: isReady && taskId !== 0,
    staleTime: 1000 * 30, // 30 seconds
  });

  const invalidateTask = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["local-task", taskId] });
    queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
  }, [queryClient, taskId]);

  return {
    task: query.data,
    isLoading: query.isLoading || !isReady,
    error: query.error,
    refetch: query.refetch,
    invalidateTask,
  };
}

/**
 * Hook for creating tasks with optimistic updates
 * Creates locally and queues to outbox for sync
 */
export function useCreateTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTaskDTO) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      return mutations.createTask(data);
    },
    onSuccess: (newTask) => {
      // Optimistically update the tasks cache
      queryClient.setQueriesData<TaskWithFreshValuesDTO[]>(
        { queryKey: ["local-tasks"] },
        (oldData) => {
          if (!oldData) return [calculateFreshValues(newTask)];
          return sortTasksByHeat([...oldData, calculateFreshValues(newTask)]);
        }
      );
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}

/**
 * Hook for updating tasks with optimistic updates
 */
export function useUpdateTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      data,
    }: {
      taskId: number;
      data: UpdateTaskDTO;
    }) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      const result = mutations.updateTask(taskId, data);
      if (!result) {
        throw new Error("Task not found");
      }
      return result;
    },
    onSuccess: (updatedTask) => {
      // Optimistically update the task cache
      queryClient.setQueryData(
        ["local-task", updatedTask.id],
        calculateFreshValues(updatedTask)
      );

      // Update in tasks list
      queryClient.setQueriesData<TaskWithFreshValuesDTO[]>(
        { queryKey: ["local-tasks"] },
        (oldData) => {
          if (!oldData) return oldData;
          const updated = oldData.map((t) =>
            t.id === updatedTask.id ? calculateFreshValues(updatedTask) : t
          );
          return sortTasksByHeat(updated);
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}

/**
 * Hook for deleting tasks with optimistic updates
 */
export function useDeleteTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: number) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      const success = mutations.deleteTask(taskId);
      if (!success) {
        throw new Error("Task not found");
      }
      return taskId;
    },
    onSuccess: (taskId) => {
      // Remove from cache
      queryClient.setQueriesData<TaskWithFreshValuesDTO[]>(
        { queryKey: ["local-tasks"] },
        (oldData) => {
          if (!oldData) return oldData;
          return oldData.filter((t) => t.id !== taskId);
        }
      );
      queryClient.removeQueries({ queryKey: ["local-task", taskId] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}

/**
 * Hook for completing tasks with optimistic updates
 */
export function useCompleteTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: number) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      const result = mutations.completeTask(taskId);
      if (!result) {
        throw new Error("Task not found");
      }
      return result;
    },
    onSuccess: (completedTask) => {
      // Update the task cache
      queryClient.setQueryData(
        ["local-task", completedTask.id],
        calculateFreshValues(completedTask)
      );

      // Remove from active tasks list (if not showing completed)
      queryClient.setQueriesData<TaskWithFreshValuesDTO[]>(
        { queryKey: ["local-tasks"] },
        (oldData) => {
          if (!oldData) return oldData;
          return oldData.filter((t) => t.id !== completedTask.id);
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}

/**
 * Hook for uncompleting tasks with optimistic updates
 */
export function useUncompleteTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: number) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      const result = mutations.uncompleteTask(taskId);
      if (!result) {
        throw new Error("Task not found");
      }
      return result;
    },
    onSuccess: (uncompletedTask) => {
      // Update the task cache
      queryClient.setQueryData(
        ["local-task", uncompletedTask.id],
        calculateFreshValues(uncompletedTask)
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}

/**
 * Hook for heating tasks with optimistic updates
 */
export function useHeatTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      visibleTasks,
    }: {
      id: number;
      visibleTasks?: Array<{ id: number; heat: number }>;
    }) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      const result = mutations.heatTask(id, visibleTasks);
      if (!result) {
        throw new Error("Task not found");
      }
      return result;
    },
    onSuccess: (heatedTask) => {
      // Update the task cache
      queryClient.setQueryData(
        ["local-task", heatedTask.id],
        calculateFreshValues(heatedTask)
      );

      // Update in tasks list
      queryClient.setQueriesData<TaskWithFreshValuesDTO[]>(
        { queryKey: ["local-tasks"] },
        (oldData) => {
          if (!oldData) return oldData;
          const updated = oldData.map((t) =>
            t.id === heatedTask.id ? calculateFreshValues(heatedTask) : t
          );
          return sortTasksByHeat(updated);
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}

/**
 * Hook for cooling tasks with optimistic updates
 */
export function useCoolTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      visibleTasks,
    }: {
      id: number;
      visibleTasks?: Array<{ id: number; heat: number }>;
    }) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      const result = mutations.coolTask(id, visibleTasks);
      if (!result) {
        throw new Error("Task not found");
      }
      return result;
    },
    onSuccess: (cooledTask) => {
      // Update the task cache
      queryClient.setQueryData(
        ["local-task", cooledTask.id],
        calculateFreshValues(cooledTask)
      );

      // Update in tasks list
      queryClient.setQueriesData<TaskWithFreshValuesDTO[]>(
        { queryKey: ["local-tasks"] },
        (oldData) => {
          if (!oldData) return oldData;
          const updated = oldData.map((t) =>
            t.id === cooledTask.id ? calculateFreshValues(cooledTask) : t
          );
          return sortTasksByHeat(updated);
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}

/**
 * Hook for cycling star level with optimistic updates
 */
export function useCycleStarTask() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: number) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }

      const mutations = new TaskMutations({ database, outbox, userId });
      const result = mutations.cycleStarTask(taskId);
      if (!result) {
        throw new Error("Task not found");
      }
      return result;
    },
    onSuccess: (starredTask) => {
      // Update the task cache
      queryClient.setQueryData(
        ["local-task", starredTask.id],
        calculateFreshValues(starredTask)
      );

      // Update in tasks list
      queryClient.setQueriesData<TaskWithFreshValuesDTO[]>(
        { queryKey: ["local-tasks"] },
        (oldData) => {
          if (!oldData) return oldData;
          const updated = oldData.map((t) =>
            t.id === starredTask.id ? calculateFreshValues(starredTask) : t
          );
          return sortTasksByHeat(updated);
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}
