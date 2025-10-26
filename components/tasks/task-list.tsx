"use client";

import { TaskRow } from "./task-row";
import { TaskListHeader } from "./task-list-header";
import type { Task } from "@/types";

interface TaskListProps {
  tasks: Task[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
  onUpdate: (id: number, updates: Partial<Task>) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onUncomplete: (id: number) => void;
}

export function TaskList({
  tasks,
  showCompleted,
  onToggleCompleted,
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
      <TaskListHeader
        showCompleted={showCompleted}
        onToggleCompleted={onToggleCompleted}
      />
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onComplete={onComplete}
            onUncomplete={onUncomplete}
          />
        ))}
      </div>
    </div>
  );
}
