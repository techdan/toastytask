import { useMemo } from "react";
import { calculateImportanceV1, calculateImportanceV1WithFactors } from "@/lib/scoring/importance-v1";
import type { Task } from "@/types";

/**
 * Hook to calculate importance for a task
 * Pure calculation architecture: importance is calculated on-demand from base properties
 *
 * @param task - Task with priority, dueAt, and starLevel
 * @param now - Current timestamp for calculation (defaults to new Date())
 * @returns Calculated importance score (2-14)
 */
export function useTaskImportance(
  task: Pick<Task, "priority" | "dueAt" | "starLevel">,
  now?: Date
): number {
  return useMemo(
    () => calculateImportanceV1(task, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task.priority, task.dueAt, task.starLevel, now]
  );
}

/**
 * Hook to calculate importance with detailed breakdown for a task
 * Pure calculation architecture: importance is calculated on-demand from base properties
 *
 * @param task - Task with priority, dueAt, and starLevel
 * @param now - Current timestamp for calculation (defaults to new Date())
 * @returns Importance factors breakdown with total score
 */
export function useTaskImportanceWithFactors(
  task: Pick<Task, "priority" | "dueAt" | "starLevel">,
  now?: Date
) {
  return useMemo(
    () => calculateImportanceV1WithFactors(task, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task.priority, task.dueAt, task.starLevel, now]
  );
}
