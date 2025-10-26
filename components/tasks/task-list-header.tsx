"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TaskListHeaderProps {
  showCompleted: boolean;
  onToggleCompleted: () => void;
  // Future: sorting props
  // sortBy?: "importance" | "dueDate" | "priority" | "title";
  // sortDirection?: "asc" | "desc";
  // onSort?: (column: string) => void;
}

export function TaskListHeader({
  showCompleted,
  onToggleCompleted,
}: TaskListHeaderProps) {
  return (
    <div className="mb-2 rounded border bg-muted/30 px-2 py-2">
      <div className="grid grid-cols-[auto_auto_auto_auto_1fr_auto_auto_auto_auto] items-center gap-2">
        {/* Checkbox column */}
        <div className="w-4" />

        {/* Importance column */}
        <div className="w-5">
          <span className="text-xs font-medium text-muted-foreground" title="Importance">
            
          </span>
        </div>

        {/* Star column */}
        <div className="w-4" />

        {/* Notes column */}
        <div className="mr-3 w-4" />

        {/* Title column */}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground">
            Task
          </span>
        </div>

        {/* Due Date column */}
        <div className="w-[120px]">
          <span className="text-xs font-medium text-muted-foreground">
            Due Date
          </span>
        </div>

        {/* Priority column */}
        <div className="w-[90px]">
          <span className="text-xs font-medium text-muted-foreground">
            Priority
          </span>
        </div>

        {/* Recurrence column */}
        <div className="w-[100px]">
          <span className="text-xs font-medium text-muted-foreground">
            Recurrence
          </span>
        </div>

        {/* Actions/Controls column */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-xs",
              showCompleted ? "bg-accent" : ""
            )}
            onClick={onToggleCompleted}
            title={showCompleted ? "Hide completed tasks" : "Show completed tasks"}
          >
            {showCompleted ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
