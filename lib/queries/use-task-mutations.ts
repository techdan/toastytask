import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import type { Task, NewTask } from "@/types";
import type { HeatV3Breakdown } from "@/lib/scoring/heat-v3";

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

      // Optimistically add task to all task queries
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        // Don't update if no data exists yet
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        // Add the new task at the beginning
        return [optimisticTask, ...oldTasks];
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
      // CRITICAL: Replace optimistic update with authoritative server response
      // This ensures ALL queries have correct importanceV1 and other server-calculated fields
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }
        return oldTasks.map((task) =>
          task.id === updatedTask.id ? updatedTask : task
        );
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

  const nextDate = new Date(baseDate);

  switch (repeatType) {
    case "daily":
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case "weekly":
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case "monthly":
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    default:
      return baseDate;
  }

  return nextDate;
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
    onSettled: () => {
      // Refetch to get the actual updated task from server
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
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
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
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

// Hook: Heat task - Context-aware positioning (moves up 1 position)
export function useTouchTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, visibleTaskIds }: { taskId: number; visibleTaskIds?: number[] }) =>
      heatTask(taskId, visibleTaskIds),
    onMutate: async () => {
      // No optimistic updates - server is source of truth
      // Cancel pending queries to avoid race conditions
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      return { previousTasks };
    },
    onError: (error, _variables, context) => {
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
      // Refetch all task queries to get fresh server data
      queryClient.invalidateQueries({ queryKey: ["tasks"] });

      toast.success("Task heated", {
        description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
      });
    },
  });
}

// Hook: Cool task - Context-aware positioning (moves down 3 positions)
export function useCoolTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, visibleTaskIds }: { taskId: number; visibleTaskIds?: number[] }) =>
      coolTask(taskId, visibleTaskIds),
    onMutate: async () => {
      // No optimistic updates - server is source of truth
      // Cancel pending queries to avoid race conditions
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      return { previousTasks };
    },
    onError: (error, _variables, context) => {
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
      // Refetch all task queries to get fresh server data
      queryClient.invalidateQueries({ queryKey: ["tasks"] });

      toast.success("Task cooled", {
        description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
      });
    },
  });
}
