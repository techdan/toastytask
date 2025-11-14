import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import {
  calculateHeat,
  calculateHeatBoost,
  calculateCoolDrop,
  resolveAdjustmentForTargetHeat
} from "@/lib/scoring/heat-v3";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";
import type { Task, NewTask } from "@/types";
import type { HeatV3Breakdown } from "@/lib/scoring/heat-v3";

const PRIMARY_TASKS_QUERY_KEY = ["tasks", { includeCompleted: true }] as const;

const queryKeysEqual = (a: QueryKey, b: QueryKey) => JSON.stringify(a) === JSON.stringify(b);

interface TaskResponse {
  task: Task;
}

interface TouchTaskResponse {
  task: Task;
  heatDelta: number;
  adjustmentDelta: number;
  heatBreakdown: HeatV3Breakdown;
  baselineHeat: number;
  boost: number;
  targetHeat: number;
}

interface CoolTaskResponse {
  task: Task;
  heatDelta: number;
  adjustmentDelta: number;
  heatBreakdown: HeatV3Breakdown;
  drop: number;
  baselineHeat: number;
  targetHeat: number;
}

interface UpdateTaskData {
  id: number;
  updates: Partial<Task>;
}


// Create task
async function createTask(taskData: NewTask): Promise<Task> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(taskData),
  });

  if (!response.ok) {
    throw new Error("Failed to create task");
  }

  const data: TaskResponse = await response.json();
  return data.task;
}

// Update task
async function updateTask({ id, updates }: UpdateTaskData): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error("Failed to update task");
  }

  const data: TaskResponse = await response.json();
  return data.task;
}

// Delete task (soft delete)
async function deleteTask(id: number): Promise<void> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete task");
  }
}

// Complete task (handles recurrence)
async function completeTask(id: number): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/complete`, {
    method: "POST",
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to complete task");
  }

  const data: TaskResponse = await response.json();
  return data.task;
}

// Uncomplete task
async function uncompleteTask(id: number): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/complete`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to uncomplete task");
  }

  const data: TaskResponse = await response.json();
  return data.task;
}

// Hook: Create task with optimistic update
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onMutate: async (newTask) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot previous values for rollback
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Create optimistic task with temporary negative ID
      const optimisticTask: Task = {
        id: -Date.now(), // Temporary negative ID (will be replaced by server)
        title: newTask.title,
        projectId: newTask.projectId ?? null,
        userId: null,
        priority: newTask.priority ?? "medium",
        star: false, // Deprecated V2 - kept for schema compatibility
        starLevel: newTask.starLevel ?? 0, // V3: 0=none, 1=blue, 2=yellow, 3=orange
        dueAt: newTask.dueAt ?? null,
        bucket: newTask.bucket ?? "todo",
        repeatType: newTask.repeatType ?? "none",
        heat: newTask.heat ?? 0.5,
        heatCalculatedAt: new Date(),
        heatAdjustment: 0, // V3: Direct heat adjustment
        heatTouchCount: 0, // Deprecated V2 - kept for schema compatibility
        otherTouchCount: 0, // Deprecated V2 - kept for schema compatibility
        lastHeatTouchedAt: null,
        lastTouchedAt: null,
        nextSurfaceAt: null, // Deprecated V2 - kept for schema compatibility
        coldStorageAt: null,
        touchCount: 0, // Deprecated V1 - kept for schema compatibility
        importanceV1: 0, // DEPRECATED: Will be calculated on render (pure calculation architecture)
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        notes: [],
        notesCount: 0,
        notesLastModified: null,
      };

      // Note: We no longer calculate importanceV1 optimistically
      // It will be calculated on render from base properties

      // Optimistically add task ONLY to relevant task queries
      // - Global (all tasks) queries
      // - Project-specific queries that match the task's projectId (including null for "No Project")
      const matchingQueries = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      matchingQueries.forEach(([queryKey, data]) => {
        const key = queryKey as unknown as readonly unknown[];
        const params = (Array.isArray(key) && key.length > 1 && typeof key[1] === "object"
          ? (key[1] as Record<string, unknown>)
          : undefined);

        const keyProjectId = params && Object.prototype.hasOwnProperty.call(params, "projectId")
          ? (params!["projectId"] as number | null | undefined)
          : undefined;

        const includeInThisQuery =
          // All tasks queries (no projectId filter specified)
          keyProjectId === undefined ||
          // No Project queries
          (keyProjectId === null && optimisticTask.projectId === null) ||
          // Project-specific queries that match
          (typeof keyProjectId === "number" && keyProjectId === optimisticTask.projectId);

        if (!includeInThisQuery) return;

        if (!data || !Array.isArray(data)) return;

        queryClient.setQueryData<Task[]>(queryKey, [optimisticTask, ...data]);
      });

      return { previousTasks, optimisticId: optimisticTask.id };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to create task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (createdTask, _variables, context) => {
      // Replace the optimistic task with the real one from the server
      if (context?.optimisticId) {
        queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
          if (!oldTasks || !Array.isArray(oldTasks)) {
            return oldTasks;
          }

          // Replace the optimistic task with the real one
          return oldTasks.map((task) =>
            task.id === context.optimisticId ? createdTask : task
          );
        });
      }

      toast.success("Task created successfully");
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// Hook: Update task with optimistic update
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTask,
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot previous values for rollback
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Optimistically update all task queries
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        // Don't update if no data exists yet
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) => {
          if (task.id !== id) return task;

          // Apply updates
          const updatedTask = {
            ...task,
            ...updates,
          };

          // Note: We no longer calculate importanceV1 optimistically
          // It will be calculated on render from base properties (pure calculation architecture)

          // Check if heat-affecting fields changed
          const priorityChanged = updates.priority !== undefined;
          const starChanged = updates.starLevel !== undefined;
          const dueChanged = updates.dueAt !== undefined;
          const heatAffectingChange =
            priorityChanged ||
            starChanged ||
            dueChanged ||
            updates.heatAdjustment !== undefined ||
            updates.lastTouchedAt !== undefined ||
            updates.lastHeatTouchedAt !== undefined;

          if (heatAffectingChange) {
            // Calculate fresh importance for heat calculation
            const now = new Date();
            const freshImportance = calculateImportanceV1(updatedTask, now);
            updatedTask.heat = calculateHeat(updatedTask, now, freshImportance);
            updatedTask.heatCalculatedAt = now;
          }

          return updatedTask;
        });
      });

      return { previousTasks };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to update task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (updatedTask) => {
      // Replace optimistic update with authoritative server response
      // and ensure membership matches each query's filter (projectId)
      const queries = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      queries.forEach(([queryKey, data]) => {
        if (!data || !Array.isArray(data)) return;

        const key = queryKey as unknown as readonly unknown[];
        const params = (Array.isArray(key) && key.length > 1 && typeof key[1] === "object"
          ? (key[1] as Record<string, unknown>)
          : undefined);

        const keyProjectId = params && Object.prototype.hasOwnProperty.call(params, "projectId")
          ? (params!["projectId"] as number | null | undefined)
          : undefined;

        const shouldBelong =
          keyProjectId === undefined ||
          (keyProjectId === null && updatedTask.projectId === null) ||
          (typeof keyProjectId === "number" && keyProjectId === updatedTask.projectId);

        const exists = data.some((t) => t.id === updatedTask.id);

        if (shouldBelong) {
          const next = exists
            ? data.map((t) => (t.id === updatedTask.id ? updatedTask : t))
            : [updatedTask, ...data];
          queryClient.setQueryData<Task[]>(queryKey, next);
        } else if (exists) {
          // Remove from queries where it no longer belongs
          queryClient.setQueryData<Task[]>(queryKey, data.filter((t) => t.id !== updatedTask.id));
        }
      });
    },
  });
}

// Hook: Delete task with optimistic update
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTask,
    onMutate: async (taskId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot previous values
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Optimistically remove task from all queries
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        // Don't update if no data exists yet
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }
        return oldTasks.filter((task) => task.id !== taskId);
      });

      return { previousTasks };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to delete task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: () => {
      toast.success("Task deleted successfully");
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// Helper to optimistically calculate next due date for recurring tasks
function calculateOptimisticNextDueDate(currentDueDate: Date | null | number, repeatType: string): Date {
  const now = new Date();
  let baseDate: Date;

  if (currentDueDate) {
    baseDate = typeof currentDueDate === 'number'
      ? new Date(currentDueDate * 1000)
      : new Date(currentDueDate);
  } else {
    baseDate = now;
  }

  // Helper: days in month
  const daysInMonth = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0).getDate();

  switch (repeatType) {
    case "daily": {
      const next = new Date(baseDate);
      next.setDate(next.getDate() + 1);
      return next;
    }
    case "weekly": {
      const next = new Date(baseDate);
      next.setDate(next.getDate() + 7);
      return next;
    }
    case "monthly": {
      const anchor = baseDate.getDate();
      const ref = now > baseDate ? now : baseDate;

      let year = ref.getFullYear();
      let month = ref.getMonth();

      if (ref.getDate() >= anchor) {
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }

      const dim = daysInMonth(year, month);
      const day = Math.min(anchor, dim);

      const next = new Date(baseDate);
      next.setFullYear(year);
      next.setMonth(month);
      next.setDate(day);
      return next;
    }
    default:
      return baseDate;
  }
}

// Hook: Complete task (handles recurring tasks)
export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeTask,
    onMutate: async (taskId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot previous values for rollback
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Optimistically update the task
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) => {
          if (task.id !== taskId) return task;

          // If the task is recurring, advance the due date
          // If not recurring, mark as completed
          if (task.repeatType && task.repeatType !== "none") {
            // Optimistic: advance due date immediately
            const nextDueDate = calculateOptimisticNextDueDate(task.dueAt, task.repeatType);
            const updatedTask = { ...task, dueAt: nextDueDate };

            // Note: We no longer calculate importanceV1 optimistically
            // It will be calculated on render from base properties (pure calculation architecture)

            return updatedTask;
          } else {
            // Optimistic: mark as completed
            return { ...task, completedAt: new Date() };
          }
        });
      });

      return { previousTasks };
    },
    // Note: onSuccess removed - cache updates handled in page-level handler
    // to allow checking for stale responses (out-of-order completion race)
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to complete task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    // Note: onSettled removed - caller must handle invalidation to prevent race conditions
    // during rapid mutations. See handleCompleteTask/handleUncompleteTask in app/tasks/page.tsx
  });
}

// Hook: Uncomplete task
export function useUncompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uncompleteTask,
    onMutate: async (taskId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot previous values
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Optimistically update the task
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) => {
          if (task.id !== taskId) return task;
          return { ...task, completedAt: null };
        });
      });

      return { previousTasks };
    },
    // Note: onSuccess removed - cache updates handled in page-level handler
    // to allow checking for stale responses (out-of-order completion race)
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to uncomplete task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    // Note: onSettled removed - caller must handle invalidation to prevent race conditions
    // during rapid mutations. See handleCompleteTask/handleUncompleteTask in app/tasks/page.tsx
  });
}

// Heat task - Apply heat adjustment
async function heatTask(id: number, visibleTaskIds?: number[]): Promise<TouchTaskResponse> {
  const response = await fetch(`/api/tasks/${id}/heat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibleTaskIds }),
  });

  if (!response.ok) {
    throw new Error("Failed to heat task");
  }

  return response.json();
}

// Cool task - Apply cool adjustment
async function coolTask(id: number, visibleTaskIds?: number[]): Promise<CoolTaskResponse> {
  const response = await fetch(`/api/tasks/${id}/cool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibleTaskIds }),
  });

  if (!response.ok) {
    throw new Error("Failed to cool task");
  }

  return response.json();
}

// Touch task row - mark task as interacted without modifying heat adjustment
async function markTaskTouched(taskId: number): Promise<Task> {
  const response = await fetch(`/api/tasks/${taskId}/touch`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to touch task");
  }

  const data: TaskResponse = await response.json();
  return data.task;
}

// Hook: Mark task as touched (updates lastTouchedAt without changing heat adjustment)
export function useMarkTaskTouched() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markTaskTouched,
    onMutate: async (taskId: number) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        const now = new Date();

        return oldTasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          const updatedTask: Task = {
            ...task,
            lastTouchedAt: now,
            touchCount: (task.touchCount ?? 0) + 1,
          };

          const freshImportance = calculateImportanceV1(updatedTask, now);
          return {
            ...updatedTask,
            heat: calculateHeat(updatedTask, now, freshImportance),
            heatCalculatedAt: now,
          };
        });
      });

      return { previousTasks };
    },
    onError: (error, _variables, context) => {
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to touch task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (touchedTask) => {
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) =>
          task.id === touchedTask.id ? touchedTask : task
        );
      });
    },
  });
}

// Hook: Heat task - Context-aware positioning (moves up 1 position)
export function useTouchTask(intentTracker?: React.MutableRefObject<Map<number, { adjustment: number; timestamp: number }>>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, visibleTaskIds }: { taskId: number; visibleTaskIds?: number[] }) =>
      heatTask(taskId, visibleTaskIds),
    onMutate: async ({ taskId, visibleTaskIds }) => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot for rollback
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      console.log('━━━━━ [HEAT onMutate] START ━━━━━');
      console.log('[HEAT onMutate] Task ID:', taskId);
      console.log('[HEAT onMutate] All cached queries:', previousTasks.map(([key]) => JSON.stringify(key)));
      console.log('[HEAT onMutate] Number of cached queries:', previousTasks.length);

      if (!visibleTaskIds || visibleTaskIds.length === 0) {
        console.warn('[HEAT onMutate] Missing visibleTaskIds, skipping optimistic update.');
        return { previousTasks };
      }

      const snapshotEntries = previousTasks.filter(
        (entry): entry is [QueryKey, Task[]] => Array.isArray(entry[1])
      );

      const preferredSnapshot = snapshotEntries.find(
        ([key, tasks]) =>
          queryKeysEqual(key, PRIMARY_TASKS_QUERY_KEY) &&
          tasks.some((task) => task.id === taskId)
      );

      const fallbackSnapshot =
        preferredSnapshot ||
        snapshotEntries.find(([, tasks]) => tasks.some((task) => task.id === taskId));

      if (!fallbackSnapshot) {
        console.warn('[HEAT onMutate] Unable to locate task snapshot in cache.');
        return { previousTasks };
      }

      const [snapshotKey, snapshotTasks] = fallbackSnapshot;
      const currentTask = snapshotTasks.find((task) => task.id === taskId);

      if (!currentTask) {
        console.warn('[HEAT onMutate] Task missing from snapshot after selection.');
        return { previousTasks };
      }

      console.log('[HEAT onMutate] Using snapshot key:', JSON.stringify(snapshotKey));
      console.log('[HEAT onMutate] visibleTaskIds:', visibleTaskIds);
      console.log('[HEAT onMutate] Current task heat adjustment:', currentTask.heatAdjustment);

      const now = new Date();

      const currentImportance = calculateImportanceV1(currentTask, now);
      const currentHeat = calculateHeat(currentTask, now, currentImportance);

      console.log('[HEAT onMutate] Current heat:', currentHeat);
      console.log('[HEAT onMutate] Current task snapshot:', {
        id: currentTask.id,
        importance: currentImportance,
        heat: Number(currentHeat.toFixed(2)),
        adjustment: currentTask.heatAdjustment ?? 0,
      });

      const contextDebug: Array<{ id: number; importance: number; heat: number }> = [];
      const contextTasks = snapshotTasks
        .filter((task) => visibleTaskIds.includes(task.id) && task.id !== taskId)
        .map((task) => {
          const importance = calculateImportanceV1(task, now);
          const heat = calculateHeat(task, now, importance);
          contextDebug.push({ id: task.id, importance, heat: Number(heat.toFixed(2)) });
          return { id: task.id, heat };
        });

      console.log('[HEAT onMutate] Context tasks snapshot:', contextDebug);

      const boostDelta = calculateHeatBoost(
        { heat: currentHeat, id: currentTask.id },
        contextTasks
      );
      console.log('[HEAT onMutate] Calculated boost delta:', boostDelta);

      const targetHeat = Math.min(
        Math.max(
          currentHeat + boostDelta,
          HEAT_CONFIG.MIN_FINAL_SCORE
        ),
        HEAT_CONFIG.MAX_FINAL_SCORE
      );

      console.log('[HEAT onMutate] Target heat:', targetHeat);

      const { newAdjustment } = resolveAdjustmentForTargetHeat(
        targetHeat,
        {
          heatAdjustment: currentTask.heatAdjustment ?? 0,
          lastTouchedAt: currentTask.lastTouchedAt,
          lastHeatTouchedAt: currentTask.lastHeatTouchedAt,
        },
        now,
        currentImportance
      );

      console.log('[HEAT onMutate] New adjustment:', newAdjustment, '(was:', currentTask.heatAdjustment, ')');

      if (intentTracker) {
        intentTracker.current.set(taskId, {
          adjustment: newAdjustment,
          timestamp: now.getTime(),
        });
        console.log('[HEAT onMutate] Stored intent in tracker');
      }

      const applyOptimisticUpdate = (oldTasks: Task[] | undefined) => {
        if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
        return oldTasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                heatAdjustment: newAdjustment,
                lastHeatTouchedAt: now,
                lastTouchedAt: now,
              }
            : task
        );
      };

      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, applyOptimisticUpdate);

      console.log('━━━━━ [HEAT onMutate] END ━━━━━');

      return { previousTasks };
    },
    onError: (error, variables, context) => {
      // Clear intent on error
      if (intentTracker) {
        intentTracker.current.delete(variables.taskId);
        console.log('[HEAT onError] Cleared intent for task', variables.taskId);
      }

      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to heat task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (response) => {
      console.log('━━━━━ [HEAT onSuccess] START ━━━━━');
      console.log('[HEAT onSuccess] Server returned task', response.task.id);
      console.log('[HEAT onSuccess] Server heatAdjustment:', response.task.heatAdjustment);

      // Clear intent now that server confirmed the change
      if (intentTracker) {
        intentTracker.current.delete(response.task.id);
        console.log('[HEAT onSuccess] Cleared intent for task', response.task.id);
      }

      // Replace optimistic update with authoritative server response
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
        return oldTasks.map((task) =>
          task.id === response.task.id ? response.task : task
        );
      });

      console.log('━━━━━ [HEAT onSuccess] END ━━━━━');

      toast.success("Task heated", {
        description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
      });
    },
  });
}

// Hook: Cool task - Context-aware positioning (moves down 3 positions)
export function useCoolTask(intentTracker?: React.MutableRefObject<Map<number, { adjustment: number; timestamp: number }>>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, visibleTaskIds }: { taskId: number; visibleTaskIds?: number[] }) =>
      coolTask(taskId, visibleTaskIds),
    onMutate: async ({ taskId, visibleTaskIds }) => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot for rollback
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      console.log('━━━━━ [COOL onMutate] START ━━━━━');
      console.log('[COOL onMutate] Task ID:', taskId);
      console.log('[COOL onMutate] All cached queries:', previousTasks.map(([key]) => JSON.stringify(key)));
      console.log('[COOL onMutate] Number of cached queries:', previousTasks.length);

      if (!visibleTaskIds || visibleTaskIds.length === 0) {
        console.warn('[COOL onMutate] Missing visibleTaskIds, skipping optimistic update.');
        return { previousTasks };
      }

      const snapshotEntries = previousTasks.filter(
        (entry): entry is [QueryKey, Task[]] => Array.isArray(entry[1])
      );

      const preferredSnapshot = snapshotEntries.find(
        ([key, tasks]) =>
          queryKeysEqual(key, PRIMARY_TASKS_QUERY_KEY) &&
          tasks.some((task) => task.id === taskId)
      );

      const fallbackSnapshot =
        preferredSnapshot ||
        snapshotEntries.find(([, tasks]) => tasks.some((task) => task.id === taskId));

      if (!fallbackSnapshot) {
        console.warn('[COOL onMutate] Unable to locate task snapshot in cache.');
        return { previousTasks };
      }

      const [snapshotKey, snapshotTasks] = fallbackSnapshot;
      const currentTask = snapshotTasks.find((task) => task.id === taskId);

      if (!currentTask) {
        console.warn('[COOL onMutate] Task missing from snapshot after selection.');
        return { previousTasks };
      }

      console.log('[COOL onMutate] Using snapshot key:', JSON.stringify(snapshotKey));
      console.log('[COOL onMutate] visibleTaskIds:', visibleTaskIds);
      console.log('[COOL onMutate] Current task heat adjustment:', currentTask.heatAdjustment);

      const now = new Date();

      const currentImportance = calculateImportanceV1(currentTask, now);
      const currentHeat = calculateHeat(currentTask, now, currentImportance);

      console.log('[COOL onMutate] Current heat:', currentHeat);
      console.log('[COOL onMutate] Current task snapshot:', {
        id: currentTask.id,
        importance: currentImportance,
        heat: Number(currentHeat.toFixed(2)),
        adjustment: currentTask.heatAdjustment ?? 0,
      });

      const contextDebug: Array<{ id: number; importance: number; heat: number }> = [];
      const contextTasks = snapshotTasks
        .filter((task) => visibleTaskIds.includes(task.id) && task.id !== taskId)
        .map((task) => {
          const importance = calculateImportanceV1(task, now);
          const heat = calculateHeat(task, now, importance);
          contextDebug.push({ id: task.id, importance, heat: Number(heat.toFixed(2)) });
          return { id: task.id, heat };
        });
      console.log('[COOL onMutate] Context tasks snapshot:', contextDebug);

      const dropDelta = calculateCoolDrop(
        { heat: currentHeat, id: currentTask.id },
        contextTasks
      );
      console.log('[COOL onMutate] Calculated drop delta:', dropDelta);

      const targetHeat = Math.min(
        Math.max(
          currentHeat + dropDelta,
          HEAT_CONFIG.MIN_FINAL_SCORE
        ),
        HEAT_CONFIG.MAX_FINAL_SCORE
      );

      console.log('[COOL onMutate] Target heat:', targetHeat);

      const { newAdjustment } = resolveAdjustmentForTargetHeat(
        targetHeat,
        {
          heatAdjustment: currentTask.heatAdjustment ?? 0,
          lastTouchedAt: currentTask.lastTouchedAt,
          lastHeatTouchedAt: currentTask.lastHeatTouchedAt,
        },
        now,
        currentImportance
      );

      console.log('[COOL onMutate] New adjustment:', newAdjustment, '(was:', currentTask.heatAdjustment, ')');

      if (intentTracker) {
        intentTracker.current.set(taskId, {
          adjustment: newAdjustment,
          timestamp: now.getTime(),
        });
        console.log('[COOL onMutate] Stored intent in tracker');
      }

      const applyOptimisticUpdate = (oldTasks: Task[] | undefined) => {
        if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
        return oldTasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                heatAdjustment: newAdjustment,
                lastHeatTouchedAt: now,
                lastTouchedAt: now,
              }
            : task
        );
      };

      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, applyOptimisticUpdate);

      console.log('━━━━━ [COOL onMutate] END ━━━━━');

      return { previousTasks };
    },
    onError: (error, variables, context) => {
      // Clear intent on error
      if (intentTracker) {
        intentTracker.current.delete(variables.taskId);
        console.log('[COOL onError] Cleared intent for task', variables.taskId);
      }

      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to cool task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (response) => {
      console.log('━━━━━ [COOL onSuccess] START ━━━━━');
      console.log('[COOL onSuccess] Server returned task', response.task.id);
      console.log('[COOL onSuccess] Server heatAdjustment:', response.task.heatAdjustment);

      // Clear intent now that server confirmed the change
      if (intentTracker) {
        intentTracker.current.delete(response.task.id);
        console.log('[COOL onSuccess] Cleared intent for task', response.task.id);
      }

      // Replace optimistic update with authoritative server response
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
        return oldTasks.map((task) =>
          task.id === response.task.id ? response.task : task
        );
      });

      console.log('━━━━━ [COOL onSuccess] END ━━━━━');

      toast.success("Task cooled", {
        description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
      });
    },
  });
}
