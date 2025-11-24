"use client";

import { useCallback } from "react";
import { TaskRow } from "./task-row";
import { TaskListHeader } from "./task-list-header";
import { MobileTaskTable } from "./mobile-task-table";
import { cn } from "@/lib/utils";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import type { Task, SortMode, Project, TaskWithFreshValues, TaskDensity, SortDirection } from "@/types";

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
  onHeat: (taskId: number, visibleTaskIds: Array<{ id: number; heat: number }>) => void;
  onCool: (taskId: number, visibleTaskIds: Array<{ id: number; heat: number }>) => void;
  onTouch: (taskId: number) => void;
  highlightedTask?: {
    id: number;
    mode: "heat" | "cool" | "due";
  } | null;
  recurringCompletionSignals: ReadonlyMap<number, number>;
  isMobile?: boolean;
  enableSwipeGestures?: boolean;
  onTaskPress?: (taskId: number) => void;
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
  isMobile = false,
  enableSwipeGestures = false,
  onTaskPress,
}: TaskListProps) {
  // Helper function to get all active tasks with client-calculated heats
  // CRITICAL FIX FOR TIMEZONE BUG: Client calculates heats using correct local timezone.
  // Server was calculating heats in UTC while client used local time, causing 7-8 point
  // heat mismatches for tasks with due dates. This led to sparse task distribution on server
  // and context-aware positioning failures.
  //
  // Solution: Client sends pre-calculated heats along with IDs. Server uses client heats
  // for context-aware positioning logic, ensuring both see the same task distribution.
  // Server still independently calculates authoritative heat for the target task (for storage).
  const getAllActiveTasksWithHeats = useCallback((): Array<{ id: number; heat: number }> => {
    const activeTasks = tasks.filter((t) => !t.completedAt);
    const now = new Date();

    return activeTasks.map((task) => {
      // Calculate heat using client's local timezone (correct for due date calculations)
      const importance = calculateImportanceV1(task, now);
      const heat = calculateHeat(task, now, importance);
      return { id: task.id, heat };
    });
  }, [tasks]);

  // Heat handler: increases heat adjustment to move task up
  const handleHeat = useCallback(
    (taskId: number) => {
      const allActiveTasksWithHeats = getAllActiveTasksWithHeats();
      onHeat(taskId, allActiveTasksWithHeats);
    },
    [getAllActiveTasksWithHeats, onHeat]
  );

  // Cool handler: decreases heat adjustment to move task down
  const handleCool = useCallback(
    (taskId: number) => {
      const allActiveTasksWithHeats = getAllActiveTasksWithHeats();
      onCool(taskId, allActiveTasksWithHeats);
    },
    [getAllActiveTasksWithHeats, onCool]
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

  if (isMobile) {
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    return (
      <div className="divide-y divide-border">
        {tasks.map((task) => (
          <MobileTaskTable
            key={task.id}
            task={task}
            projectMap={projectMap}
            density={density}
            onComplete={onComplete}
            onUncomplete={onUncomplete}
            onStar={onStar}
            onHeat={handleHeat}
            onCool={handleCool}
            enableSwipe={enableSwipeGestures}
            onClick={() => onTaskPress?.(task.id)}
            sortMode={sortMode}
          />
        ))}
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
