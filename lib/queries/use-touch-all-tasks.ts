import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Task } from "@/types";

interface TouchAllMessages {
  successMessage?: string;
  errorMessage?: string;
}

const normalizeToDate = (
  value: Task["createdAt"] | string | number | null | undefined
) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    const milliseconds = value < 1e12 ? value * 1000 : value;
    return new Date(milliseconds);
  }

  if (typeof value === "string" && value.length > 0) {
    return new Date(value);
  }

  return new Date();
};

export function useTouchAllTasks() {
  const queryClient = useQueryClient();
  const [isTouchingAll, setIsTouchingAll] = useState(false);

  const touchAllTasks = useCallback(
    async (messages?: TouchAllMessages) => {
      if (isTouchingAll) {
        return;
      }

      setIsTouchingAll(true);

      const previousTasks = queryClient.getQueriesData<Task[]>({
        queryKey: ["tasks"],
      });

      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks) || oldTasks.length === 0) {
          return oldTasks;
        }

        let hasChanges = false;

        const updatedTasks = oldTasks.map((task): Task => {
          if (task.lastTouchedAt || task.lastHeatTouchedAt) {
            return task;
          }

          hasChanges = true;
          const createdAtDate = normalizeToDate(task.createdAt);

          return {
            ...task,
            lastTouchedAt: createdAtDate,
            lastHeatTouchedAt: createdAtDate,
          };
        });

        return hasChanges ? updatedTasks : oldTasks;
      });

      try {
        const response = await fetch("/api/tasks/touch-all", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Failed to touch all tasks");
        }

        const data = await response.json();
        toast.success(
          messages?.successMessage || data.message || "All tasks marked as touched"
        );

        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      } catch (error) {
        previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });

        toast.error(messages?.errorMessage || "Failed to touch all tasks");
        throw error;
      } finally {
        setIsTouchingAll(false);
      }
    },
    [isTouchingAll, queryClient]
  );

  return { touchAllTasks, isTouchingAll };
}
