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
    <thead>
      <tr className="bg-muted/30">
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left first:rounded-l border border-r-0">
          <div className="flex items-center gap-2">
            <div className="w-4"></div>
            <div className="w-5"></div>
            <div className="w-4"></div>
            <div className="w-4"></div>
            <span>Task</span>
          </div>
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0">
          Due Date
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0">
          Priority
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0">
          Recurrence
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left last:rounded-r border-y border-r">
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
        </th>
      </tr>
    </thead>
  );
}
