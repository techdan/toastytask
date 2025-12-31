import type { TaskWithFreshValuesDTO } from "@toasty/contracts";

/**
 * Sort modes for the mobile app task list
 * Extended from the contracts SortMode to include date-based sorts
 */
export type MobileSortMode = "importance" | "heat" | "createdAt" | "updatedAt";

/**
 * Sort direction
 */
export type SortDirection = "asc" | "desc";

/**
 * Convert a date string or null to milliseconds for comparison
 */
function toMilliseconds(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  return new Date(value).getTime();
}

/**
 * Compare two tasks by created date (descending - newest first)
 */
function compareCreatedDesc(
  a: TaskWithFreshValuesDTO,
  b: TaskWithFreshValuesDTO
): number {
  const aCreated = toMilliseconds(a.createdAt);
  const bCreated = toMilliseconds(b.createdAt);
  return bCreated - aCreated;
}

/**
 * Get the effective update time for a task
 * Falls back through updatedAt -> lastTouchedAt -> lastHeatTouchedAt -> createdAt
 */
function getUpdatedTime(task: TaskWithFreshValuesDTO): number {
  if (task.updatedAt) {
    return toMilliseconds(task.updatedAt);
  }
  if (task.lastTouchedAt) {
    return toMilliseconds(task.lastTouchedAt);
  }
  if (task.lastHeatTouchedAt) {
    return toMilliseconds(task.lastHeatTouchedAt);
  }
  return toMilliseconds(task.createdAt);
}

/**
 * Check if a task is untouched (new task that hasn't been interacted with)
 */
function isUntouched(task: TaskWithFreshValuesDTO): boolean {
  return !task.lastHeatTouchedAt && !task.lastTouchedAt;
}

/**
 * Compare two tasks based on sort mode
 * Handles:
 * - Completed tasks always sort to bottom
 * - Untouched tasks pinned to top (for heat/importance modes)
 * - Due date tie-breaker
 * - Created date tie-breaker
 */
export function compareTasks(
  a: TaskWithFreshValuesDTO,
  b: TaskWithFreshValuesDTO,
  sortMode: MobileSortMode
): number {
  // Completed tasks always sort to bottom
  if (a.completedAt && !b.completedAt) return 1;
  if (!a.completedAt && b.completedAt) return -1;

  // If both tasks are completed, sort by completion date (most recent first)
  if (a.completedAt && b.completedAt) {
    const aCompletedTime = toMilliseconds(a.completedAt);
    const bCompletedTime = toMilliseconds(b.completedAt);
    return bCompletedTime - aCompletedTime;
  }

  // Handle date-based sort modes
  if (sortMode === "createdAt") {
    const createdDiff = compareCreatedDesc(a, b);
    if (createdDiff !== 0) {
      return createdDiff;
    }
  } else if (sortMode === "updatedAt") {
    const updatedDiff = getUpdatedTime(b) - getUpdatedTime(a);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }
  } else {
    // Heat/Importance modes - pin untouched tasks to top
    const aIsUntouched = isUntouched(a);
    const bIsUntouched = isUntouched(b);

    if (aIsUntouched && !bIsUntouched) return -1;
    if (!aIsUntouched && bIsUntouched) return 1;

    // Both untouched - sort by heat/importance, then created
    if (aIsUntouched && bIsUntouched) {
      const sortValue =
        sortMode === "heat" ? a._freshHeat || 0 : a._freshImportance;
      const sortValueB =
        sortMode === "heat" ? b._freshHeat || 0 : b._freshImportance;

      if (sortValueB !== sortValue) {
        return sortValueB - sortValue;
      }

      return compareCreatedDesc(a, b);
    }

    // Normal tasks - sort by heat/importance
    const sortValue =
      sortMode === "heat" ? a._freshHeat || 0 : a._freshImportance;
    const sortValueB =
      sortMode === "heat" ? b._freshHeat || 0 : b._freshImportance;

    if (sortValueB !== sortValue) {
      return sortValueB - sortValue;
    }

    // Tie-breaker for equal heat: more recently heated tasks sort first
    if (sortMode === "heat") {
      const aHeatTime = a.lastHeatTouchedAt
        ? toMilliseconds(a.lastHeatTouchedAt)
        : 0;
      const bHeatTime = b.lastHeatTouchedAt
        ? toMilliseconds(b.lastHeatTouchedAt)
        : 0;
      if (bHeatTime !== aHeatTime) {
        return bHeatTime - aHeatTime;
      }
    }
  }

  // Due date tie-breaker - tasks with due dates sort before tasks without
  if (a.dueAt && b.dueAt) {
    const aTime = toMilliseconds(a.dueAt);
    const bTime = toMilliseconds(b.dueAt);
    if (aTime !== bTime) {
      return aTime - bTime;
    }
  }
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;

  // Final tie-breaker: created date
  return compareCreatedDesc(a, b);
}

/**
 * Sort tasks by the specified mode and direction
 *
 * @param tasks - Array of tasks to sort
 * @param sortMode - The sorting mode to use
 * @param direction - Sort direction (asc or desc)
 * @returns New sorted array (does not mutate original)
 */
export function sortTasksByMode(
  tasks: TaskWithFreshValuesDTO[],
  sortMode: MobileSortMode,
  direction: SortDirection
): TaskWithFreshValuesDTO[] {
  return [...tasks].sort((a, b) => {
    const baseComparison = compareTasks(a, b, sortMode);
    // For "desc", we use the natural comparison (high values first for importance/heat)
    // For "asc", we invert it
    return direction === "asc" ? -baseComparison : baseComparison;
  });
}

/**
 * Filter and sort tasks for display
 * Combines filtering by project/focus with sorting
 */
export function filterAndSortTasks(
  tasks: TaskWithFreshValuesDTO[],
  options: {
    projectId?: number | null | "all" | "focus";
    sortMode: MobileSortMode;
    sortDirection: SortDirection;
    showCompleted?: boolean;
  }
): TaskWithFreshValuesDTO[] {
  let filtered = tasks;

  // Filter by project
  if (options.projectId !== undefined && options.projectId !== "all") {
    if (options.projectId === "focus") {
      filtered = filtered.filter((task) => task.isFocused);
    } else if (options.projectId === null) {
      // "No Project" filter
      filtered = filtered.filter((task) => task.projectId === null);
    } else {
      filtered = filtered.filter(
        (task) => task.projectId === options.projectId
      );
    }
  }

  // Filter completed unless showing them
  if (!options.showCompleted) {
    filtered = filtered.filter((task) => !task.completedAt);
  }

  return sortTasksByMode(filtered, options.sortMode, options.sortDirection);
}
