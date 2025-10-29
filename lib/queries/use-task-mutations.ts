import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v2";
import type { Task, NewTask } from "@/types";
import type { HeatBreakdown } from "@/lib/scoring/heat-v2";

interface TaskResponse {
  task: Task;
}

interface TouchTaskResponse {
  task: Task;
  heatDelta: number;
  heatBreakdown: HeatBreakdown;
  decayFactor: number;
}

interface SnoozeTaskResponse {
  task: Task;
  heatDelta: number;
  heatBreakdown: HeatBreakdown;
  decayFactor: number;
  touchesRetained: number;
  resurfaceDate: Date;
  daysUntilResurface: number;
}

interface UpdateTaskData {
  id: number;
  updates: Partial<Task>;
}

interface SnoozeTaskData {
  id: number;
  nextSurfaceAt: Date;
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
        star: newTask.star ?? false,
        dueAt: newTask.dueAt ?? null,
        bucket: newTask.bucket ?? "todo",
        repeatType: newTask.repeatType ?? "none",
        heat: newTask.heat ?? 0.5,
        heatCalculatedAt: null,
        heatTouchCount: 0,
        otherTouchCount: 0,
        lastHeatTouchedAt: null,
        lastTouchedAt: null,
        nextSurfaceAt: null,
        coldStorageAt: null,
        touchCount: newTask.touchCount ?? 0,
        importanceV1: newTask.importanceV1 ?? 0,
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        notes: [],
        notesCount: 0,
        notesLastModified: null,
      };

      // Recalculate importance client-side for immediate feedback
      optimisticTask.importanceV1 = calculateImportanceV1(optimisticTask);

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
            // Increment otherTouchCount to remove green styling on any edit
            otherTouchCount: task.otherTouchCount + 1,
          };

          // INSTANT IMPORTANCE: Recalculate client-side if relevant fields changed
          // This provides immediate UI feedback while server confirms
          if (
            updates.priority !== undefined ||
            updates.star !== undefined ||
            updates.dueAt !== undefined
          ) {
            updatedTask.importanceV1 = calculateImportanceV1(updatedTask);
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
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
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

            // INSTANT IMPORTANCE: Recalculate since due date changed
            updatedTask.importanceV1 = calculateImportanceV1(updatedTask);

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

// Touch task (heat warm interaction)
async function touchTask(id: number): Promise<TouchTaskResponse> {
  const response = await fetch(`/api/tasks/${id}/touch`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to touch task");
  }

  return response.json();
}

// Snooze task (cool interaction)
async function snoozeTask({ id, nextSurfaceAt }: SnoozeTaskData): Promise<SnoozeTaskResponse> {
  const response = await fetch(`/api/tasks/${id}/snooze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nextSurfaceAt }),
  });

  if (!response.ok) {
    throw new Error("Failed to snooze task");
  }

  return response.json();
}

// Hook: Touch task (warm interaction with decay-on-touch)
export function useTouchTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: touchTask,
    onMutate: async (taskId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot previous values
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Optimistically update the task (approximate heat calculation)
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) => {
          if (task.id !== taskId) return task;

          // Optimistic updates:
          // 1. Remove green styling if first touch (increment heatTouchCount)
          // 2. Update heat (recalculate client-side)
          // 3. Position stays stable (no re-sort)
          const now = new Date();
          const updatedTask = {
            ...task,
            heatTouchCount: task.heatTouchCount + 1, // Increment to remove green styling
            lastTouchedAt: now,
            lastHeatTouchedAt: now,
          };

          // Recalculate heat client-side for immediate feedback
          updatedTask.heat = calculateHeat(updatedTask, now);

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
      toast.error("Failed to touch task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (response) => {
      // Update with server response
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        return oldTasks.map((task) =>
          task.id === response.task.id ? response.task : task
        );
      });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// Hook: Snooze task (cool interaction with projected decay)
export function useSnoozeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: snoozeTask,
    onMutate: async ({ id, nextSurfaceAt }) => {
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
          if (task.id !== id) return task;

          // Optimistic updates:
          // 1. Set next_surface_at
          // 2. Increment heatTouchCount to remove green styling
          // 3. Update heat (recalculate with new snooze date)
          // 4. Task will drop to new position (exception to manual refresh)
          const now = new Date();
          const updatedTask = {
            ...task,
            nextSurfaceAt: nextSurfaceAt,
            heatTouchCount: task.heatTouchCount + 1, // Increment to remove green styling
            lastTouchedAt: now,
            lastHeatTouchedAt: now,
          };

          // Recalculate heat client-side for immediate feedback
          updatedTask.heat = calculateHeat(updatedTask, now);

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
      toast.error("Failed to snooze task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (response) => {
      // Update with server response and re-sort
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        // Replace the updated task and re-sort by heat
        const updatedTasks = oldTasks.map((task) =>
          task.id === response.task.id ? response.task : task
        );

        // Exception: Auto-resort on snooze
        return updatedTasks.sort((a, b) => b.heat - a.heat);
      });

      toast.success("Task snoozed", {
        description: `Will resurface in ${Math.round(response.daysUntilResurface)} days`,
      });
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
