"use client";

import { Eye, EyeOff, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SortMode } from "@/types";

interface TaskListHeaderProps {
  showCompleted: boolean;
  onToggleCompleted: () => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
}

export function TaskListHeader({
  showCompleted,
  onToggleCompleted,
  sortMode,
  onSortModeChange,
}: TaskListHeaderProps) {
  return (
    <thead>
      <tr className="bg-muted/30">
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left first:rounded-l border border-r-0">
          <div className="task-header-control">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="task-sort-trigger h-5 px-1.5 text-xs gap-1"
                  title="Sort mode"
                >
                  <span className="capitalize">{sortMode}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => onSortModeChange("importance")}
                  className={cn(
                    sortMode === "importance" && "bg-accent"
                  )}
                >
                  Importance
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onSortModeChange("heat")}
                  className={cn(
                    sortMode === "heat" && "bg-accent"
                  )}
                >
                  Heat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="task-header-label capitalize" data-mode={sortMode}>
              Task
            </span>
          </div>
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 min-w-[8.5rem]">
          Due Date
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 min-w-[6.25rem]">
          Priority
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 min-w-[7.5rem]">
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
