"use client";

import { useState } from "react";
import { MoreVertical, Edit, Archive, ArchiveRestore, Trash2, Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

interface ProjectItemProps {
  project: Project;
  isSelected: boolean;
  taskCount: number;
  onSelect: () => void;
  onUpdate: (id: number, updates: Partial<Project>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const colorOptions = [
  "#f87171", // red-400
  "#fb923c", // orange-400
  "#fbbf24", // amber-400
  "#facc15", // yellow-400
  "#a3e635", // lime-400
  "#4ade80", // green-400
  "#34d399", // emerald-400
  "#2dd4bf", // teal-400
  "#22d3ee", // cyan-400
  "#38bdf8", // sky-400
  "#60a5fa", // blue-400
  "#818cf8", // indigo-400
  "#a78bfa", // violet-400
  "#c084fc", // purple-400
  "#e879f9", // fuchsia-400
  "#f472b6", // pink-400
  "#9ca3af", // gray-400
];

export function ProjectItem({
  project,
  isSelected,
  taskCount,
  onSelect,
  onUpdate,
  onDelete,
}: ProjectItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(project.name);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const handleRename = async () => {
    if (editedName.trim() && editedName !== project.name) {
      try {
        await onUpdate(project.id, { name: editedName.trim() });
      } catch (error) {
        console.error("Failed to rename project:", error);
      }
    } else {
      setEditedName(project.name);
    }
    setIsEditing(false);
  };

  const handleColorChange = async (colorHex: string) => {
    try {
      await onUpdate(project.id, { colorHex });
      setIsColorPickerOpen(false);
    } catch (error) {
      console.error("Failed to update project color:", error);
    }
  };

  const handleArchiveToggle = async () => {
    try {
      await onUpdate(project.id, { archived: !project.archived });
    } catch (error) {
      console.error("Failed to toggle archive:", error);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
      try {
        await onDelete(project.id);
      } catch (error) {
        console.error("Failed to delete project:", error);
      }
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center justify-between rounded pl-3 pr-2 py-2 transition-colors hover:bg-accent",
        isSelected && "bg-accent font-medium",
        project.archived && "opacity-60"
      )}
    >
      {/* Project Info */}
      <button onClick={onSelect} className="flex flex-1 items-center gap-2 overflow-hidden">
        <div
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: project.colorHex }}
        />
        {isEditing ? (
          <Input
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setEditedName(project.name);
                setIsEditing(false);
              }
            }}
            className="h-6 text-sm"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-sm">{project.name}</span>
        )}
      </button>

      {/* Task Count */}
      <div className="flex items-center gap-1">
        {taskCount > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{taskCount}</span>
        )}

        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>

            <DropdownMenu open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
              <DropdownMenuTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Palette className="mr-2 h-4 w-4" />
                  Change Color
                </DropdownMenuItem>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="left" className="w-40">
                <div className="grid grid-cols-4 gap-2 p-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={cn(
                        "h-6 w-6 rounded transition-transform hover:scale-110",
                        color === project.colorHex && "ring-2 ring-primary ring-offset-2"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleArchiveToggle}>
              {project.archived ? (
                <>
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  Unarchive
                </>
              ) : (
                <>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
