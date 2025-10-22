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

const priorityColors: Record<Priority, string> = {
  low: "text-blue-600",
  medium: "text-green-600",
  high: "text-orange-600",
  top: "text-red-600",
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
          "text-xs font-medium hover:underline transition-colors px-2 py-1 rounded cursor-pointer",
          priorityColors[value],
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
          <span className={priorityColors[value]}>{priorityLabels[value]}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {priorityOrder.map((priority) => (
          <SelectItem key={priority} value={priority}>
            <span className={priorityColors[priority]}>{priorityLabels[priority]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
