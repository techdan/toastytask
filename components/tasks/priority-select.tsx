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
  isCompleted?: boolean;
  size?: "sm" | "lg";
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

export function PrioritySelect({ value, onValueChange, disabled, isCompleted = false, size = "sm" }: PrioritySelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleValueChange = (newValue: Priority) => {
    onValueChange(newValue);
    setIsOpen(false);
  };

  const completedPriorityClass = "line-through text-muted-foreground";
  const activePriorityClass = isCompleted ? completedPriorityClass : priorityStyles[value];

  // Always render Select component - no conditional rendering to prevent layout shift
  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      open={isOpen}
      onOpenChange={setIsOpen}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "priority-trigger w-full",
          size === "lg" && "h-12 text-lg px-3",
          !isOpen && "select-as-text" // Style as text button when closed
        )}
      >
        <SelectValue>
          <span className={cn(activePriorityClass, size === "lg" && "text-lg")}>
            {priorityLabels[value]}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={cn("text-xs", size === "lg" && "text-base")}>
        {priorityOrder.map((priority) => (
          <SelectItem
            key={priority}
            value={priority}
            className={cn("text-xs py-1 pl-2 pr-6", size === "lg" && "text-base py-2")}
          >
            <span className={isCompleted ? completedPriorityClass : priorityStyles[priority]}>
              {priorityLabels[priority]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
