"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/types";
import { cn } from "@/lib/utils";

interface TaskProjectSelectProps {
  projects: Project[];
  value: number | null;
  onValueChange: (projectId: number | null) => void;
  disabled?: boolean;
}

const getProjectDisplay = (project: Project | undefined) => ({
  name: project?.name ?? "Unknown project",
  color: project?.colorHex ?? "#9ca3af",
});

export function TaskProjectSelect({
  projects,
  value,
  onValueChange,
  disabled,
}: TaskProjectSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedProject = value === null ? undefined : projects.find((p) => p.id === value);
  const display = value === null ? { name: "No Project", color: "#d1d5db" } : getProjectDisplay(selectedProject);
  const selectValue = value === null ? "none" : String(value);
  const showFallbackOption = value !== null && !selectedProject;

  const handleValueChange = (val: string) => {
    if (val === "none") {
      onValueChange(null);
      setIsOpen(false);
      return;
    }

    onValueChange(Number(val));
    setIsOpen(false);
  };

  // Always render Select component - no conditional rendering to prevent layout shift
  return (
    <Select
      value={selectValue}
      onValueChange={handleValueChange}
      open={isOpen}
      onOpenChange={setIsOpen}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "project-trigger",
          !isOpen && "select-as-text" // Style as text button when closed
        )}
      >
        <SelectValue>
          <div className={cn(
            "flex items-center gap-1.5",
            value === null && "text-muted-foreground/70"
          )}>
            {value !== null && (
              <span
                className="h-2.5 w-2.5 rounded-full border border-border"
                style={{ backgroundColor: display.color }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{display.name}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60 text-xs">
        <SelectItem value="none">No Project</SelectItem>
        {showFallbackOption && (
          <SelectItem value={String(value)}>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full border border-border"
                style={{ backgroundColor: display.color }}
                aria-hidden="true"
              />
              <span className="truncate">{display.name}</span>
            </div>
          </SelectItem>
        )}
        {projects.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            {projects.map((project) => (
              <SelectItem key={project.id} value={String(project.id)}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-border"
                    style={{ backgroundColor: project.colorHex }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{project.name}</span>
                </div>
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
