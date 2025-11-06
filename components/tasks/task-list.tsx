"use client";

import { useCallback } from "react";
import { TaskRow } from "./task-row";
import { TaskListHeader } from "./task-list-header";
import { useTouchTask, useCoolTask, useMarkTaskTouched } from "@/lib/queries/use-task-mutations";
import type { Task, SortMode } from "@/types";

// Task with computed fresh heat for accurate context-aware positioning
type TaskWithFreshHeat = Task & { _freshHeat: number };

interface TaskListProps {
  tasks: TaskWithFreshHeat[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  onUpdate: (id: number, updates: Partial<Task>) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onUncomplete: (id: number) => void;
}

export function TaskList({
  tasks,
  showCompleted,
  onToggleCompleted,
  sortMode,
  onSortModeChange,
  onUpdate,
  onDelete,
  onComplete,
  onUncomplete
}: TaskListProps) {
  const touchTaskMutation = useTouchTask();
  const coolTaskMutation = useCoolTask();
  const markTaskTouchedMutation = useMarkTaskTouched();

  // Helper function to get nearby task IDs for optimistic updates
  // Performance optimization: only process ~20 nearby tasks instead of all tasks (10x improvement)
  const getNearbyTaskIds = useCallback((taskId: number): number[] => {
    const incompleteTasks = tasks.filter(t => !t.completedAt);
    const currentIndex = incompleteTasks.findIndex(t => t.id === taskId);

    if (currentIndex === -1) {
      // Fallback: if task not found, use all visible tasks
      return incompleteTasks.map(t => t.id);
    }

    // Get 10 tasks above and 10 tasks below (+ current task)
    const start = Math.max(0, currentIndex - 10);
    const end = Math.min(incompleteTasks.length, currentIndex + 10 + 1);
    return incompleteTasks.slice(start, end).map(t => t.id);
  }, [tasks]);

  // Heat handler: increases heat adjustment to move task up
  const handleHeat = useCallback((taskId: number) => {
    const nearbyTaskIds = getNearbyTaskIds(taskId);
    touchTaskMutation.mutate({ taskId, visibleTaskIds: nearbyTaskIds });
  }, [getNearbyTaskIds, touchTaskMutation]);

  // Cool handler: decreases heat adjustment to move task down
  const handleCool = useCallback((taskId: number) => {
    const nearbyTaskIds = getNearbyTaskIds(taskId);
    coolTaskMutation.mutate({ taskId, visibleTaskIds: nearbyTaskIds });
  }, [getNearbyTaskIds, coolTaskMutation]);

  const handleTouch = useCallback((taskId: number) => {
    markTaskTouchedMutation.mutate(taskId);
  }, [markTaskTouchedMutation]);

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
        {/* Column definitions: task (checkbox, importance, star, notes, title), due date, priority, recurrence, actions */}
        <colgroup>
          <col className="w-[160px]" />
          <col />
          <col className="w-[92px]" />
          <col className="w-[84px]" />
          <col className="w-[96px]" />
          <col className="w-10" />
        </colgroup>
        <TaskListHeader
          showCompleted={showCompleted}
          onToggleCompleted={onToggleCompleted}
          sortMode={sortMode}
          onSortModeChange={onSortModeChange}
        />
        {tasks.map((task) => (
          <tbody key={task.id} className="before:content-[''] before:block before:h-2">
            <TaskRow
              task={task}
              sortMode={sortMode}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onHeat={handleHeat}
              onCool={handleCool}
              onTouch={handleTouch}
            />
          </tbody>
        ))}
      </table>
    </div>
  );
}
