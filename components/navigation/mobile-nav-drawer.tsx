"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, Menu, Plus, Settings } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import type { Project } from "@/types";
import { ProjectItem } from "@/components/projects/project-item";

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  selectedProjectId: number | null | "all";
  taskCounts: Record<number, number>;
  onSelectProject: (projectId: number | null | "all") => void;
  onCreateProject: (name: string, colorHex: string) => Promise<void>;
  onUpdateProject: (id: number, updates: Partial<Project>) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  onNavigateSettings: () => void;
}

const DEFAULT_PROJECT_COLOR = "#6b7280";

export function MobileNavDrawer({
  open,
  onOpenChange,
  projects,
  selectedProjectId,
  taskCounts,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onNavigateSettings,
}: MobileNavDrawerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const activeProjects = useMemo(() => projects.filter((project) => !project.archived), [projects]);
  const archivedProjects = useMemo(() => projects.filter((project) => project.archived), [projects]);
  const totalActiveTasks = useMemo(
    () => Object.values(taskCounts).reduce((sum, count) => sum + count, 0),
    [taskCounts]
  );

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    try {
      await onCreateProject(trimmed, DEFAULT_PROJECT_COLOR);
      setNewProjectName("");
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create project", error);
    }
  };

  const handleSelect = (projectId: number | null | "all") => {
    onSelectProject(projectId);
    onOpenChange(false);
  };

  const handleOpenSettings = () => {
    onOpenChange(false);
    onNavigateSettings();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[92vw] max-w-sm p-0 sm:max-w-sm">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Logo width={28} height={28} className="h-7 w-7" />
              <div className="text-base font-semibold leading-tight">Navigation</div>
            </div>
            <Menu className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tasks
              </div>
              <Button
                variant={selectedProjectId === "all" ? "secondary" : "ghost"}
                className="w-full justify-start gap-3"
                onClick={() => handleSelect("all")}
              >
                <Folder className="h-4 w-4" />
                <div className="flex flex-1 items-center justify-between">
                  <span>All Projects</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{totalActiveTasks}</span>
                </div>
              </Button>
              <Button
                variant={selectedProjectId === null ? "secondary" : "ghost"}
                className="w-full justify-start gap-3"
                onClick={() => handleSelect(null)}
              >
                <div className="flex h-4 w-4 items-center justify-center">
                  <div className="h-3 w-3 rounded-full border-2 border-muted-foreground" />
                </div>
                <div className="flex flex-1 items-center justify-between">
                  <span>No Project</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{taskCounts[0] || 0}</span>
                </div>
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Projects</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                  {activeProjects.length}
                </span>
              </div>

              <div className="space-y-1">
                {activeProjects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isSelected={selectedProjectId === project.id}
                    taskCount={taskCounts[project.id] || 0}
                    onSelect={() => handleSelect(project.id)}
                    onUpdate={onUpdateProject}
                    onDelete={onDeleteProject}
                    disableSelection={false}
                    forceActionsVisible
                  />
                ))}
              </div>

              {isCreating ? (
                <form onSubmit={handleCreateProject} className="space-y-2">
                  <Input
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="Project name"
                    className="h-10"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)} type="button">
                      Cancel
                    </Button>
                    <Button size="sm" type="submit">
                      Create
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-muted-foreground"
                  onClick={() => setIsCreating(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span>New Project</span>
                </Button>
              )}

              {archivedProjects.length > 0 && (
                <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                  <button
                    className="flex w-full items-center justify-between text-sm font-medium"
                    onClick={() => setShowArchived((prev) => !prev)}
                  >
                    <span className="flex items-center gap-2">
                      {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Archived
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {archivedProjects.length}
                    </span>
                  </button>
                  {showArchived && (
                    <div className="space-y-1">
                      {archivedProjects.map((project) => (
                        <ProjectItem
                          key={project.id}
                          project={project}
                          isSelected={selectedProjectId === project.id}
                          taskCount={taskCounts[project.id] || 0}
                          onSelect={() => handleSelect(project.id)}
                          onUpdate={onUpdateProject}
                          onDelete={onDeleteProject}
                          disableSelection={false}
                          forceActionsVisible
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t px-4 py-3">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleOpenSettings}
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
