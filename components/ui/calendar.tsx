"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

import "react-day-picker/dist/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const mergedClassNames = {
    ...(classNames ?? {}),
    root: cn("rdp-root", classNames?.root),
    months: cn(
      "rdp-months",
      "flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0",
      classNames?.months
    ),
    month: cn("rdp-month", "space-y-4", classNames?.month),
    caption: cn(
      "rdp-caption",
      "relative flex items-center justify-center text-sm font-medium",
      classNames?.caption
    ),
    caption_label: cn("rdp-caption_label", "text-sm font-medium", classNames?.caption_label),
    nav: cn("rdp-nav", "space-x-1 flex items-center", classNames?.nav),
    button_previous: cn(
      "rdp-button_previous",
      "inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-transparent text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 absolute left-1.5",
      classNames?.button_previous
    ),
    button_next: cn(
      "rdp-button_next",
      "inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-transparent text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 absolute right-1.5",
      classNames?.button_next
    ),
    month_grid: cn("rdp-month_grid", "w-full border-collapse", classNames?.month_grid),
    weekdays: cn("rdp-weekdays", classNames?.weekdays),
    weekday: cn("rdp-weekday", "text-center text-[0.65rem] font-normal text-muted-foreground", classNames?.weekday),
    week: cn("rdp-week", classNames?.week),
    week_number: cn("rdp-week_number", classNames?.week_number),
    week_number_header: cn("rdp-week_number_header", classNames?.week_number_header),
    day: cn(
      "rdp-day",
      "p-0 text-center text-sm align-middle focus-within:relative focus-within:z-20",
      classNames?.day
    ),
    day_button: cn(
      "rdp-day_button",
      "flex h-9 w-9 items-center justify-center rounded-md text-sm font-normal transition-colors",
      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      classNames?.day_button
    ),
    day_outside: cn("rdp-day_outside", "text-muted-foreground/40", classNames?.day_outside),
    day_disabled: cn("rdp-day_disabled", "pointer-events-none opacity-40", classNames?.day_disabled),
    day_selected: cn(
      "rdp-day_selected",
      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
      classNames?.day_selected
    ),
    day_today: cn("rdp-day_today", "text-primary font-semibold", classNames?.day_today),
  };

  return (
    <DayPicker
      style={{
        "--rdp-accent-color": "hsl(var(--primary))",
        "--rdp-accent-background-color": "hsl(var(--primary))",
        "--rdp-day-selected-color": "hsl(var(--primary-foreground))",
        "--rdp-background-color": "transparent",
      } as React.CSSProperties}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={mergedClassNames}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" {...props} />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" {...props} />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
