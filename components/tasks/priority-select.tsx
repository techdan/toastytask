"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Priority } from "@/types";
import { cn } from "@/lib/utils";

interface PrioritySelectProps {
  value: Priority;
  onValueChange: (value: Priority) => void;
  disabled?: boolean;
}

const priorityLabels: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  top: "Top",
};

const priorityStyles: Record<Priority, string> = {
  low: "text-muted-foreground",
  medium: "",
  high: "font-bold text-[#344c63] dark:text-[#7a9ec6]",
  top: "font-bold text-[#990000] dark:text-[#dd5555]",
};

// Reverse order: Top → Low for quick access to high priorities
const priorityOrder: Priority[] = ["top", "high", "medium", "low"];

export function PrioritySelect({ value, onValueChange, disabled }: PrioritySelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleValueChange = (newValue: Priority) => {
    onValueChange(newValue);
    setIsOpen(false);
  };

  // If not open, show as text button
  if (!isOpen) {
    return (
      <button
        className={cn(
          "text-xs hover:underline transition-colors px-2 py-1 rounded cursor-pointer",
          priorityStyles[value],
          disabled && "opacity-50 cursor-not-allowed hover:no-underline"
        )}
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        type="button"
      >
        {priorityLabels[value]}
      </button>
    );
  }

  // When open, show as dropdown
  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      open={isOpen}
      onOpenChange={setIsOpen}
      disabled={disabled}
    >
      <SelectTrigger className="w-[90px] h-7 text-xs">
        <SelectValue>
          <span className={priorityStyles[value]}>{priorityLabels[value]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {priorityOrder.map((priority) => (
          <SelectItem key={priority} value={priority}>
            <span className={priorityStyles[priority]}>{priorityLabels[priority]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
