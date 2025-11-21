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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RepeatType } from "@/types";
import type { Task } from "@/types";
import type { RecurrenceConfig } from "@/types/recurrence";
import { cn } from "@/lib/utils";
import { RECURRENCE_REGISTRY, getRecurrenceOptions, getCustomRuleDisplayText } from "@/lib/recurrence/registry";
import { parseRecurrenceConfig, serializeRecurrenceConfig, describeRecurrenceRule } from "@/types/recurrence";
import { RecurrenceBuilder } from "./recurrence-builder";

interface RecurrenceSelectProps {
  value: Task["repeatType"];
  repeatRule?: Task["repeatRule"];
  onValueChange: (value: Task["repeatType"], repeatRule?: string | null) => void;
  disabled?: boolean;
}

export function RecurrenceSelect({ value, repeatRule, onValueChange, disabled }: RecurrenceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customConfig, setCustomConfig] = useState<RecurrenceConfig | null>(null);

  const currentValue = value || RepeatType.NONE;
  const showIcon = currentValue !== RepeatType.NONE;

  // Get all recurrence options from registry (excludes "none" and "custom")
  const recurrenceOptions = useMemo(() => getRecurrenceOptions(), []);

  // Build full list including "None" option and "Custom..." option
  const allOptions = useMemo(() => [
    RECURRENCE_REGISTRY[RepeatType.NONE],
    ...recurrenceOptions,
    RECURRENCE_REGISTRY[RepeatType.CUSTOM],
  ], [recurrenceOptions]);

  // Get current label from registry or custom rule description
  const currentLabel = useMemo(() => {
    if (currentValue === RepeatType.CUSTOM) {
      // Try to get label from repeatRule first, then fall back to customConfig
      if (repeatRule) {
        try {
          return getCustomRuleDisplayText(repeatRule);
        } catch {
          // Invalid repeatRule, fall through
        }
      }
      // Fallback: if we just confirmed a custom config but props haven't updated yet
      if (customConfig) {
        try {
          return describeRecurrenceRule(customConfig.rule);
        } catch {
          // Invalid config
        }
      }
      // Last resort fallback
      return "Custom";
    }
    return RECURRENCE_REGISTRY[currentValue as RepeatType]?.label || "None";
  }, [currentValue, repeatRule, customConfig]);

  // Load existing custom config when modal opens
  useMemo(() => {
    if (currentValue === RepeatType.CUSTOM && repeatRule && isCustomModalOpen) {
      try {
        setCustomConfig(parseRecurrenceConfig(repeatRule));
      } catch {
        setCustomConfig(null);
      }
    }
  }, [currentValue, repeatRule, isCustomModalOpen]);

  const handleValueChange = (newValue: string) => {
    if (newValue === RepeatType.CUSTOM) {
      // Always open custom builder modal, even if already selected
      // This allows users to edit their custom pattern
      setIsOpen(false);
      setIsCustomModalOpen(true);
    } else {
      // Regular built-in recurrence
      onValueChange(newValue as Task["repeatType"], null);
      setIsOpen(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    // When opening the dropdown and current value is custom, prepare to show the modal
    if (open && currentValue === RepeatType.CUSTOM) {
      // Load the existing config so if they click Custom it's pre-populated
      if (repeatRule) {
        try {
          setCustomConfig(parseRecurrenceConfig(repeatRule));
        } catch {
          setCustomConfig(null);
        }
      }
    }
  };

  const handleCustomConfirm = () => {
    if (customConfig) {
      const serialized = serializeRecurrenceConfig(customConfig);
      onValueChange(RepeatType.CUSTOM, serialized);
      setIsCustomModalOpen(false);
    }
  };

  const handleCustomCancel = () => {
    setIsCustomModalOpen(false);
    setCustomConfig(null);
  };

  // Always render Select component - no conditional rendering to prevent layout shift
  return (
    <>
      <Select
        value={currentValue}
        onValueChange={handleValueChange}
        open={isOpen}
        onOpenChange={handleOpenChange}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            "recurrence-trigger",
            !isOpen && "select-as-text" // Style as text button when closed
          )}
        >
          <SelectValue>
            <div className={cn(
              "flex items-center gap-1",
              !showIcon && "text-muted-foreground/60"
            )}>
              {showIcon && <Repeat className="h-3 w-3" />}
              <span>{currentLabel}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="text-xs">
          {allOptions.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              className="text-xs py-1 pl-2 pr-6"
              onPointerDown={(e) => {
                // If clicking Custom, always open the modal
                if (option.id === RepeatType.CUSTOM) {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(false);
                  setIsCustomModalOpen(true);
                  // Load existing config if available
                  if (currentValue === RepeatType.CUSTOM && repeatRule) {
                    try {
                      setCustomConfig(parseRecurrenceConfig(repeatRule));
                    } catch {
                      setCustomConfig(null);
                    }
                  }
                }
              }}
            >
              <div className="flex items-center gap-1.5">
                {option.id !== RepeatType.NONE && <Repeat className="h-3 w-3" />}
                {option.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Custom recurrence builder modal */}
      <Dialog open={isCustomModalOpen} onOpenChange={setIsCustomModalOpen}>
        <DialogContent
          className="max-w-2xl"
          onClick={(e) => {
            // Prevent clicks inside the modal from bubbling to the row
            e.stopPropagation();
          }}
        >
          <DialogHeader>
            <DialogTitle>Custom Recurrence</DialogTitle>
            <DialogDescription>
              Create a custom recurrence pattern for this task
            </DialogDescription>
          </DialogHeader>
          <RecurrenceBuilder
            value={customConfig}
            onValueChange={setCustomConfig}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleCustomCancel}>
              Cancel
            </Button>
            <Button onClick={handleCustomConfirm} disabled={!customConfig}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
