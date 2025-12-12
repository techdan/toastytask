"use client";

import { Eye, EyeOff, ChevronDown, ArrowDown, ArrowUp, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SortMode, SortDirection, TaskDensity } from "@/types";

const sortOptionLabels: Record<SortMode, string> = {
  heat: "Heat",
  importance: "Importance",
  createdAt: "Date Created",
  updatedAt: "Date Modified",
};

const sortOptions: SortMode[] = ["importance", "heat", "createdAt", "updatedAt"];

interface TaskListHeaderProps {
  showCompleted: boolean;
  onToggleCompleted: () => void;
  sortMode: SortMode;
  sortDirection: SortDirection;
  onSortModeChange: (mode: SortMode) => void;
  onToggleSortDirection: () => void;
  onRefreshOrder: () => Promise<void> | void;
  isRefreshingOrder: boolean;
  density: TaskDensity;
  onDensityChange: (density: TaskDensity) => void;
}

export function TaskListHeader({
  showCompleted,
  onToggleCompleted,
  sortMode,
  sortDirection,
  onSortModeChange,
  onToggleSortDirection,
  onRefreshOrder,
  isRefreshingOrder,
  density,
  onDensityChange,
}: TaskListHeaderProps) {
  const headerPadding = density === "compact" ? "py-1.5" : "py-2";
  const utilityButtonHeight = density === "compact" ? "h-5" : "h-6";
  const sortTriggerHeight = density === "compact" ? "h-5" : "h-6";
  const sortDirectionLabel = sortDirection === "desc" ? "Descending" : "Ascending";

  return (
    <thead>
      <tr className="bg-muted/30">
        <th
          scope="col"
          className={cn(
            "w-[130px] pl-2 pr-0 text-xs font-medium text-muted-foreground text-left first:rounded-l border border-r-0",
            headerPadding
          )}
        >
          <div className="flex items-center justify-between">
            <span className="sr-only">Task utilities</span>
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">Sort:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("!px-0 text-xs gap-1 justify-start min-w-0 rounded-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0", sortTriggerHeight)}
                    title="Sort mode"
                  >
                    <span>{sortOptionLabels[sortMode]}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {sortOptions.map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onClick={() => onSortModeChange(option)}
                      className={cn(sortMode === option && "bg-accent")}
                    >
                      {sortOptionLabels[option]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "w-5 text-muted-foreground hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                  sortTriggerHeight
                )}
                onClick={onToggleSortDirection}
                title={`Toggle sort direction (${sortDirectionLabel})`}
              >
                {sortDirection === "desc" ? (
                  <ArrowDown className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </th>
        <th
          scope="col"
          className={cn(
            "px-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0",
            headerPadding
          )}
        >
          Task
        </th>
        <th
          scope="col"
          className={cn(
            "px-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 w-[92px]",
            headerPadding
          )}
        >
          Due Date
        </th>
        <th
          scope="col"
          className={cn(
            "px-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 w-[84px]",
            headerPadding
          )}
        >
          Priority
        </th>
        <th
          scope="col"
          className={cn(
            "px-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 w-[110px]",
            headerPadding
          )}
        >
          Project
        </th>
        <th
          scope="col"
          className={cn(
            "px-2 text-xs font-medium text-muted-foreground text-left border-y border-r-0 w-[96px]",
            headerPadding
          )}
        >
          Recurrence
        </th>
        <th
          scope="col"
          className={cn(
            "px-2 text-xs font-medium text-muted-foreground text-left last:rounded-r border-y border-r w-14",
            headerPadding
          )}
        >
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-6 cursor-pointer",
                utilityButtonHeight
              )}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "px-2 text-xs cursor-pointer gap-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
                    utilityButtonHeight,
                    showCompleted ? "bg-accent/60" : ""
                  )}
                  title="Task list options"
                >
                  {showCompleted ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onToggleCompleted}>
                  {showCompleted ? "Hide completed tasks" : "Show completed tasks"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs uppercase text-muted-foreground tracking-wide">
                  Density
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={density}
                  onValueChange={(value) => onDensityChange(value as TaskDensity)}
                >
                  <DropdownMenuRadioItem value="comfortable">
                    Comfortable
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">
                    Compact
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </th>
      </tr>
    </thead>
  );
}
