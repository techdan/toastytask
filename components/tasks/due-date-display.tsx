"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

interface DueDateDisplayProps {
  dueAt: Date | number | null;
  onDateChange: (date: Date | null) => void;
  disabled?: boolean;
  isCompleted?: boolean;
  size?: "sm" | "lg";
}

export function DueDateDisplay({ dueAt, onDateChange, disabled, isCompleted, size = "sm" }: DueDateDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [hasPendingChange, setHasPendingChange] = useState(false);

  const dueDate = useMemo(() => {
    if (!dueAt) return null;
    return typeof dueAt === "number" ? new Date(dueAt * 1000) : new Date(dueAt);
  }, [dueAt]);

  // Use pending date for display if there's a pending change, otherwise use prop
  const displayDate = hasPendingChange ? pendingDate : dueDate;

  // Clear pending state when prop matches the expected value (optimistic clearing)
  // Also includes a safety timeout to handle server errors or slow responses
  useEffect(() => {
    if (!hasPendingChange) return;

    // Check if prop now matches pending state (clear immediately on match)
    if (pendingDate === null) {
      // We're waiting for the date to be cleared
      if (dueDate === null) {
        setHasPendingChange(false);
        return;
      }
    } else {
      // We're waiting for a specific date
      if (
        dueDate &&
        dueDate.getFullYear() === pendingDate.getFullYear() &&
        dueDate.getMonth() === pendingDate.getMonth() &&
        dueDate.getDate() === pendingDate.getDate()
      ) {
        setHasPendingChange(false);
        setPendingDate(null);
        return;
      }
    }

    // Safety timeout: clear pending state after 3 seconds even if prop doesn't match
    // This handles server errors, timeouts, or other edge cases
    const timeoutId = setTimeout(() => {
      setHasPendingChange(false);
      setPendingDate(null);
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [dueDate, hasPendingChange, pendingDate]);

  const getDisplayText = (): {
    text: string;
    textClassName: string;
    wrapperClassName?: string;
  } => {
    if (!displayDate) {
      return {
        text: "No Due Date",
        textClassName: "text-muted-foreground/50",
      };
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const today = new Date();
    const currentYear = today.getFullYear();

    // Helper to format date with optional year
    const formatDate = (date: Date) => {
      const month = monthNames[date.getMonth()];
      const day = date.getDate();
      const yearToCheck = date.getFullYear();
      const shortYear = `'${String(yearToCheck).slice(-2)}`;
      return yearToCheck !== currentYear ? `${month} ${day} ${shortYear}` : `${month} ${day}`;
    };

    // If completed, just show the date without any special formatting
    if (isCompleted) {
      return {
        text: formatDate(displayDate),
        textClassName: "",
      };
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset hours for date comparison
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const dueStart = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate());

    const isPastDue = dueStart < todayStart;
    const isToday = dueStart.getTime() === todayStart.getTime();
    const isTomorrow = dueStart.getTime() === tomorrowStart.getTime();

    if (isPastDue) {
      return {
        text: formatDate(displayDate),
        textClassName: "text-white font-medium",
        wrapperClassName: "rounded bg-red-500 px-2 py-0.5",
      };
    }

    if (isToday) {
      return { text: "Today", textClassName: "font-bold text-foreground" };
    }

    if (isTomorrow) {
      return { text: "Tomorrow", textClassName: "font-bold text-foreground" };
    }

    // Future date
    return {
      text: formatDate(displayDate),
      textClassName: "text-foreground",
    };
  };

  const { text, textClassName, wrapperClassName } = getDisplayText();

  const handleSelect = (date?: Date) => {
    if (!date || disabled) {
      setIsOpen(false);
      return;
    }
    const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    setHasPendingChange(true);
    setPendingDate(selectedDate);
    setIsOpen(false);
    onDateChange(selectedDate);
  };

  const handleClear = () => {
    if (disabled) return;
    setHasPendingChange(true);
    setPendingDate(null);
    setIsOpen(false);
    onDateChange(null);
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => !disabled && setIsOpen(open)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full min-w-[5.75rem] items-center gap-2 text-left",
            size === "lg" ? "h-12 text-lg" : "h-6 text-xs",
            "cursor-pointer px-0",
            !isOpen && "date-trigger-as-text", // Style as text when closed
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <CalendarIcon className={size === "lg" ? "h-5 w-5" : "h-3 w-3"} />
          <span className={cn("whitespace-nowrap", wrapperClassName)}>
            <span className={textClassName}>{text}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[15rem] p-0 data-[state=open]:animate-none data-[state=closed]:animate-none"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={displayDate ?? undefined}
          defaultMonth={displayDate ?? new Date()}
          onSelect={handleSelect}
          className="calendar-compact"
          style={
            {
              "--rdp-day-height": "1.35rem",
              "--rdp-day-width": "1.5rem",
              "--rdp-day_button-height": "1.2rem",
              "--rdp-day_button-width": "1.2rem",
              "--rdp-weekday-padding": "0.1rem 0",
              "--rdp-months-gap": "0.5rem",
              "--rdp-nav_button-height": "1.3rem",
              "--rdp-nav_button-width": "1.3rem",
              "--rdp-day-button-margin": "0.15rem",
            } as CSSProperties
          }
        />
        <div className="calendar-compact-actions flex items-center justify-between border-t px-2 py-1 gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 flex-1 px-2 text-[0.65rem]"
            onClick={handleClear}
            disabled={!displayDate}
          >
            <X className="mr-2 h-3 w-3" />
            Clear date
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-6 flex-1 px-2 text-[0.65rem]"
            onClick={() => handleSelect(new Date())}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
