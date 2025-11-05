"use client";

import { TaskRow } from "./task-row";
import { TaskListHeader } from "./task-list-header";
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
          <col />
          <col className="w-[120px]" />
          <col className="w-[90px]" />
          <col className="w-[100px]" />
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
              allVisibleTasks={tasks}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
            />
          </tbody>
        ))}
      </table>
    </div>
  );
}
