"use client";

import { useState } from "react";
import { Star, Trash2, Flame, Snowflake } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PrioritySelect } from "./priority-select";
import { RecurrenceSelect } from "./recurrence-select";
import { DueDateDisplay } from "./due-date-display";
import { TaskNotes, TaskNotesPanel } from "./task-notes";
import { HeatBadge } from "./heat-badge";
import { useTouchTask, useCoolTask } from "@/lib/queries/use-task-mutations";
import { getGlowLevel } from "@/lib/scoring/heat-v3";
import type { Task, Priority, SortMode } from "@/types";
import { cn } from "@/lib/utils";

const priorityStyles: Record<Priority, string> = {
  low: "text-muted-foreground",
  medium: "",
  high: "font-bold text-[#344c63] dark:text-[#7a9ec6]",
  top: "font-bold text-[#990000] dark:text-[#dd5555]",
};

// Task with computed fresh heat for accurate context-aware positioning
type TaskWithFreshHeat = Task & { _freshHeat: number };

interface TaskRowProps {
  task: TaskWithFreshHeat;
  sortMode: SortMode;
  allVisibleTasks: TaskWithFreshHeat[];
  onUpdate: (id: number, updates: Partial<Task>) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onUncomplete: (id: number) => void;
}

export function TaskRow({ task, sortMode, allVisibleTasks, onUpdate, onDelete, onComplete, onUncomplete }: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [notesExpanded, setNotesExpanded] = useState(false);

  const touchTaskMutation = useTouchTask();
  const coolTaskMutation = useCoolTask();

  const isCompleted = !!task.completedAt;
  const isNew = task.lastTouchedAt === null && task.lastHeatTouchedAt === null;

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
    if (checked) {
      onComplete(task.id);
    } else {
      onUncomplete(task.id);
    }
  };

  const handleStarClick = async () => {
    // Use the star endpoint to cycle through levels
    try {
      const response = await fetch(`/api/tasks/${task.id}/star`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to cycle star");

      await response.json();
      // The mutation will be handled by query invalidation
      // For now, optimistically update
      const newStarLevel = (task.starLevel ?? 0) + 1;
      onUpdate(task.id, { starLevel: newStarLevel % 4 });
    } catch (error) {
      console.error("Failed to cycle star:", error);
    }
  };

  const handlePriorityChange = (priority: Priority) => {
    onUpdate(task.id, { priority });
  };

  const handleDateChange = (date: Date | null) => {
    onUpdate(task.id, { dueAt: date });
  };

  const handleRecurrenceChange = (repeatType: Task["repeatType"]) => {
    onUpdate(task.id, { repeatType });
  };

  const handleTouchClick = () => {
    if (!isCompleted) {
      // Send only task IDs for context-aware calculation
      // Server will calculate fresh heat values to avoid time skew
      const visibleTaskIds = allVisibleTasks
        .filter(t => !t.completedAt) // Exclude completed tasks from context
        .map(t => t.id);

      touchTaskMutation.mutate({ taskId: task.id, visibleTaskIds });
    }
  };

  const handleCoolClick = () => {
    if (!isCompleted) {
      // Send only task IDs for context-aware calculation
      // Server will calculate fresh heat values to avoid time skew
      const visibleTaskIds = allVisibleTasks
        .filter(t => !t.completedAt) // Exclude completed tasks from context
        .map(t => t.id);

      coolTaskMutation.mutate({ taskId: task.id, visibleTaskIds });
    }
  };

  return (
    <>
      <tr
        className={cn(
          "group bg-card transition-colors hover:bg-accent/30",
          isCompleted && "text-muted-foreground italic"
        )}
      >
        <td className={cn(
          "px-2 py-1.5 align-middle border border-r-0",
          notesExpanded ? "rounded-tl border-b-0" : "first:rounded-l"
        )}>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={handleCheckboxChange}
              className="h-4 w-4 cursor-pointer shrink-0"
            />
            <HeatBadge task={task} mode={sortMode} isCompleted={isCompleted} />
            <button
              className={cn(
                "shrink-0 transition-all cursor-pointer star-button",
                isCompleted && "opacity-50 cursor-not-allowed"
              )}
              data-level={task.starLevel ?? 0}
              onClick={handleStarClick}
              disabled={isCompleted}
              aria-label={`Star level ${task.starLevel ?? 0}`}
              title={`Star: ${['None', 'Blue (+1)', 'Yellow (+2)', 'Orange (+3)'][task.starLevel ?? 0]}`}
            >
              <Star className={cn("h-4 w-4", (task.starLevel ?? 0) > 0 && "fill-current")} />
            </button>
            <div className="shrink-0">
              <TaskNotes
                taskId={task.id}
                isExpanded={notesExpanded}
                onToggle={() => setNotesExpanded(!notesExpanded)}
                notesCount={task.notesCount}
                notesLastModified={task.notesLastModified}
              />
            </div>
            {sortMode === "heat" && (
              <>
                <button
                  className={cn(
                    "shrink-0 transition-colors heat-button",
                    isCompleted
                      ? "opacity-50 cursor-not-allowed"
                      : "text-orange-400/60 hover:text-orange-400 cursor-pointer"
                  )}
                  data-level={(task.heatAdjustment ?? 0) > 0 ? getGlowLevel(task.heatAdjustment ?? 0) : 0}
                  onClick={handleTouchClick}
                  disabled={isCompleted}
                  aria-label="Heat task (move up)"
                  title="Heat (move up 1 position)"
                >
                  <Flame className="h-4 w-4" />
                </button>
                <button
                  className={cn(
                    "shrink-0 transition-colors cool-button",
                    isCompleted
                      ? "opacity-50 cursor-not-allowed"
                      : "text-blue-400/60 hover:text-blue-400 cursor-pointer"
                  )}
                  data-level={(task.heatAdjustment ?? 0) < 0 ? getGlowLevel(task.heatAdjustment ?? 0) : 0}
                  onClick={handleCoolClick}
                  disabled={isCompleted}
                  aria-label="Cool task (move down)"
                  title="Cool (move down 3 positions)"
                >
                  <Snowflake className="h-4 w-4" />
                </button>
              </>
            )}
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
                    "w-full text-left text-sm hover:text-primary cursor-pointer transition-all duration-200",
                    !isCompleted && !isNew && priorityStyles[task.priority],
                    !isCompleted && isNew && "font-bold text-green-600 dark:text-green-400",
                    isCompleted && "line-through"
                  )}
                  onClick={handleTitleClick}
                  disabled={isCompleted}
                >
                  {task.title}
                </button>
              )}
            </div>
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r-0",
          notesExpanded && "border-b-0"
        )}>
          <div className={cn(isCompleted && "line-through")}>
            <DueDateDisplay
              dueAt={task.dueAt}
              onDateChange={handleDateChange}
              disabled={isCompleted}
              isCompleted={isCompleted}
            />
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r-0",
          notesExpanded && "border-b-0"
        )}>
          <div className={cn(isCompleted && "line-through")}>
            <PrioritySelect
              value={task.priority}
              onValueChange={handlePriorityChange}
              disabled={isCompleted}
            />
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r-0",
          notesExpanded && "border-b-0"
        )}>
          <div className={cn(isCompleted && "line-through")}>
            <RecurrenceSelect
              value={task.repeatType}
              onValueChange={handleRecurrenceChange}
              disabled={isCompleted}
            />
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r",
          notesExpanded ? "rounded-tr border-b-0" : "last:rounded-r"
        )}>
          <button
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onDelete(task.id)}
            aria-label="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </td>
      </tr>

      {/* Notes Panel - Expanded row with colspan */}
      {notesExpanded && (
        <tr className="bg-card">
          <td colSpan={5} className="px-2 py-2 border-x border-b rounded-b">
            <TaskNotesPanel taskId={task.id} initialNotes={task.notes} />
          </td>
        </tr>
      )}
    </>
  );
}
