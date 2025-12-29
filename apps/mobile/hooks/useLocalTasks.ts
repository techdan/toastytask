import { useCallback, useEffect, useState, useMemo } from "react";
import { useAuth } from "@clerk/clerk-expo";
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

interface UseLocalTasksOptions {
  bucket?: Bucket;
  projectId?: number | null;
  includeCompleted?: boolean;
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
 * Hook for accessing local tasks with fresh calculated values
 * Reads directly from SQLite for offline-first operation
 */
export function useLocalTasks(options?: UseLocalTasksOptions) {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const [tasks, setTasks] = useState<TaskWithFreshValuesDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load tasks from local database
  const loadTasks = useCallback(() => {
    if (!database || !isReady) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Get tasks from local database
      let localTasks = database.getTasks(options?.bucket);

      // Filter by project if specified
      if (options?.projectId !== undefined) {
        localTasks = localTasks.filter(
          (t) => t.projectId === options.projectId
        );
      }

      // Filter out completed unless requested
      if (!options?.includeCompleted) {
        localTasks = localTasks.filter((t) => !t.completedAt);
      }

      // Calculate fresh values and sort
      const tasksWithFresh = localTasks.map(calculateFreshValues);
      const sortedTasks = sortTasksByHeat(tasksWithFresh);

      setTasks(sortedTasks);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [database, isReady, options?.bucket, options?.projectId, options?.includeCompleted, refreshKey]);

  // Load tasks when database is ready or options change
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Trigger a refresh
  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Create task mutations instance
  const mutations = useMemo(() => {
    if (!database || !outbox || !userId) {
      return null;
    }
    return new TaskMutations({
      database,
      outbox,
      userId,
    });
  }, [database, outbox, userId]);

  return {
    tasks,
    isLoading,
    error,
    refetch,
    mutations,
    isReady: isReady && !!mutations,
  };
}

/**
 * Hook for accessing a single local task
 */
export function useLocalTask(taskId: number) {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();
  const [task, setTask] = useState<TaskWithFreshValuesDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load task from local database
  const loadTask = useCallback(() => {
    if (!database || !isReady || taskId <= 0) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const localTask = database.getTask(taskId);

      if (localTask) {
        setTask(calculateFreshValues(localTask));
      } else {
        setTask(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [database, isReady, taskId, refreshKey]);

  // Load task when database is ready
  useEffect(() => {
    loadTask();
  }, [loadTask]);

  // Trigger a refresh
  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Create task mutations instance
  const mutations = useMemo(() => {
    if (!database || !outbox || !userId) {
      return null;
    }
    return new TaskMutations({
      database,
      outbox,
      userId,
    });
  }, [database, outbox, userId]);

  return {
    task,
    isLoading,
    error,
    refetch,
    mutations,
    isReady: isReady && !!mutations,
  };
}

/**
 * Hook for task mutation operations
 * Returns mutation functions that work offline-first
 */
export function useTaskMutations() {
  const { database, outbox, isReady } = useLocalDatabase();
  const { userId } = useAuth();

  const mutations = useMemo(() => {
    if (!database || !outbox || !userId) {
      return null;
    }
    return new TaskMutations({
      database,
      outbox,
      userId,
    });
  }, [database, outbox, userId]);

  const createTask = useCallback(
    (data: CreateTaskDTO) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.createTask(data);
    },
    [mutations]
  );

  const updateTask = useCallback(
    (taskId: number, data: UpdateTaskDTO) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.updateTask(taskId, data);
    },
    [mutations]
  );

  const deleteTask = useCallback(
    (taskId: number) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.deleteTask(taskId);
    },
    [mutations]
  );

  const completeTask = useCallback(
    (taskId: number) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.completeTask(taskId);
    },
    [mutations]
  );

  const uncompleteTask = useCallback(
    (taskId: number) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.uncompleteTask(taskId);
    },
    [mutations]
  );

  const heatTask = useCallback(
    (taskId: number, visibleTasks?: Array<{ id: number; heat: number }>) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.heatTask(taskId, visibleTasks);
    },
    [mutations]
  );

  const coolTask = useCallback(
    (taskId: number, visibleTasks?: Array<{ id: number; heat: number }>) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.coolTask(taskId, visibleTasks);
    },
    [mutations]
  );

  const cycleStarTask = useCallback(
    (taskId: number) => {
      if (!mutations) {
        throw new Error("Mutations not available - database not ready");
      }
      return mutations.cycleStarTask(taskId);
    },
    [mutations]
  );

  return {
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    uncompleteTask,
    heatTask,
    coolTask,
    cycleStarTask,
    isReady: isReady && !!mutations,
  };
}
