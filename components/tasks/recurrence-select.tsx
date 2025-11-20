"use client";

import { useState, useMemo } from "react";
import { Repeat } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RepeatType } from "@/types";
import type { Task } from "@/types";
import { cn } from "@/lib/utils";
import { RECURRENCE_REGISTRY, getRecurrenceOptions } from "@/lib/recurrence/registry";

interface RecurrenceSelectProps {
  value: Task["repeatType"];
  onValueChange: (value: Task["repeatType"]) => void;
  disabled?: boolean;
}

export function RecurrenceSelect({ value, onValueChange, disabled }: RecurrenceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentValue = value || RepeatType.NONE;
  const showIcon = currentValue !== RepeatType.NONE;

  // Get all recurrence options from registry (excludes "none" and "custom")
  const recurrenceOptions = useMemo(() => getRecurrenceOptions(), []);

  // Build full list including "None" option
  const allOptions = useMemo(() => [
    RECURRENCE_REGISTRY[RepeatType.NONE],
    ...recurrenceOptions
  ], [recurrenceOptions]);

  // Get current label from registry
  const currentLabel = RECURRENCE_REGISTRY[currentValue as RepeatType]?.label || "None";

  const handleValueChange = (newValue: string) => {
    onValueChange(newValue as Task["repeatType"]);
    setIsOpen(false);
  };

  // If not open, show as text button
  if (!isOpen) {
    return (
      <button
        className={cn(
          "flex h-6 w-full items-center gap-1 text-left text-xs transition-colors hover:underline",
          "cursor-pointer px-0",
          !showIcon && "text-muted-foreground/60",
          disabled && "opacity-50 cursor-not-allowed hover:no-underline"
        )}
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        type="button"
      >
        {showIcon && (
          <>
            <Repeat className="h-3 w-3" />
            <span>{currentLabel}</span>
          </>
        )}
      </button>
    );
  }

  // When open, show as dropdown
  return (
    <Select
      value={currentValue}
      onValueChange={handleValueChange}
      open={isOpen}
      onOpenChange={setIsOpen}
      disabled={disabled}
    >
      <SelectTrigger className="recurrence-trigger">
        <SelectValue>
          <div className="flex items-center gap-1">
            {showIcon && <Repeat className="h-3 w-3" />}
            <span>{currentLabel}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="text-xs">
        {allOptions.map((option) => (
          <SelectItem key={option.id} value={option.id} className="text-xs py-1 pl-2 pr-6">
            <div className="flex items-center gap-1.5">
              {option.id !== RepeatType.NONE && <Repeat className="h-3 w-3" />}
              {option.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
