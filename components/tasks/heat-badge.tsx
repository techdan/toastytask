"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  calculateHeatWithBreakdown,
  getHeatColor,
  getHeatLabel,
  type HeatBreakdown,
} from "@/lib/scoring/heat-v2";
import { getImportanceColor } from "@/lib/scoring/importance-v1";
import type { Task, SortMode } from "@/types";
import { cn } from "@/lib/utils";

interface HeatBadgeProps {
  task: Task;
  mode: SortMode;
  isCompleted?: boolean;
}

/**
 * Dual-mode badge component that displays either Importance or Heat
 *
 * Importance Mode: Shows numeric value 2-12 with color
 * Heat Mode: Shows numeric value 1-100 with color and breakdown tooltip
 */
export function HeatBadge({ task, mode, isCompleted = false }: HeatBadgeProps) {
  // Calculate heat breakdown for tooltip (only when in heat mode)
  const breakdown = useMemo(() => {
    if (mode !== "heat") return null;
    return calculateHeatWithBreakdown(task);
  }, [task, mode]);

  if (mode === "importance") {
    // Importance Mode: Simple numeric badge (2-12)
    const importance = task.importanceV1 || 0;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                isCompleted
                  ? "bg-muted/40 text-muted-foreground/60"
                  : "text-white " + getImportanceColor(importance)
              )}
            >
              {importance}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Importance: {importance}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Heat Mode: Display heat as 1-100 with breakdown tooltip
  // Use calculated heat from breakdown (always fresh) instead of stored task.heat
  const heat = breakdown?.totalHeat || 0;
  const heatDisplay = Math.round(heat * 100); // Convert 0.0-1.0 to 1-100
  const stageLabel = getHeatLabel(heat);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                isCompleted
                  ? "bg-muted/40 text-muted-foreground/60"
                  : "text-white " + getHeatColor(heat)
              )}
            >
              {heatDisplay}
            </div>
            {task.nextSurfaceAt && (
              <Clock className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <HeatBreakdownTooltip
            breakdown={breakdown!}
            task={task}
            stageLabel={stageLabel}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface HeatBreakdownTooltipProps {
  breakdown: HeatBreakdown;
  task: Task;
  stageLabel: string;
}

/**
 * Detailed heat breakdown for tooltip
 * Shows contribution from each of 6 components with context
 */
function HeatBreakdownTooltip({
  breakdown,
  task,
  stageLabel,
}: HeatBreakdownTooltipProps) {
  const heatDisplay = Math.round(breakdown.totalHeat * 100);

  // Format dates for display
  const formatDate = (date: Date | number | string | null | undefined) => {
    if (!date) return "Never";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatTimeAgo = (date: Date | number | string | null | undefined) => {
    if (!date) return "Never";
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return "Just now";
  };

  const getDaysUntilDue = (dueAt: Date | number | string | null | undefined) => {
    if (!dueAt) return null;
    const d = dueAt instanceof Date ? dueAt : new Date(dueAt);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = dueStart.getTime() - todayStart.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return `In ${diffDays}d`;
  };

  const getDaysUntilResurface = (
    nextSurfaceAt: Date | number | string | null | undefined
  ) => {
    if (!nextSurfaceAt) return null;
    const d = nextSurfaceAt instanceof Date ? nextSurfaceAt : new Date(nextSurfaceAt);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Ready to resurface";
    if (diffDays === 1) return "Resurfaces tomorrow";
    return `Resurfaces in ${diffDays}d`;
  };

  // Calculate total for verification (sum of weighted components)
  const calculatedTotal =
    breakdown.baseImportanceWeighted +
    breakdown.recencyWeighted +
    breakdown.heatTouchesWeighted +
    breakdown.dueProximityWeighted +
    breakdown.activityWeighted +
    breakdown.creationWeighted;

  return (
    <div className="space-y-3 py-1">
      {/* Header */}
      <div className="border-b pb-2">
        <div className="font-semibold">
          Heat: {heatDisplay} ({stageLabel})
        </div>
      </div>

      {/* Components */}
      <div className="space-y-2 text-xs">
        {/* Base Importance */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Base Importance:</span>
            <span className="font-mono tabular-nums">
              {(breakdown.baseImportanceWeighted * 100).toFixed(1)} (50%)
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2">
            Priority: {task.priority}, {task.star ? "Starred" : "Not starred"}
          </div>
        </div>

        {/* Recency */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Recency:</span>
            <span className="font-mono tabular-nums">
              {(breakdown.recencyWeighted * 100).toFixed(1)} (5%)
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2">
            {task.nextSurfaceAt ? (
              <span className="italic">Snoozed (recency = 0)</span>
            ) : (
              `Last touched: ${formatTimeAgo(task.lastTouchedAt)}`
            )}
          </div>
        </div>

        {/* Heat Touches */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Heat Touches:</span>
            <span className="font-mono tabular-nums">
              {(breakdown.heatTouchesWeighted * 100).toFixed(1)} (30%)
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2">
            {task.heatTouchCount === 0
              ? "No heat touches yet"
              : `${task.heatTouchCount.toFixed(1)} clicks, last: ${formatTimeAgo(
                  task.lastHeatTouchedAt
                )}`}
          </div>
        </div>

        {/* Due Proximity */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Due Proximity:</span>
            <span className="font-mono tabular-nums">
              {(breakdown.dueProximityWeighted * 100).toFixed(1)} (5%)
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2">
            {task.dueAt
              ? `Due: ${formatDate(task.dueAt)} (${getDaysUntilDue(task.dueAt)})`
              : "No due date"}
          </div>
        </div>

        {/* Activity */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Activity:</span>
            <span className="font-mono tabular-nums">
              {(breakdown.activityWeighted * 100).toFixed(1)} (5%)
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2">
            {task.otherTouchCount === 0
              ? "No edits yet"
              : `${task.otherTouchCount} edits`}
          </div>
        </div>

        {/* Creation Recency */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Creation:</span>
            <span className="font-mono tabular-nums">
              {(breakdown.creationWeighted * 100).toFixed(1)} (5%)
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2">
            Created: {formatDate(task.createdAt)}
          </div>
        </div>
      </div>

      {/* Total Verification */}
      <div className="border-t pt-2">
        <div className="flex justify-between items-center text-xs font-semibold gap-4">
          <span>Total:</span>
          <span className="font-mono tabular-nums">
            {(calculatedTotal * 100).toFixed(1)}
          </span>
        </div>
      </div>

      {/* Snooze Info */}
      {task.nextSurfaceAt && (
        <div className="border-t pt-2 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{getDaysUntilResurface(task.nextSurfaceAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
