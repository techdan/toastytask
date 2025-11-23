"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { Checkbox } from "@/components/ui/checkbox";
import { Flame, Snowflake, Star, StickyNote } from "lucide-react";
import { getImportanceColorFromConfig } from "@/lib/scoring/importance-colors";
import type { Project, Task, TaskDensity, TaskWithFreshValues } from "@/types";
import { cn } from "@/lib/utils";
import { HeatBadge } from "./heat-badge";

interface MobileTaskTableProps {
  task: TaskWithFreshValues;
  projectMap: Map<number, Project>;
  density: TaskDensity;
  onComplete: (id: number) => void;
  onUncomplete: (id: number) => void;
  onStar: (id: number) => void;
  onHeat: (id: number) => void;
  onCool: (id: number) => void;
  onClick: () => void;
  enableSwipe: boolean;
}

const formatDue = (dueAt: Task["dueAt"]) => {
  if (!dueAt) return "";
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
};

const formatRepeat = (repeatType: Task["repeatType"]) => {
  if (!repeatType || repeatType === "none") return "";
  return repeatType.replace(/_/g, " ");
};

export function MobileTaskTable({
  task,
  projectMap,
  density,
  onComplete,
  onUncomplete,
  onStar,
  onHeat,
  onCool,
  onClick,
  enableSwipe,
}: MobileTaskTableProps) {
  const [dragX, setDragX] = useState(0);
  const [isVerticalGesture, setIsVerticalGesture] = useState(false);
  const swipeAllowedRef = useRef(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const isCompleted = Boolean(task.completedAt);
  const isCompact = density === "compact";

  const projectName = useMemo(() => {
    if (task.projectId === null || task.projectId === undefined) return "No project";
    const project = projectMap.get(task.projectId);
    return project?.name ?? "No project";
  }, [projectMap, task.projectId]);

  const stripColor = getImportanceColorFromConfig(task._freshImportance ?? 0);

  const secondaryRow = useMemo(() => {
    if (isCompact) return null;
    const parts: string[] = [];
    const due = formatDue(task.dueAt);
    if (due) parts.push(due);
    const priorityLabel = task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : "";
    if (priorityLabel) parts.push(priorityLabel);
    if (projectName) {
      parts.push(projectName);
    }
    const repeat = formatRepeat(task.repeatType);
    if (repeat) parts.push(repeat);
    return parts.join(" • ");
  }, [isCompact, projectName, task.dueAt, task.priority, task.repeatType]);

  useEffect(() => {
    if (dragX === 0) return;
    const timeout = window.setTimeout(() => setDragX(0), 150);
    return () => window.clearTimeout(timeout);
  }, [dragX]);

  const triggerVibration = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(10);
    }
  }, []);

  const handleCompleteToggle = useCallback(() => {
    if (isCompleted) {
      onUncomplete(task.id);
    } else {
      onComplete(task.id);
    }
  }, [isCompleted, onComplete, onUncomplete, task.id]);

  const swipeHandlers = useSwipeable({
    trackMouse: false,
    preventScrollOnSwipe: false,
    onTouchStartOrOnMouseDown: (event) => {
      const target = event.event.target as HTMLElement | null;
      if (target?.closest?.("[data-no-swipe]")) {
        swipeAllowedRef.current = false;
      } else {
        swipeAllowedRef.current = true;
      }
      setIsVerticalGesture(false);
    },
    onSwiping: (event) => {
      if (!enableSwipe || !swipeAllowedRef.current) return;
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX) + 4) {
        setIsVerticalGesture(true);
        setDragX(0);
        return;
      }
      setIsVerticalGesture(false);
      setDragX(event.deltaX);
    },
    onSwiped: (event) => {
      if (!enableSwipe || !swipeAllowedRef.current || isVerticalGesture) {
        setDragX(0);
        swipeAllowedRef.current = true;
        return;
      }
      const width = cardRef.current?.offsetWidth ?? 320;
      const triggerThreshold = width * 0.6;
      if (event.deltaX >= triggerThreshold) {
        onHeat(task.id);
        triggerVibration();
      } else if (event.deltaX <= -triggerThreshold) {
        onCool(task.id);
        triggerVibration();
      }
      setDragX(0);
      swipeAllowedRef.current = true;
    },
  });

  const revealDirection = dragX > 0 ? "heat" : dragX < 0 ? "cool" : null;
  const revealMagnitude = Math.min(Math.abs(dragX) / Math.max(cardRef.current?.offsetWidth ?? 320, 1), 1);
  const revealActive = revealMagnitude >= 0.3;

  const thresholdPercent = 60;
  const showThresholdLine = revealDirection !== null && revealMagnitude > 0.2;

  return (
    <div
      ref={cardRef}
      className="relative overflow-hidden bg-card"
      {...(enableSwipe ? swipeHandlers : {})}
      onClick={() => {
        if (Math.abs(dragX) > 6) return;
        onClick();
      }}
    >
      {/* Reveal background with icons and threshold line */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-150",
            revealDirection === "heat" && "bg-orange-500/15",
            revealDirection === "cool" && "bg-sky-500/15"
          )}
          style={{ opacity: revealActive ? 1 : 0 }}
          aria-hidden
        />
        {revealDirection === "heat" && (
          <>
            <div className="absolute inset-y-0 left-0 flex items-center gap-2 pl-4 text-orange-500/80">
              <Flame className="h-5 w-5" />
              <span className="text-xs font-medium">Heat</span>
            </div>
            {showThresholdLine && (
              <div
                className="absolute inset-y-2 flex items-center"
                style={{ left: `${thresholdPercent}%` }}
              >
                <div className="h-full w-px bg-orange-500/60" />
              </div>
            )}
          </>
        )}
        {revealDirection === "cool" && (
          <>
            <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-4 text-sky-500/80">
              <span className="text-xs font-medium">Cool</span>
              <Snowflake className="h-5 w-5" />
            </div>
            {showThresholdLine && (
              <div
                className="absolute inset-y-2 flex items-center"
                style={{ right: `${thresholdPercent}%` }}
              >
                <div className="h-full w-px bg-sky-500/60" />
              </div>
            )}
          </>
        )}
      </div>

      <div
        className={cn(
          "relative flex items-center gap-1 pr-1.5 min-h-[36px]",
          density === "comfortable" ? "py-1.5" : "py-0"
        )}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 ? "transform 150ms ease-out" : "none",
        }}
      >
        <div className={cn("w-1 self-stretch rounded-none", stripColor)} aria-hidden />

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => handleCompleteToggle()}
              className="h-5 w-5"
              data-no-swipe
            />
            <HeatBadge task={task} mode="heat" isCompleted={isCompleted} />
            <div className="min-w-0 flex-1 space-y-1">
              <div
                className={cn(
                  "text-base font-medium leading-tight",
                  isCompleted && "line-through text-muted-foreground"
                )}
              >
                {task.title}
              </div>
              {secondaryRow ? (
                <div className="text-[11px] text-muted-foreground leading-snug">{secondaryRow}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {task.notesCount && task.notesCount > 0 ? (
                <StickyNote className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              ) : null}
              <button
                type="button"
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
                  isCompleted && "opacity-60"
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isCompleted) return;
                  onStar(task.id);
                }}
                data-no-swipe
                aria-label="Star task"
              >
                <Star
                  className={cn(
                    "h-5 w-5",
                    (task.starLevel ?? 0) > 0 && "fill-current text-amber-400"
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
