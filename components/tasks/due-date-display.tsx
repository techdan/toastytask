"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface DueDateDisplayProps {
  dueAt: Date | number | null;
  onDateChange: (date: Date | null) => void;
  disabled?: boolean;
  isCompleted?: boolean;
}

export function DueDateDisplay({ dueAt, onDateChange, disabled, isCompleted }: DueDateDisplayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatDate = (date: Date | number | null): string => {
    if (!date) return "";
    const d = typeof date === "number" ? new Date(date * 1000) : new Date(date);
    // Format as YYYY-MM-DD using local timezone to avoid date shifting
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  const handleClick = () => {
    if (!disabled) {
      setIsEditing(true);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.showPicker?.();
    }
  }, [isEditing]);

  const handleDateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      // Parse the date string as local date (YYYY-MM-DD) to avoid timezone issues
      // HTML date input returns YYYY-MM-DD, which new Date() interprets as UTC midnight
      // We need to create a date at local midnight instead
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      onDateChange(date);
    } else {
      onDateChange(null);
    }
    setIsEditing(false);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={formatDate(dueAt)}
        onChange={handleDateSelect}
        onBlur={handleBlur}
        disabled={disabled}
        className="date-input"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "flex h-6 w-full items-center gap-1 text-left text-xs transition-opacity hover:opacity-70",
        "cursor-pointer px-0",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <Calendar className="h-3 w-3" />
      <span className={cn("whitespace-nowrap", wrapperClassName)}>
        <span className={textClassName}>{text}</span>
      </span>
    </button>
  );
}
