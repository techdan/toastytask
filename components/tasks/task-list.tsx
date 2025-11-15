"use client";

import { useCallback } from "react";
import { TaskRow } from "./task-row";
import { TaskListHeader } from "./task-list-header";
import type { Task, SortMode, Project, TaskWithFreshValues } from "@/types";

type FreshMetricKey = Extract<keyof TaskWithFreshValues, "_freshHeat" | "_freshImportance">;

interface TaskListProps {
  tasks: TaskWithFreshValues[];
  projects: Project[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  onRefreshOrder: () => Promise<void> | void;
  isRefreshingOrder: boolean;
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
    mode: "heat" | "cool";
  } | null;
}

export function TaskList({
  tasks,
  projects,
  showCompleted,
  onToggleCompleted,
  sortMode,
  onSortModeChange,
  onRefreshOrder,
  isRefreshingOrder,
  onUpdate,
  onStar,
  onDelete,
  onComplete,
  onUncomplete,
  onHeat,
  onCool,
  onTouch,
  highlightedTask,
}: TaskListProps) {

  // Helper function to get nearby task IDs for optimistic updates
  // Performance optimization: only process ~20 nearby tasks instead of all tasks (10x improvement)
  const getNearbyTaskIds = useCallback((taskId: number): number[] => {
    const metricKey: FreshMetricKey = sortMode === "heat" ? "_freshHeat" : "_freshImportance";
    const incompleteTasks = tasks.filter((t) => !t.completedAt);
    const targetTask = incompleteTasks.find((t) => t.id === taskId);

    if (!targetTask) {
      return incompleteTasks.map((t) => t.id);
    }

    const targetValue = targetTask[metricKey] ?? 0;

    return incompleteTasks
      .map((task) => ({
        id: task.id,
        distance: Math.abs((task[metricKey] ?? 0) - targetValue),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 21)
      .map((task) => task.id);
  }, [sortMode, tasks]);

  // Heat handler: increases heat adjustment to move task up
  const handleHeat = useCallback(
    (taskId: number) => {
      const nearbyTaskIds = getNearbyTaskIds(taskId);
      onHeat(taskId, nearbyTaskIds);
    },
    [getNearbyTaskIds, onHeat]
  );

  // Cool handler: decreases heat adjustment to move task down
  const handleCool = useCallback(
    (taskId: number) => {
      const nearbyTaskIds = getNearbyTaskIds(taskId);
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
    <div>
      <table className="w-full border-separate border-spacing-0">
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
          onSortModeChange={onSortModeChange}
          onRefreshOrder={onRefreshOrder}
          isRefreshingOrder={isRefreshingOrder}
        />
        {tasks.map((task) => {
          const highlightMode = highlightedTask?.id === task.id ? highlightedTask.mode : null;
          return (
          <tbody key={task.id} className="before:content-[''] before:block before:h-2">
            <TaskRow
              task={task}
              projects={projects}
              sortMode={sortMode}
              onUpdate={onUpdate}
              onStar={onStar}
              onDelete={onDelete}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onHeat={handleHeat}
              onCool={handleCool}
              onTouch={handleTouch}
              highlightMode={highlightMode}
            />
          </tbody>
        );
        })}
      </table>
    </div>
  );
}
