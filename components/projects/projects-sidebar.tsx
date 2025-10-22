"use client";

import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, Archive, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { ProjectItem } from "./project-item";

interface ProjectsSidebarProps {
  projects: Project[];
  selectedProjectId: number | null | "all";
  onSelectProject: (projectId: number | null | "all") => void;
  onCreateProject: (name: string, colorHex: string) => Promise<void>;
  onUpdateProject: (id: number, updates: Partial<Project>) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  taskCounts: Record<number, number>;
}

export function ProjectsSidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  taskCounts,
}: ProjectsSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);
  const totalActiveTasks = Object.values(taskCounts).reduce((sum, count) => sum + count, 0);

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

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/20 p-4 pr-2">
      {/* Header */}
      <div className="mb-4 pr-2">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">PROJECTS</h2>
      </div>

      {/* All Projects Option */}
      <button
        onClick={() => onSelectProject("all")}
        className={cn(
          "mb-2 flex w-full items-center justify-between rounded pl-3 pr-2 py-2 text-sm transition-colors hover:bg-accent",
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
          "mb-4 flex w-full items-center justify-between rounded pl-3 pr-2 py-2 text-sm transition-colors hover:bg-accent",
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

      {/* Project List */}
      <div className="flex-1 space-y-1 overflow-y-auto">
        {activeProjects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            isSelected={selectedProjectId === project.id}
            taskCount={taskCounts[project.id] || 0}
            onSelect={() => onSelectProject(project.id)}
            onUpdate={onUpdateProject}
            onDelete={onDeleteProject}
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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
