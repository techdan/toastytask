import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import {
  calculateHeat,
  calculateHeatBoost,
  calculateCoolDrop,
  resolveAdjustmentForTargetHeat
} from "@/lib/scoring/heat-v3";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";
import { PRIMARY_TASKS_QUERY_KEY } from "./task-query-keys";
import type { Task, NewTask } from "@/types";
import type { HeatV3Breakdown } from "@/lib/scoring/heat-v3";
import { applyStarLevelToTask, mergeTaskWithCachedNotes } from "./task-cache-helpers";

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

interface StarTaskResponse {
  task: Task;
  oldStarLevel: number;
  newStarLevel: number;
  starPoints: number;
}

interface StarMutationVariables {
  taskId: number;
  targetLevel?: number;
  intentTimestamp?: number;
  optimisticApplied?: boolean;
  snapshotBeforeOptimism?: Task[] | undefined;
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

// Star task - set/cycle star level
async function starTask({
  id,
  targetLevel,
  intentTimestamp,
}: {
  id: number;
  targetLevel?: number;
  intentTimestamp?: number;
}): Promise<StarTaskResponse> {
  const payload: Record<string, unknown> = {};
  if (typeof targetLevel === "number") {
    payload.targetLevel = targetLevel;
  }
  if (typeof intentTimestamp === "number") {
    payload.intentVersion = intentTimestamp;
  }
  const hasBody = Object.keys(payload).length > 0;
  const response = await fetch(`/api/tasks/${id}/star`, {
    method: "POST",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw new Error("Failed to update star");
  }

  return response.json();
}

// Hook: Create task with optimistic update
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTask,
    onMutate: async (newTask) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      // Snapshot previous values for rollback
      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      // Create optimistic task with temporary negative ID
      const now = new Date();
      const optimisticTask: Task = {
        id: -Date.now(), // Temporary negative ID (will be replaced by server)
        title: newTask.title,
        projectId: newTask.projectId ?? null,
        userId: null,
        priority: newTask.priority ?? "medium",
        star: false, // Deprecated V2 - kept for schema compatibility
        starLevel: newTask.starLevel ?? 0, // V3: 0=none, 1=blue, 2=yellow, 3=orange
        starIntentVersion: 0,
        dueAt: newTask.dueAt ?? null,
        bucket: newTask.bucket ?? "todo",
        repeatType: newTask.repeatType ?? "none",
        heat: newTask.heat ?? 0.5,
        heatCalculatedAt: now,
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
        createdAt: now,
        updatedAt: now,
        notes: [],
        notesCount: 0,
        notesLastModified: null,
      };

      // Note: We no longer calculate importanceV1 optimistically
      // It will be calculated on render from base properties

      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return [optimisticTask];
        }
        return [optimisticTask, ...oldTasks];
      });

      return { previousTasks, optimisticId: optimisticTask.id };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
      }
      toast.error("Failed to create task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (createdTask, _variables, context) => {
      // Replace the optimistic task with the real one from the server
      if (context?.optimisticId) {
        queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
          if (!oldTasks || !Array.isArray(oldTasks)) {
            return oldTasks;
          }

          // Replace the optimistic task with the real one (preserving cached notes if server omitted them)
          return oldTasks.map((task) =>
            task.id === context.optimisticId ? mergeTaskWithCachedNotes(task, createdTask) : task
          );
        });
      }

      toast.success("Task created successfully");
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });
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
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      // Snapshot previous values for rollback
      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      // Optimistically update tasks cache
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
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
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
      }
      toast.error("Failed to update task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        const exists = oldTasks.some((task) => task.id === updatedTask.id);

        return exists
          ? oldTasks.map((task) =>
              task.id === updatedTask.id ? mergeTaskWithCachedNotes(task, updatedTask) : task
            )
          : [updatedTask, ...oldTasks];
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
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      // Snapshot previous values
      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      // Optimistically remove task
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
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
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
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
      queryClient.invalidateQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });
    },
  });
}

// Hook: Star task (cycle star level with intent tracking)
interface UseStarTaskOptions {
  getLatestIntentTimestamp?: (taskId: number) => number | undefined;
}

export function useStarTask(options?: UseStarTaskOptions) {
  const queryClient = useQueryClient();
  const latestStarIntent = useRef(new Map<number, number>());

  return useMutation({
    mutationFn: ({ taskId, targetLevel, intentTimestamp }: StarMutationVariables) =>
      starTask({ id: taskId, targetLevel, intentTimestamp }),
    onMutate: async (variables: StarMutationVariables) => {
      const { taskId, targetLevel, optimisticApplied, snapshotBeforeOptimism } = variables;
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      const timestamp = variables.intentTimestamp ?? Date.now();
      latestStarIntent.current.set(taskId, timestamp);

      const previousTasks =
        snapshotBeforeOptimism ?? queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      if (optimisticApplied) {
        return { previousTasks, taskId, timestamp };
      }

      if (!previousTasks || !Array.isArray(previousTasks)) {
        return { previousTasks, taskId, timestamp };
      }

      const now = new Date();
      const updatedTasks = previousTasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }
        const resolvedLevel =
          typeof targetLevel === "number"
            ? targetLevel
            : ((task.starLevel ?? 0) + 1) % 4;
        return applyStarLevelToTask(task, resolvedLevel, now);
      });

      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, updatedTasks);

      return { previousTasks, taskId, timestamp };
    },
    onError: (error, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
      }
      if (variables?.taskId !== undefined && context?.timestamp !== undefined) {
        const latestTimestamp = latestStarIntent.current.get(variables.taskId);
        if (latestTimestamp === context.timestamp) {
          latestStarIntent.current.delete(variables.taskId);
        }
      }
      toast.error("Failed to update star", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (response, variables, context) => {
      const taskId = variables?.taskId;
      if (taskId !== undefined && context?.timestamp !== undefined) {
        const callerLatestTimestamp = options?.getLatestIntentTimestamp?.(taskId);
        if (
          callerLatestTimestamp !== undefined &&
          callerLatestTimestamp > context.timestamp
        ) {
          return;
        }
        const latestTimestamp = latestStarIntent.current.get(taskId);
        if (latestTimestamp !== undefined && latestTimestamp !== context.timestamp) {
          // A newer click exists; ignore stale response
          return;
        }
        latestStarIntent.current.delete(taskId);
      }

      const resolvedLevel =
        typeof variables?.targetLevel === "number"
          ? variables.targetLevel
          : response.task.starLevel ?? response.newStarLevel ?? 0;

      const serverTouchDate = response.task.lastTouchedAt
        ? new Date(response.task.lastTouchedAt)
        : new Date();

      const authoritativeTask =
        typeof variables?.targetLevel === "number"
          ? applyStarLevelToTask(response.task, resolvedLevel, serverTouchDate, {
              touchTimestamp: serverTouchDate,
            })
          : response.task;

      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) =>
          task.id === authoritativeTask.id ? mergeTaskWithCachedNotes(task, authoritativeTask) : task
        );
      });
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
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      // Snapshot previous values for rollback
      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      // Optimistically update the task
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
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
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
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
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      // Snapshot previous values
      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      // Optimistically update the task
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
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
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
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
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
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
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
      }
      toast.error("Failed to touch task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (touchedTask) => {
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) =>
          task.id === touchedTask.id ? mergeTaskWithCachedNotes(task, touchedTask) : task
        );
      });
    },
  });
}

// Hook: Heat task - Context-aware positioning (moves up 1 position)
export function useTouchTask() {
  const queryClient = useQueryClient();
  const latestMutationRef = useRef(new Map<number, number>());

  return useMutation({
    mutationFn: ({ taskId, visibleTaskIds }: { taskId: number; visibleTaskIds?: number[] }) =>
      heatTask(taskId, visibleTaskIds),
    onMutate: async ({ taskId, visibleTaskIds }) => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      // Snapshot for rollback
      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      if (!visibleTaskIds || visibleTaskIds.length === 0 || !previousTasks) {
        return { previousTasks };
      }

      const currentTask = previousTasks.find((task) => task.id === taskId);

      if (!currentTask) {
        return { previousTasks };
      }

      const now = new Date();

      const currentImportance = calculateImportanceV1(currentTask, now);
      const currentHeat = calculateHeat(currentTask, now, currentImportance);

      const contextTasks = previousTasks
        .filter((task) => visibleTaskIds.includes(task.id) && task.id !== taskId)
        .map((task) => {
          const importance = calculateImportanceV1(task, now);
          const heat = calculateHeat(task, now, importance);
          return { id: task.id, heat };
        });

      const boostDelta = calculateHeatBoost(
        { heat: currentHeat, id: currentTask.id },
        contextTasks
      );

      const targetHeat = Math.min(
        Math.max(
          currentHeat + boostDelta,
          HEAT_CONFIG.MIN_FINAL_SCORE
        ),
        HEAT_CONFIG.MAX_FINAL_SCORE
      );

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

      const mutationTimestamp = now.getTime();
      latestMutationRef.current.set(taskId, mutationTimestamp);

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

      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, applyOptimisticUpdate);

      return { previousTasks, mutationTimestamp, taskId };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
      }
      if (variables?.taskId !== undefined && context?.mutationTimestamp !== undefined) {
        const latestTimestamp = latestMutationRef.current.get(variables.taskId);
        if (latestTimestamp === context.mutationTimestamp) {
          latestMutationRef.current.delete(variables.taskId);
        }
      }
      toast.error("Failed to heat task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (response, variables, context) => {
      if (variables?.taskId !== undefined && context?.mutationTimestamp !== undefined) {
        const latestTimestamp = latestMutationRef.current.get(variables.taskId);
        if (latestTimestamp !== undefined && latestTimestamp !== context.mutationTimestamp) {
          // A newer mutation exists; ignore stale response
          return;
        }
        latestMutationRef.current.delete(variables.taskId);
      }

      // Replace optimistic update with authoritative server response
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
        return oldTasks.map((task) =>
          task.id === response.task.id ? mergeTaskWithCachedNotes(task, response.task) : task
        );
      });

      toast.success("Task heated", {
        description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
      });
    },
  });
}

// Hook: Cool task - Context-aware positioning (moves down 3 positions)
export function useCoolTask() {
  const queryClient = useQueryClient();
  const latestMutationRef = useRef(new Map<number, number>());

  return useMutation({
    mutationFn: ({ taskId, visibleTaskIds }: { taskId: number; visibleTaskIds?: number[] }) =>
      coolTask(taskId, visibleTaskIds),
    onMutate: async ({ taskId, visibleTaskIds }) => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY, exact: true });

      // Snapshot for rollback
      const previousTasks = queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

      if (!visibleTaskIds || visibleTaskIds.length === 0 || !previousTasks) {
        return { previousTasks };
      }

      const currentTask = previousTasks.find((task) => task.id === taskId);

      if (!currentTask) {
        return { previousTasks };
      }

      const now = new Date();

      const currentImportance = calculateImportanceV1(currentTask, now);
      const currentHeat = calculateHeat(currentTask, now, currentImportance);

      const contextTasks = previousTasks
        .filter((task) => visibleTaskIds.includes(task.id) && task.id !== taskId)
        .map((task) => {
          const importance = calculateImportanceV1(task, now);
          const heat = calculateHeat(task, now, importance);
          return { id: task.id, heat };
        });

      const dropDelta = calculateCoolDrop(
        { heat: currentHeat, id: currentTask.id },
        contextTasks
      );

      const targetHeat = Math.min(
        Math.max(
          currentHeat + dropDelta,
          HEAT_CONFIG.MIN_FINAL_SCORE
        ),
        HEAT_CONFIG.MAX_FINAL_SCORE
      );

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

      const mutationTimestamp = now.getTime();
      latestMutationRef.current.set(taskId, mutationTimestamp);

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

      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, applyOptimisticUpdate);

      return { previousTasks, mutationTimestamp, taskId };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(PRIMARY_TASKS_QUERY_KEY, context.previousTasks);
      }
      if (variables?.taskId !== undefined && context?.mutationTimestamp !== undefined) {
        const latestTimestamp = latestMutationRef.current.get(variables.taskId);
        if (latestTimestamp === context.mutationTimestamp) {
          latestMutationRef.current.delete(variables.taskId);
        }
      }
      toast.error("Failed to cool task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (response, variables, context) => {
      if (variables?.taskId !== undefined && context?.mutationTimestamp !== undefined) {
        const latestTimestamp = latestMutationRef.current.get(variables.taskId);
        if (latestTimestamp !== undefined && latestTimestamp !== context.mutationTimestamp) {
          return;
        }
        latestMutationRef.current.delete(variables.taskId);
      }

      // Replace optimistic update with authoritative server response
      queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
        return oldTasks.map((task) =>
          task.id === response.task.id ? mergeTaskWithCachedNotes(task, response.task) : task
        );
      });

      toast.success("Task cooled", {
        description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
      });
    },
  });
}
