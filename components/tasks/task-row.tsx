"use client";

import { useState, useMemo } from "react";
import { Star, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PrioritySelect } from "./priority-select";
import { DueDateDisplay } from "./due-date-display";
import { TaskNotes, TaskNotesPanel } from "./task-notes";
import { calculateImportanceV1, getImportanceColor } from "@/lib/scoring/importance-v1";
import type { Task, Priority } from "@/types";
import { cn } from "@/lib/utils";

const priorityStyles: Record<Priority, string> = {
  low: "text-muted-foreground",
  medium: "",
  high: "font-bold text-[#344c63] dark:text-[#7a9ec6]",
  top: "font-bold text-[#990000] dark:text-[#dd5555]",
};

interface TaskRowProps {
  task: Task;
  onUpdate: (id: number, updates: Partial<Task>) => void;
  onDelete: (id: number) => void;
}

export function TaskRow({ task, onUpdate, onDelete }: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [notesExpanded, setNotesExpanded] = useState(false);

  // Use server-calculated importance from task.importanceV1 as source of truth
  // Only recalculate client-side for optimistic UI updates (will be overwritten by server response)
  const importance = useMemo(() => {
    // If the task has a server-calculated importance, use it
    if (task.importanceV1 !== undefined && task.importanceV1 !== null) {
      return task.importanceV1;
    }
    // Fallback: calculate on client (only happens for brand new tasks before server response)
    return calculateImportanceV1(task);
  }, [task.importanceV1, task.priority, task.star, task.dueAt]);

  const isCompleted = !!task.completedAt;

  const handleTitleClick = () => {
    if (!isCompleted) {
      setIsEditing(true);
    }
  };

  const handleTitleBlur = () => {
    setIsEditing(false);
    if (editedTitle.trim() && editedTitle !== task.title) {
      onUpdate(task.id, { title: editedTitle.trim() });
    } else {
      setEditedTitle(task.title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleBlur();
    } else if (e.key === "Escape") {
      setEditedTitle(task.title);
      setIsEditing(false);
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    onUpdate(task.id, {
      completedAt: checked ? new Date() : null,
    });
  };

  const handleStarClick = () => {
    onUpdate(task.id, { star: !task.star });
  };

  const handlePriorityChange = (priority: Priority) => {
    onUpdate(task.id, { priority });
  };

  const handleDateChange = (date: Date | null) => {
    onUpdate(task.id, { dueAt: date });
  };

  return (
    <div>
      {/* Main Task Row */}
      <div
        className={cn(
          "group grid grid-cols-[auto_auto_auto_auto_1fr_120px_90px_auto] items-center gap-2 rounded border bg-card px-2 py-1.5 transition-colors hover:bg-accent/30",
          isCompleted && "opacity-50"
        )}
      >
        {/* Checkbox */}
        <Checkbox
          checked={isCompleted}
          onCheckedChange={handleCheckboxChange}
          className="h-4 w-4 cursor-pointer"
        />

        {/* Importance Badge - Compact */}
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white",
            getImportanceColor(importance)
          )}
          title={`Importance: ${importance}`}
        >
          {importance}
        </div>

        {/* Star Button - Compact */}
        <button
          className={cn(
            "shrink-0 transition-colors cursor-pointer",
            task.star ? "text-yellow-400" : "text-muted-foreground/40 hover:text-muted-foreground"
          )}
          onClick={handleStarClick}
          disabled={isCompleted}
        >
          <Star className={cn("h-4 w-4", task.star && "fill-current")} />
        </button>

        {/* Notes Toggle */}
        <div className="mr-3">
          <TaskNotes
            taskId={task.id}
            isExpanded={notesExpanded}
            onToggle={() => setNotesExpanded(!notesExpanded)}
            notesCount={task.notesCount}
            notesLastModified={task.notesLastModified}
          />
        </div>

        {/* Title - More compact */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="h-6 text-sm"
              autoFocus
            />
          ) : (
            <button
              className={cn(
                "w-full text-left text-sm hover:text-primary cursor-pointer",
                priorityStyles[task.priority],
                isCompleted && "line-through"
              )}
              onClick={handleTitleClick}
              disabled={isCompleted}
            >
              {task.title}
            </button>
          )}
        </div>

        {/* Due Date - Smart Display with fixed width column */}
        <div className="w-[120px]">
          <DueDateDisplay
            dueAt={task.dueAt}
            onDateChange={handleDateChange}
            disabled={isCompleted}
          />
        </div>

        {/* Priority Select - Compact with fixed width column */}
        <div className="w-[90px]">
          <PrioritySelect
            value={task.priority}
            onValueChange={handlePriorityChange}
            disabled={isCompleted}
          />
        </div>

        {/* Delete Button - Compact */}
        <button
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      </div>

      {/* Notes Panel - Rendered outside grid */}
      {notesExpanded && (
        <div className="px-2">
          <TaskNotesPanel taskId={task.id} initialNotes={task.notes} />
        </div>
      )}
    </div>
  );
}
