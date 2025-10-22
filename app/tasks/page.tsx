"use client";

import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectsSidebar } from "@/components/projects/projects-sidebar";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  useTasksQuery,
  useProjectsQuery,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "@/lib/queries";
import { useSettingsQuery } from "@/lib/queries/use-settings-query";
import type { Task, NewTask, Project } from "@/types";

export default function TasksPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null | "all">("all");
  const queryClient = useQueryClient();

  // Query hooks - TanStack Query handles caching and state
  // Fetch filtered tasks for display
  const {
    data: tasks = [],
    isLoading: isLoadingTasks,
  } = useTasksQuery({
    projectId: selectedProjectId === "all" ? undefined : selectedProjectId,
    includeCompleted: false,
  });

  // Always fetch ALL tasks for accurate counts in sidebar
  const { data: allTasks = [] } = useTasksQuery({
    projectId: undefined, // No filter - get all tasks
    includeCompleted: false,
  });

  const { data: projects = [] } = useProjectsQuery({
    includeArchived: true,
  });

  // Fetch settings for the drawer
  const { data: settings = null } = useSettingsQuery();

  // Background pre-fetching for better perceived performance
  useEffect(() => {
    // After initial load, pre-fetch tasks for each project in the background
    // This makes switching between projects instant
    if (projects.length > 0 && !isLoadingTasks) {
      projects.forEach((project) => {
        // Only pre-fetch if not already in cache
        queryClient.prefetchQuery({
          queryKey: ["tasks", { projectId: project.id, includeCompleted: false }],
          queryFn: async () => {
            const response = await fetch(`/api/tasks?projectId=${project.id}&includeCompleted=false`);
            if (!response.ok) return [];
            const data = await response.json();
            return data.tasks;
          },
        });
      });

      // Also pre-fetch tasks with no project
      queryClient.prefetchQuery({
        queryKey: ["tasks", { projectId: null, includeCompleted: false }],
        queryFn: async () => {
          const response = await fetch(`/api/tasks?projectId=null&includeCompleted=false`);
          if (!response.ok) return [];
          const data = await response.json();
          return data.tasks;
        },
      });
    }
  }, [projects, isLoadingTasks, queryClient]);

  // Mutation hooks with optimistic updates
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();

  // Client-side sorting (already sorted by server, but apply completed logic)
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Completed tasks always go to bottom
      if (a.completedAt && !b.completedAt) return 1;
      if (!a.completedAt && b.completedAt) return -1;

      // Sort by importance (desc: 12→2)
      if (b.importanceV1 !== a.importanceV1) {
        return b.importanceV1 - a.importanceV1;
      }

      // Then by due date (earlier is better, nulls last)
      if (a.dueAt && b.dueAt) {
        const aTime = typeof a.dueAt === "number" ? a.dueAt * 1000 : new Date(a.dueAt).getTime();
        const bTime = typeof b.dueAt === "number" ? b.dueAt * 1000 : new Date(b.dueAt).getTime();
        return aTime - bTime;
      }
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;

      // Finally by creation date (newest first)
      const aCreated = typeof a.createdAt === "number" ? a.createdAt * 1000 : new Date(a.createdAt).getTime();
      const bCreated = typeof b.createdAt === "number" ? b.createdAt * 1000 : new Date(b.createdAt).getTime();
      return bCreated - aCreated;
    });
  }, [tasks]);

  const handleAddTask = async (taskData: Omit<NewTask, "createdAt" | "updatedAt">) => {
    createTaskMutation.mutate(taskData as NewTask);
  };

  const handleUpdateTask = async (id: number, updates: Partial<Task>) => {
    updateTaskMutation.mutate({ id, updates });
  };

  const handleDeleteTask = async (id: number) => {
    deleteTaskMutation.mutate(id);
  };

  // Project CRUD handlers
  const handleCreateProject = async (name: string, colorHex: string) => {
    createProjectMutation.mutate({ name, colorHex, archived: false });
  };

  const handleUpdateProject = async (id: number, updates: Partial<Project>) => {
    updateProjectMutation.mutate({ id, updates });
  };

  const handleDeleteProject = async (id: number) => {
    deleteProjectMutation.mutate(id);

    // If the deleted project was selected, switch to "all"
    if (selectedProjectId === id) {
      setSelectedProjectId("all");
    }
  };

  // Calculate task counts per project from ALL tasks (not filtered)
  const taskCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    allTasks.forEach((task) => {
      const projectId = task.projectId || 0; // 0 for tasks with no project
      counts[projectId] = (counts[projectId] || 0) + 1;
    });
    return counts;
  }, [allTasks]);

  const isLoading = isLoadingTasks;

  return (
    <div className="flex h-screen">
      {/* Projects Sidebar */}
      <ProjectsSidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        taskCounts={taskCounts}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-5xl py-8">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="mb-2 text-3xl font-bold">Tasks</h1>
              <p className="text-muted-foreground">
                Manage your tasks with importance-based prioritization
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <SettingsDrawer initialSettings={settings} />
            </div>
          </div>

          {/* Quick Add */}
          <div className="mb-6">
            <QuickAdd
              onAdd={handleAddTask}
              currentProjectId={selectedProjectId === "all" ? null : selectedProjectId}
            />
          </div>

          {/* Task List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          ) : (
            <TaskList
              tasks={sortedTasks}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
            />
          )}
        </div>
      </div>
    </div>
  );
}
