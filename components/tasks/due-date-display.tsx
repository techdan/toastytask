"use client";

import { useMemo, useState } from "react";
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
}

export function DueDateDisplay({ dueAt, onDateChange, disabled, isCompleted }: DueDateDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dueDate = useMemo(() => {
    if (!dueAt) return null;
    return typeof dueAt === "number" ? new Date(dueAt * 1000) : new Date(dueAt);
  }, [dueAt]);

  const getDisplayText = (): {
    text: string;
    textClassName: string;
    wrapperClassName?: string;
  } => {
    if (!dueAt) {
      return {
        text: "No Due Date",
        textClassName: "text-muted-foreground/50",
      };
    }

    const dueDate = typeof dueAt === "number" ? new Date(dueAt * 1000) : new Date(dueAt);

    // If completed, just show the date without any special formatting
    if (isCompleted) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return {
        text: `${monthNames[dueDate.getMonth()]} ${dueDate.getDate()}`,
        textClassName: "",
      };
    }

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset hours for date comparison
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

    const isPastDue = dueStart < todayStart;
    const isToday = dueStart.getTime() === todayStart.getTime();
    const isTomorrow = dueStart.getTime() === tomorrowStart.getTime();

    if (isPastDue) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return {
        text: `${monthNames[dueDate.getMonth()]} ${dueDate.getDate()}`,
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
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return {
      text: `${monthNames[dueDate.getMonth()]} ${dueDate.getDate()}`,
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
    onDateChange(selectedDate);
    setIsOpen(false);
  };

  const handleClear = () => {
    if (disabled) return;
    onDateChange(null);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => !disabled && setIsOpen(open)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-6 w-full min-w-[5.75rem] items-center gap-1 text-left text-xs transition-opacity hover:opacity-70",
            "cursor-pointer px-0",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          <CalendarIcon className="h-3 w-3" />
          <span className={cn("whitespace-nowrap", wrapperClassName)}>
            <span className={textClassName}>{text}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dueDate ?? undefined}
          defaultMonth={dueDate ?? new Date()}
          onSelect={handleSelect}
          initialFocus
        />
        <div className="flex items-center justify-between border-t p-2">
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={!dueDate}>
            <X className="mr-2 h-3 w-3" />
            Clear date
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleSelect(new Date())}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
