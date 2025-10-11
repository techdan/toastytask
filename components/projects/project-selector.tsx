"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/types";

interface ProjectSelectorProps {
  projects: Project[];
  value: number | null | "all";
  onValueChange: (value: number | null | "all") => void;
}

export function ProjectSelector({ projects, value, onValueChange }: ProjectSelectorProps) {
  const handleValueChange = (val: string) => {
    if (val === "all") {
      onValueChange("all");
    } else if (val === "none") {
      onValueChange(null);
    } else {
      onValueChange(parseInt(val, 10));
    }
  };

  const getDisplayValue = () => {
    if (value === "all") return "All Projects";
    if (value === null) return "No Project";
    const project = projects.find((p) => p.id === value);
    return project ? project.name : "Select project...";
  };

  return (
    <Select value={String(value)} onValueChange={handleValueChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue>
          <div className="flex items-center gap-2">
            {value !== "all" && value !== null && (
              <div
                className="h-3 w-3 rounded-full"
                style={{
                  backgroundColor: projects.find((p) => p.id === value)?.colorHex,
                }}
              />
            )}
            <span>{getDisplayValue()}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Projects</SelectItem>
        <SelectItem value="none">No Project</SelectItem>
        {projects.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            {projects.map((project) => (
              <SelectItem key={project.id} value={String(project.id)}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: project.colorHex }}
                  />
                  <span>{project.name}</span>
                </div>
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
