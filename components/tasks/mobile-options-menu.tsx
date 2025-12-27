"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  SlidersHorizontal,
  MoreVertical,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import type { SortMode, SortDirection, TaskDensity } from "@/types";
import { cn } from "@/lib/utils";

const sortOptionLabels: Record<SortMode, string> = {
  heat: "Heat",
  importance: "Importance",
  createdAt: "Date Created",
  updatedAt: "Date Modified",
};

const sortOptions: SortMode[] = ["importance", "heat", "createdAt", "updatedAt"];

interface MobileOptionsMenuProps {
  sortMode: SortMode;
  sortDirection: SortDirection;
  density: TaskDensity;
  showCompleted: boolean;
  onSortModeChange: (mode: SortMode) => void;
  onToggleSortDirection: () => void;
  onDensityChange: (density: TaskDensity) => void;
  onToggleCompleted: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MobileOptionsMenu({
  sortMode,
  sortDirection,
  density,
  showCompleted,
  onSortModeChange,
  onToggleSortDirection,
  onDensityChange,
  onToggleCompleted,
  open,
  onOpenChange,
}: MobileOptionsMenuProps) {
  const sortDirectionLabel = sortDirection === "desc" ? "Descending" : "Ascending";

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          aria-label="Task options"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
          Sort by
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sortMode}
          onValueChange={(value) => onSortModeChange(value as SortMode)}
        >
          {sortOptions.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              <div className="flex w-full items-center justify-between">
                <span>{sortOptionLabels[option]}</span>
                {sortMode === option && <Check className="h-4 w-4" />}
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onToggleSortDirection}>
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              Sort direction
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            {sortDirection === "desc" ? (
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ArrowUp className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <span className="sr-only">{`Toggle sort direction (${sortDirectionLabel})`}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
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

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onToggleCompleted}
          className={cn(showCompleted && "font-medium")}
        >
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              {showCompleted ? "Hide completed" : "Show completed"}
            </span>
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
