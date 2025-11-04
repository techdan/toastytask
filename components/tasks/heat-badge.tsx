"use client";

import { useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  calculateHeatWithBreakdown,
  isHeatStale,
  type HeatV3Breakdown,
} from "@/lib/scoring/heat-v3";
import { calculateImportanceV1WithFactors } from "@/lib/scoring/importance-v1";
import {
  getImportanceColorFromConfig,
  getHeatColorFromConfig,
  getHeatLabelFromConfig,
} from "@/lib/scoring/importance-colors";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";
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
 * Importance Mode: Shows numeric value 2-14 with color
 * Heat Mode: Shows numeric value 0-145 (points) with color and breakdown tooltip
 *
 * Heat v4: Updated to display 0-145 point scale instead of 0-100 percentage
 */
export function HeatBadge({ task, mode, isCompleted = false }: HeatBadgeProps) {
  const queryClient = useQueryClient();
  const invalidatedTasksRef = useRef<Set<number>>(new Set());

  // Calculate heat breakdown for tooltip (always calculated, but only used in heat mode)
  const breakdown = useMemo(() => {
    return calculateHeatWithBreakdown(task);
  }, [task]);

  // Calculate importance factors (always calculated for consistency with React hooks rules)
  const importanceFactors = useMemo(() => calculateImportanceV1WithFactors(task), [task]);

  // Check if heat is stale and trigger refresh if needed
  useEffect(() => {
    if (mode !== "heat" || !breakdown) return;

    const storedHeat = task.heat || 0;
    const freshHeat = breakdown.totalHeat;
    const heatDiff = Math.abs(freshHeat - storedHeat);
    const isStale = isHeatStale(task.heatCalculatedAt);

    // If heat is stale or differs significantly (>1%), invalidate query to trigger server refresh
    if (isStale || heatDiff > 0.5) {
      // Only invalidate once per task (until it's been updated)
      if (!invalidatedTasksRef.current.has(task.id)) {
        invalidatedTasksRef.current.add(task.id);
        // Invalidate asynchronously to trigger refetch
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }, 100);
      }
    } else {
      // Heat is fresh - clear the invalidation flag
      invalidatedTasksRef.current.delete(task.id);
    }
  }, [task.id, task.heat, task.heatCalculatedAt, breakdown, mode, queryClient]);

  if (mode === "importance") {
    // Importance Mode: Detailed breakdown tooltip
    const importance = task.importanceV1 || 0;
    const starLabels = ['None', 'Blue (+1)', 'Yellow (+2)', 'Orange (+3)'];

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                isCompleted
                  ? "bg-muted/40 text-muted-foreground/60"
                  : "text-white " + getImportanceColorFromConfig(importance)
              )}
            >
              {importance}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <div className="space-y-2 py-1">
              <div className="border-b pb-2">
                <div className="font-semibold">Importance Breakdown ({importance}/14)</div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-muted-foreground">Priority ({task.priority}):</span>
                  <span className="font-mono tabular-nums">{importanceFactors.priorityWeight} pts</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-muted-foreground">Due Date:</span>
                  <span className="font-mono tabular-nums">{importanceFactors.dueWeight} pts</span>
                </div>
                {importanceFactors.starBonus > 0 && (
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-muted-foreground">Star ({starLabels[task.starLevel ?? 0]}):</span>
                    <span className="font-mono tabular-nums">{importanceFactors.starBonus} pts</span>
                  </div>
                )}
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between items-center text-xs font-semibold gap-4">
                  <span>Total Importance:</span>
                  <span className="font-mono tabular-nums">{importance}/14 ({Math.round((importance / 14) * 100)}%)</span>
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Heat Mode: Display heat as 0-145 points with breakdown tooltip
  // Heat v4: Display raw point value instead of percentage
  const heat = breakdown?.totalHeat || 0;
  const heatDisplay = Math.round(heat); // Display as integer (0-145)
  const stageLabel = getHeatLabelFromConfig(heat);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <div
              className={cn(
                "flex h-5 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                isCompleted
                  ? "bg-muted/40 text-muted-foreground/60"
                  : "text-white " + getHeatColorFromConfig(heat)
              )}
            >
              {heatDisplay}
            </div>
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
  breakdown: HeatV3Breakdown;
  task: Task;
  stageLabel: string;
}

/**
 * Detailed heat breakdown for tooltip (Heat V3/V4)
 * Shows contribution from 3 components: base importance, heat adjustment, recency
 * Heat v4: Updated to display points instead of percentages
 */
function HeatBreakdownTooltip({
  breakdown,
  task,
  stageLabel,
}: HeatBreakdownTooltipProps) {
  const heatDisplay = Math.round(breakdown.totalHeat); // V4: Display as points (0-145)
  const starLabels = ['None', 'Blue (+1)', 'Yellow (+2)', 'Orange (+3)'];

  // Format dates for display
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
              {breakdown.importancePoints.toFixed(0)} pts ({task.importanceV1}/14)
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2 space-y-0.5">
            <div>Priority ({task.priority}): {task.priority === 'low' ? 2 : task.priority === 'medium' ? 3 : task.priority === 'high' ? 4 : 5} pts</div>
            {task.dueAt && (
              <div>
                Due ({task.dueAt ? (() => {
                  const dueDate = new Date(task.dueAt);
                  const today = new Date();
                  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
                  const diffDays = Math.floor((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
                  return diffDays < 0 ? "Overdue" : diffDays === 0 ? "Today" : "Future";
                })() : "None"}): {task.dueAt ? (() => {
                  const dueDate = new Date(task.dueAt);
                  const today = new Date();
                  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
                  const diffDays = Math.floor((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
                  return diffDays < 0 ? 6 : diffDays === 0 ? 5 : 3;
                })() : 0} pts
              </div>
            )}
            {(task.starLevel ?? 0) > 0 && (
              <div>Star: {starLabels[task.starLevel ?? 0]}</div>
            )}
          </div>
        </div>

        {/* Heat Adjustment */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Heat Adjustment:</span>
            <span className="font-mono tabular-nums">
              {breakdown.adjustmentPoints >= 0 ? '+' : ''}{breakdown.adjustmentPoints.toFixed(0)} pts
            </span>
          </div>
          {breakdown.heatAdjustment !== 0 && (
            <div className="mt-1 ml-2">
              {/* Progress bar visualization */}
              <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    breakdown.heatAdjustment > 0 ? "bg-orange-400" : "bg-blue-400"
                  )}
                  style={{
                    width: `${Math.min(
                      100,
                      (Math.abs(breakdown.heatAdjustment) / HEAT_CONFIG.MAX_ADJUSTMENT_POINTS) * 100
                    )}%`,
                    marginLeft: breakdown.heatAdjustment < 0 ? 'auto' : '0'
                  }}
                />
              </div>
            </div>
          )}
          <div className="text-muted-foreground/80 text-[10px] ml-2 mt-1">
            {breakdown.heatAdjustment === 0 ? (
              "No manual adjustments"
            ) : (
              <>
                {breakdown.heatAdjustment > 0 ? "Heated" : "Cooled"} {formatTimeAgo(task.lastHeatTouchedAt)}
                {breakdown.decayInfo && breakdown.decayInfo.daysSinceHeatTouch > 1 && (
                  <div className="mt-0.5">
                    Decayed from {breakdown.decayInfo.originalAdjustment >= 0 ? '+' : ''}{breakdown.decayInfo.originalAdjustment.toFixed(0)} pts
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Recency */}
        <div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Recency:</span>
            <span className="font-mono tabular-nums">
              {breakdown.recencyPoints.toFixed(1)} pts
            </span>
          </div>
          <div className="text-muted-foreground/80 text-[10px] ml-2">
            Last touched {formatTimeAgo(task.lastTouchedAt)}
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="border-t pt-2">
        <div className="flex justify-between items-center text-xs font-semibold gap-4">
          <span>Total Heat:</span>
          <span className="font-mono tabular-nums">
            {heatDisplay} pts (of 145)
          </span>
        </div>
      </div>
    </div>
  );
}
