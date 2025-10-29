"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";

interface SnoozePopoverProps {
  onSnooze: (nextSurfaceAt: Date) => void;
  disabled?: boolean;
}

/**
 * Snooze date picker popover component
 *
 * Features:
 * - Quick presets: +1d, +3d, +1w, +2w, +1m
 * - Preview message
 * - Decay information
 */
export function SnoozePopover({ onSnooze, disabled }: SnoozePopoverProps) {
  const [open, setOpen] = useState(false);

  const handlePresetClick = (days: number) => {
    const nextSurfaceAt = new Date();
    nextSurfaceAt.setDate(nextSurfaceAt.getDate() + days);

    onSnooze(nextSurfaceAt);
    setOpen(false);
  };

  // Calculate decay factor for preview (7-day half-life)
  const calculateDecayPercent = (days: number): number => {
    const hours = days * 24;
    const decayFactor = Math.exp(-hours / 168); // 168 hours = 7 days
    return Math.round(decayFactor * 100);
  };

  const presets = [
    { label: "1 day", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "shrink-0 transition-colors",
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "text-blue-400/60 hover:text-blue-400 cursor-pointer"
          )}
          disabled={disabled}
          aria-label="Snooze task"
          title="Snooze task (S)"
        >
          <Snowflake className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">Snooze Task</h4>
            <p className="text-xs text-muted-foreground">
              Task will drop and resurface at the top on the selected date
            </p>
          </div>

          <div className="space-y-2">
            {presets.map((preset) => {
              const decayPercent = calculateDecayPercent(preset.days);
              return (
                <button
                  key={preset.days}
                  onClick={() => handlePresetClick(preset.days)}
                  className="w-full text-left px-3 py-2 rounded-md border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{preset.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {decayPercent}% heat retained
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Heat touches decay with 7-day half-life. Longer snooze = more cooling.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
