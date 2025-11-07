"use client";

import { Eye, EyeOff, ChevronDown, RefreshCcw } from "lucide-react";
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
  onRefreshOrder: () => Promise<void> | void;
  isRefreshingOrder: boolean;
}

export function TaskListHeader({
  showCompleted,
  onToggleCompleted,
  sortMode,
  onSortModeChange,
  onRefreshOrder,
  isRefreshingOrder,
}: TaskListHeaderProps) {
  return (
    <thead>
      <tr className="bg-muted/30">
        <th scope="col" className="w-[150px] px-2 py-2 text-xs font-medium text-muted-foreground text-left first:rounded-l border border-r-0">
          <div className="flex items-center justify-between pr-1">
            <span className="sr-only">Task utilities</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs gap-1"
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
          </div>
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0">
          Task
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 min-w-[5.75rem]">
          Due Date
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 min-w-[5.25rem]">
          Priority
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 min-w-[6rem]">
          Recurrence
        </th>
        <th scope="col" className="px-2 py-2 text-xs font-medium text-muted-foreground text-left last:rounded-r border-y border-r">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRefreshOrder}
              title="Refresh order"
              disabled={isRefreshingOrder}
            >
              <RefreshCcw
                className={cn(
                  "h-3.5 w-3.5",
                  isRefreshingOrder && "animate-spin"
                )}
              />
            </Button>
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
        </th>
      </tr>
    </thead>
  );
}
