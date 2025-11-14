import type { Task } from "@/types";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";

/**
 * Merge fields that are absent on an incoming task response with the cached copy.
 * Many single-task endpoints omit note metadata, so we preserve the cached notes,
 * counts, and last-modified timestamps whenever the server does not send them.
 */
export function mergeTaskWithCachedNotes(existing: Task | undefined, incoming: Task): Task {
  if (!existing) {
    return incoming;
  }

  return {
    ...incoming,
    notes: typeof incoming.notes === "undefined" ? existing.notes : incoming.notes,
    notesCount: typeof incoming.notesCount === "undefined" ? existing.notesCount : incoming.notesCount,
    notesLastModified:
      typeof incoming.notesLastModified === "undefined"
        ? existing.notesLastModified
        : incoming.notesLastModified,
  };
}

/**
 * Replace a task within a cached array, preserving cached note metadata when needed.
 */
export function replaceTaskPreservingNotes(
  tasks: Task[] | undefined,
  incoming: Task
): Task[] | undefined {
  if (!tasks || !Array.isArray(tasks)) {
    return tasks;
  }

  let didReplace = false;
  const next = tasks.map((task) => {
    if (task.id !== incoming.id) {
      return task;
    }
    didReplace = true;
    return mergeTaskWithCachedNotes(task, incoming);
  });

  return didReplace ? next : tasks;
}

/**
 * Apply a new star level to a task, updating timestamps and recalculating heat.
 */
export function applyStarLevelToTask(
  task: Task,
  targetLevel: number,
  now: Date,
  options?: { touchTimestamp?: Date }
): Task {
  const effectiveLastTouchedAt = options?.touchTimestamp ?? now;

  const updatedTask = {
    ...task,
    starLevel: targetLevel,
    lastTouchedAt: effectiveLastTouchedAt,
  };

  const freshImportance = calculateImportanceV1(updatedTask, effectiveLastTouchedAt);

  return {
    ...updatedTask,
    heat: calculateHeat(updatedTask, effectiveLastTouchedAt, freshImportance),
    heatCalculatedAt: effectiveLastTouchedAt,
  };
}
