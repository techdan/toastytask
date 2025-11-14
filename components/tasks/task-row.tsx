"use client";

import { useState } from "react";
import { Star, Trash2, Flame, Snowflake } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PrioritySelect } from "./priority-select";
import { RecurrenceSelect } from "./recurrence-select";
import { TaskProjectSelect } from "./project-select";
import { DueDateDisplay } from "./due-date-display";
import { TaskNotes, TaskNotesPanel } from "./task-notes";
import { HeatBadge } from "./heat-badge";
import { getGlowLevel } from "@/lib/scoring/heat-v3";
import type { Task, Priority, SortMode, Project, TaskWithFreshValues } from "@/types";
import { cn } from "@/lib/utils";

const priorityStyles: Record<Priority, string> = {
  low: "text-muted-foreground",
  medium: "",
  high: "font-bold text-[#344c63] dark:text-[#7a9ec6]",
  top: "font-bold text-[#990000] dark:text-[#dd5555]",
};

interface TaskRowProps {
  task: TaskWithFreshValues;
  projects: Project[];
  sortMode: SortMode;
  onUpdate: (id: number, updates: Partial<Task>) => void;
  onStar: (id: number) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onUncomplete: (id: number) => void;
  onHeat: (taskId: number) => void;
  onCool: (taskId: number) => void;
  onTouch: (taskId: number) => void;
}

export function TaskRow({ task, projects, sortMode, onUpdate, onStar, onDelete, onComplete, onUncomplete, onHeat, onCool, onTouch }: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const [notesExpanded, setNotesExpanded] = useState(false);

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

  const handleCheckboxChange = (checked: boolean, event?: React.MouseEvent) => {
    // Prevent row click from firing when checkbox is clicked
    if (event) {
      event.stopPropagation();
    }
    if (checked) {
      onComplete(task.id);
    } else {
      onUncomplete(task.id);
    }
  };

  const handleStarClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isCompleted) {
      return;
    }
    onStar(task.id);
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

  const handleProjectChange = (projectId: number | null) => {
    onUpdate(task.id, { projectId });
  };

  const handleTouchClick = () => {
    if (!isCompleted) {
      onHeat(task.id);
    }
  };

  const handleHeatButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handleTouchClick();
  };

  const handleCoolClick = () => {
    if (!isCompleted) {
      onCool(task.id);
    }
  };

  const handleCoolButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handleCoolClick();
  };

  const handleRowClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (isCompleted) {
      return;
    }

    onTouch(task.id);
  };

  return (
    <>
      <tr
        data-task-id={task.id}
        className={cn(
          "group bg-card transition-colors hover:bg-accent/30",
          isCompleted && "text-muted-foreground italic"
        )}
        onClick={handleRowClick}
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
              onClick={(e) => e.stopPropagation()}
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
                  onClick={handleHeatButtonClick}
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
                  onClick={handleCoolButtonClick}
                  disabled={isCompleted}
                  aria-label="Cool task (move down)"
                  title="Cool (move down 3 positions)"
                >
                  <Snowflake className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r-0",
          notesExpanded && "border-b-0"
        )}>
          <div className="min-w-0">
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
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r-0",
          notesExpanded && "border-b-0"
        )}>
          <div className={cn("min-w-[5.75rem]", isCompleted && "line-through") }>
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
          <div className={cn("min-w-[5.25rem]", isCompleted && "line-through") }>
            <PrioritySelect
              value={task.priority}
              onValueChange={handlePriorityChange}
              disabled={isCompleted}
              isCompleted={isCompleted}
            />
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r-0",
          notesExpanded && "border-b-0"
        )}>
          <div className={cn("min-w-[5.5rem]", isCompleted && "line-through") }>
            <TaskProjectSelect
              projects={projects}
              value={task.projectId ?? null}
              onValueChange={handleProjectChange}
              disabled={isCompleted}
            />
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r-0",
          notesExpanded && "border-b-0"
        )}>
          <div className={cn("min-w-[6rem]", isCompleted && "line-through") }>
            <RecurrenceSelect
              value={task.repeatType}
              onValueChange={handleRecurrenceChange}
              disabled={isCompleted}
            />
          </div>
        </td>
        <td className={cn(
          "px-2 py-1.5 align-middle border-y border-r text-right",
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
          <td colSpan={7} className="px-2 py-2 border-x border-b rounded-b">
            <TaskNotesPanel taskId={task.id} initialNotes={task.notes} isCompleted={isCompleted} />
          </td>
        </tr>
      )}
    </>
  );
}
