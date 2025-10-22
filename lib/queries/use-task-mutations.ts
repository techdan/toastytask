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
