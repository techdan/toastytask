"use client";

import { useEffect, useState } from "react";
import { Plus, ChevronDown, ChevronRight, ChevronLeft, Archive, Eye, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { ProjectItem } from "./project-item";

interface ProjectsSidebarProps {
  projects: Project[];
  selectedProjectId: number | null | "all" | "focus";
  onSelectProject: (projectId: number | null | "all" | "focus") => void;
  onCreateProject: (name: string, colorHex: string) => Promise<void>;
  onUpdateProject: (id: number, updates: Partial<Project>) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  onReorderProjects: (projectIds: number[]) => Promise<void> | void;
  taskCounts: Record<number, number>;
  focusedTaskCount: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

export function ProjectsSidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onReorderProjects,
  taskCounts,
  focusedTaskCount,
  isCollapsed,
  onToggleCollapsed,
}: ProjectsSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [orderedActiveProjects, setOrderedActiveProjects] = useState<Project[]>(() =>
    projects.filter((p) => !p.archived)
  );
  const [draggingProjectId, setDraggingProjectId] = useState<number | null>(null);

  const archivedProjects = projects.filter((p) => p.archived);
  const totalActiveTasks = Object.values(taskCounts).reduce((sum, count) => sum + count, 0);
  const isDraggingProjects = draggingProjectId !== null;

  useEffect(() => {
    if (draggingProjectId !== null) return;
    setOrderedActiveProjects(projects.filter((p) => !p.archived));
  }, [projects, draggingProjectId]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      await onCreateProject(newProjectName.trim(), "#6b7280");
      setNewProjectName("");
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  };

  const handleDragStart = (projectId: number) => {
    setDraggingProjectId(projectId);
  };

  const handleDragOver = (targetId: number) => {
    setOrderedActiveProjects((current) => {
      if (!draggingProjectId || draggingProjectId === targetId) {
        return current;
      }

      const draggingIndex = current.findIndex((project) => project.id === draggingProjectId);
      const targetIndex = current.findIndex((project) => project.id === targetId);

      if (draggingIndex === -1 || targetIndex === -1) {
        return current;
      }

      const updated = [...current];
      const [draggedProject] = updated.splice(draggingIndex, 1);
      updated.splice(targetIndex, 0, draggedProject);
      return updated;
    });
  };

  const resetToServerOrder = () => {
    setOrderedActiveProjects(projects.filter((p) => !p.archived));
  };

  const handleDragEnd = async () => {
    if (draggingProjectId === null) return;

    setDraggingProjectId(null);

    const orderedIds = orderedActiveProjects.map((project) => project.id);
    const baselineIds = projects
      .filter((project) => !project.archived)
      .map((project) => project.id);

    const hasChanged =
      orderedIds.length !== baselineIds.length ||
      orderedIds.some((id, index) => id !== baselineIds[index]);

    if (!hasChanged) {
      resetToServerOrder();
      return;
    }

    try {
      await onReorderProjects(orderedIds);
    } catch (error) {
      console.error("Failed to reorder projects:", error);
      resetToServerOrder();
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r bg-muted/20 transition-all duration-300 ease-in-out",
        isCollapsed ? "w-14 items-center p-2" : "w-64 p-4 pr-2"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "mb-4 flex w-full items-center",
          isCollapsed ? "justify-center" : "justify-between pr-2"
        )}
      >
        <h2
          className={cn(
            "text-sm font-semibold text-muted-foreground",
            isCollapsed && "hidden"
          )}
        >
          PROJECTS
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleCollapsed}
          aria-label={isCollapsed ? "Expand Projects panel" : "Collapse Projects panel"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {isCollapsed ? (
          <TooltipProvider delayDuration={0}>
            <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
            {/* All Projects Icon */}
            <TooltipPrimitive.Root>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelectProject("all")}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors cursor-pointer",
                    selectedProjectId === "all" ? "bg-accent text-accent-foreground" : "bg-background hover:bg-accent"
                  )}
                  aria-label="All Projects"
                >
                  <Folder className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>All Projects</p>
              </TooltipContent>
            </TooltipPrimitive.Root>

            {/* No Project Icon */}
            <TooltipPrimitive.Root>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelectProject(null)}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors cursor-pointer",
                    selectedProjectId === null ? "bg-accent text-accent-foreground" : "bg-background hover:bg-accent"
                  )}
                  aria-label="No Project"
                >
                  <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>No Project</p>
              </TooltipContent>
            </TooltipPrimitive.Root>

            {/* Focus Icon */}
            <TooltipPrimitive.Root>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelectProject("focus")}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors cursor-pointer",
                    selectedProjectId === "focus" ? "bg-accent text-accent-foreground" : "bg-background hover:bg-accent"
                  )}
                  aria-label="Focus"
                >
                  <Eye className="h-4 w-4 text-green-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Focus{focusedTaskCount > 0 ? ` (${focusedTaskCount})` : ""}</p>
              </TooltipContent>
            </TooltipPrimitive.Root>

            {/* Active Project Icons */}
            {orderedActiveProjects.map((project) => (
              <TooltipPrimitive.Root key={project.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSelectProject(project.id)}
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors cursor-pointer",
                      selectedProjectId === project.id ? "bg-accent text-accent-foreground" : "bg-background hover:bg-accent"
                    )}
                    aria-label={project.name}
                  >
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: project.colorHex }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{project.name}</p>
                </TooltipContent>
              </TooltipPrimitive.Root>
            ))}
          </div>
        </TooltipProvider>
      ) : (
        <>

      {/* All Projects Option */}
      <button
        onClick={() => onSelectProject("all")}
        className={cn(
          "mb-2 flex w-full items-center justify-between rounded pl-3 pr-2 py-2 text-sm transition-colors hover:bg-accent cursor-pointer",
          selectedProjectId === "all" && "bg-accent font-medium"
        )}
      >
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          <span>All Projects</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{totalActiveTasks}</span>
          {/* Spacer to align with individual project items that have a menu button */}
          <div className="w-4" />
        </div>
      </button>

      {/* No Project Option */}
      <button
        onClick={() => onSelectProject(null)}
        className={cn(
          "mb-4 flex w-full items-center justify-between rounded pl-3 pr-2 py-2 text-sm transition-colors hover:bg-accent cursor-pointer",
          selectedProjectId === null && "bg-accent font-medium"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
          <span>No Project</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{taskCounts[0] || 0}</span>
          {/* Spacer to align with individual project items that have a menu button */}
          <div className="w-4" />
        </div>
      </button>

      {/* Focus Filter */}
      <button
        onClick={() => onSelectProject("focus")}
        className={cn(
          "mb-4 flex w-full items-center justify-between rounded pl-3 pr-2 py-2 text-sm transition-colors hover:bg-accent cursor-pointer",
          selectedProjectId === "focus" && "bg-accent font-medium"
        )}
      >
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-green-500" />
          <span>Focus</span>
        </div>
        <div className="flex items-center gap-1">
          {focusedTaskCount > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {focusedTaskCount}
            </span>
          )}
          <div className="w-4" />
        </div>
      </button>

      {/* Project List */}
      <div className="flex-1 space-y-1 overflow-y-auto">
        {orderedActiveProjects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isSelected={selectedProjectId === project.id}
            taskCount={taskCounts[project.id] || 0}
            onSelect={() => onSelectProject(project.id)}
            onUpdate={onUpdateProject}
            onDelete={onDeleteProject}
            draggable
            disableSelection={isDraggingProjects}
            isDragging={draggingProjectId === project.id}
            onDragStart={() => handleDragStart(project.id)}
            onDragOver={() => handleDragOver(project.id)}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* Create New Project */}
        {isCreating ? (
          <form onSubmit={handleCreateProject} className="p-2">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              className="h-8 text-sm"
              autoFocus
              onBlur={() => {
                if (!newProjectName.trim()) {
                  setIsCreating(false);
                }
              }}
            />
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </Button>
        )}
      </div>

        {/* Archived Projects */}
        {archivedProjects.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="mb-2 flex w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {showArchived ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Archive className="h-4 w-4" />
              <span>Archived ({archivedProjects.length})</span>
            </button>

            {showArchived && (
              <div className="space-y-1">
                {archivedProjects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isSelected={selectedProjectId === project.id}
                    taskCount={taskCounts[project.id] || 0}
                    onSelect={() => onSelectProject(project.id)}
                    onUpdate={onUpdateProject}
                    onDelete={onDeleteProject}
                    disableSelection={isDraggingProjects}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        </>
      )}
    </div>
  );
}
