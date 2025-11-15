"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import "react-day-picker/dist/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      style={{
        "--rdp-accent-color": "hsl(var(--primary))",
        "--rdp-accent-background-color": "hsl(var(--primary))",
        "--rdp-day-selected-color": "hsl(var(--primary-foreground))",
        "--rdp-background-color": "transparent",
      } as React.CSSProperties}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
