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

  if (!isOpen) {
    return (
      <button
        className={cn(
          "flex h-6 w-full items-center gap-1 text-left text-xs transition-colors hover:underline",
          "cursor-pointer px-0",
          value === null && "text-muted-foreground/70",
          disabled && "opacity-50 cursor-not-allowed hover:no-underline"
        )}
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-1">
          {value !== null && (
            <span
              className="h-2 w-2 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: display.color }}
              aria-hidden="true"
            />
          )}
          <span className="truncate">{display.name}</span>
        </span>
      </button>
    );
  }

  return (
    <Select
      value={selectValue}
      onValueChange={handleValueChange}
      open={isOpen}
      onOpenChange={setIsOpen}
      disabled={disabled}
    >
      <SelectTrigger className="project-trigger">
        <SelectValue>
          <div className="flex items-center gap-1.5">
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
