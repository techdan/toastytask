import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import type { Task, NewTask } from "@/types";

interface TaskResponse {
  task: Task;
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
    onSuccess: () => {
      // Invalidate tasks queries to refetch with new task
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
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
          const updatedTask = { ...task, ...updates };

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
