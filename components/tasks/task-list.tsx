"use client";

import { useCallback } from "react";
import { TaskRow } from "./task-row";
import { TaskListHeader } from "./task-list-header";
import { cn } from "@/lib/utils";
import type { Task, SortMode, Project, TaskWithFreshValues, TaskDensity, SortDirection } from "@/types";

const CONTEXT_WINDOW = 20;

interface TaskListProps {
  tasks: TaskWithFreshValues[];
  projects: Project[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
  sortMode: SortMode;
  sortDirection: SortDirection;
  onSortModeChange: (mode: SortMode) => void;
  onToggleSortDirection: () => void;
  onRefreshOrder: () => Promise<void> | void;
  isRefreshingOrder: boolean;
  density: TaskDensity;
  onDensityChange: (density: TaskDensity) => void;
  onUpdate: (id: number, updates: Partial<Task>) => void;
  onStar: (id: number) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onUncomplete: (id: number) => void;
  onHeat: (taskId: number, visibleTaskIds: number[]) => void;
  onCool: (taskId: number, visibleTaskIds: number[]) => void;
  onTouch: (taskId: number) => void;
  highlightedTask?: {
    id: number;
    mode: "heat" | "cool" | "due";
  } | null;
  recurringCompletionSignals: ReadonlyMap<number, number>;
}

export function TaskList({
  tasks,
  projects,
  showCompleted,
  onToggleCompleted,
  sortMode,
  sortDirection,
  onSortModeChange,
  onToggleSortDirection,
  onRefreshOrder,
  isRefreshingOrder,
  density,
  onDensityChange,
  onUpdate,
  onStar,
  onDelete,
  onComplete,
  onUncomplete,
  onHeat,
  onCool,
  onTouch,
  highlightedTask,
  recurringCompletionSignals,
}: TaskListProps) {

  // Helper function to get nearby task IDs based on the actual on-screen order
  const stringifyIds = (ids: number[]) => ids.join(",") || "(empty)";

  const getNearbyTaskIds = useCallback((taskId: number, mutationType: "heat" | "cool"): number[] => {
    const activeTasks = tasks.filter((t) => !t.completedAt);
    if (activeTasks.length === 0) {
      console.debug("[heat-context] empty-active-list", {
        mutationType,
        taskId,
      });
      return [];
    }

    const targetIndex = activeTasks.findIndex((t) => t.id === taskId);
    if (targetIndex === -1) {
      const fallbackIds = activeTasks.map((task) => task.id);
      console.warn("[heat-context] target-missing", {
        mutationType,
        taskId,
        activeTaskCount: activeTasks.length,
        fallbackIds,
        fallbackIdsText: stringifyIds(fallbackIds),
      });
      return fallbackIds;
    }

    const start = Math.max(0, targetIndex - CONTEXT_WINDOW);
    const end = Math.min(activeTasks.length, targetIndex + CONTEXT_WINDOW + 1);
    const windowTasks = activeTasks.slice(start, end);
    const nearbyTaskIds = windowTasks.map((task) => task.id);

    const previewBefore = activeTasks
      .slice(Math.max(0, targetIndex - 3), targetIndex)
      .map((task) => task.id);
    const previewAfter = activeTasks
      .slice(targetIndex + 1, Math.min(activeTasks.length, targetIndex + 4))
      .map((task) => task.id);
    const activeTaskIds = activeTasks.map((task) => task.id);
    console.debug("[heat-context] window", {
      mutationType,
      taskId,
      sortMode,
      sortDirection,
      showCompleted,
      activeTaskCount: activeTasks.length,
      targetIndex,
      windowStart: start,
      windowEndExclusive: end,
      windowSize: nearbyTaskIds.length,
      previewBefore,
      previewBeforeText: stringifyIds(previewBefore),
      previewAfter,
      previewAfterText: stringifyIds(previewAfter),
      contextIds: nearbyTaskIds,
      contextIdsText: stringifyIds(nearbyTaskIds),
      activeSample:
        activeTaskIds.length > 80
          ? {
              head: activeTaskIds.slice(0, 40),
              headText: stringifyIds(activeTaskIds.slice(0, 40)),
              tail: activeTaskIds.slice(-40),
              tailText: stringifyIds(activeTaskIds.slice(-40)),
            }
          : activeTaskIds,
      activeSampleText:
        activeTaskIds.length > 80
          ? undefined
          : stringifyIds(activeTaskIds),
    });

    return nearbyTaskIds;
  }, [showCompleted, sortDirection, sortMode, tasks]);

  // Heat handler: increases heat adjustment to move task up
  const handleHeat = useCallback(
    (taskId: number) => {
      const nearbyTaskIds = getNearbyTaskIds(taskId, "heat");
      onHeat(taskId, nearbyTaskIds);
    },
    [getNearbyTaskIds, onHeat]
  );

  // Cool handler: decreases heat adjustment to move task down
  const handleCool = useCallback(
    (taskId: number) => {
      const nearbyTaskIds = getNearbyTaskIds(taskId, "cool");
      onCool(taskId, nearbyTaskIds);
    },
    [getNearbyTaskIds, onCool]
  );

  const handleTouch = useCallback(
    (taskId: number) => {
      onTouch(taskId);
    },
    [onTouch]
  );

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No tasks yet. Add one to get started!</p>
      </div>
    );
  }

  return (
    <div className={cn(density === "compact" && "rounded-lg border border-border/70 bg-card/30 shadow-sm")}>
      <table
        className={cn(
          "w-full border-spacing-0",
          density === "comfortable" ? "border-separate" : "border-collapse"
        )}
      >
        {/* Column definitions: task (checkbox, importance, star, notes, title), due date, priority, project, recurrence, actions */}
        <colgroup>
          <col className="w-[160px]" />
          <col />
          <col className="w-[92px]" />
          <col className="w-[84px]" />
          <col className="w-[110px]" />
          <col className="w-[96px]" />
          <col className="w-10" />
        </colgroup>
        <TaskListHeader
          showCompleted={showCompleted}
          onToggleCompleted={onToggleCompleted}
          sortMode={sortMode}
          sortDirection={sortDirection}
          onSortModeChange={onSortModeChange}
          onToggleSortDirection={onToggleSortDirection}
          onRefreshOrder={onRefreshOrder}
          isRefreshingOrder={isRefreshingOrder}
          density={density}
          onDensityChange={onDensityChange}
        />
        {tasks.map((task) => {
          const highlightMode = highlightedTask?.id === task.id ? highlightedTask.mode : null;
          return (
            <tbody
              key={task.id}
              className={cn(
                density === "comfortable" && "before:content-[''] before:block before:h-2"
              )}
            >
              <TaskRow
                task={task}
                projects={projects}
                sortMode={sortMode}
                density={density}
                onUpdate={onUpdate}
                onStar={onStar}
                onDelete={onDelete}
                onComplete={onComplete}
                onUncomplete={onUncomplete}
                onHeat={handleHeat}
                onCool={handleCool}
                onTouch={handleTouch}
                highlightMode={highlightMode}
                recurringCompletionSignal={recurringCompletionSignals.get(task.id)}
              />
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
