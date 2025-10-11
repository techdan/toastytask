"use client";

import { useEffect, useState, useMemo } from "react";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectsSidebar } from "@/components/projects/projects-sidebar";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import type { Task, NewTask, Project } from "@/types";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null | "all">("all");

  // Fetch projects and tasks on mount
  useEffect(() => {
    fetchProjects();
    fetchTasks();
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/projects?includeArchived=true");
      if (!response.ok) throw new Error("Failed to fetch projects");

      const data = await response.json();
      setProjects(data.projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const sortTasks = (tasksToSort: Task[]) => {
    return [...tasksToSort].sort((a, b) => {
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
  };

  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedProjectId !== "all") {
        params.append("projectId", String(selectedProjectId));
      }

      const response = await fetch(`/api/tasks?${params}`);
      if (!response.ok) throw new Error("Failed to fetch tasks");

      const data = await response.json();
      setTasks(sortTasks(data.tasks));
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTask = async (taskData: Omit<NewTask, "createdAt" | "updatedAt">) => {
    // Optimistic update: create temporary task
    const tempId = Date.now();
    const tempTask: Task = {
      id: tempId,
      ...taskData,
      // OPTIMISTIC UI: Calculate importance for immediate feedback
      // Server will recalculate and this will be replaced with authoritative value
      importanceV1: calculateImportanceV1(taskData as any),
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      archivedAt: null,
      deletedAt: null,
      lastTouchedAt: null,
      nextSurfaceAt: null,
    } as Task;

    setTasks((prev) => sortTasks([tempTask, ...prev]));

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskData),
      });

      if (!response.ok) throw new Error("Failed to create task");

      const data = await response.json();

      // Replace temporary task with real task
      setTasks((prev) => sortTasks(prev.map((t) => (t.id === tempId ? data.task : t))));
    } catch (error) {
      console.error("Error adding task:", error);
      // Remove temporary task on error
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      throw error;
    }
  };

  const handleUpdateTask = async (id: number, updates: Partial<Task>) => {
    // Optimistic update: immediately update UI
    const previousTasks = tasks;
    setTasks((prev) =>
      sortTasks(
        prev.map((task) => {
          if (task.id === id) {
            const updatedTask = { ...task, ...updates, updatedAt: new Date() };

            // OPTIMISTIC UI: Recalculate importance if relevant fields changed for immediate feedback
            // Server will recalculate using the same algorithm and replace with authoritative value
            if (
              updates.priority !== undefined ||
              updates.star !== undefined ||
              updates.dueAt !== undefined
            ) {
              updatedTask.importanceV1 = calculateImportanceV1(updatedTask);
            }

            return updatedTask;
          }
          return task;
        })
      )
    );

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Update failed with status:", response.status, errorData);
        // Revert on error
        setTasks(previousTasks);
        throw new Error(`Failed to update task: ${response.status}`);
      }

      const data = await response.json();

      // Update with server response
      setTasks((prev) =>
        sortTasks(prev.map((task) => (task.id === id ? data.task : task)))
      );
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete task");

      // Remove task from the list
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  // Project CRUD handlers
  const handleCreateProject = async (name: string, colorHex: string) => {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, colorHex }),
      });

      if (!response.ok) throw new Error("Failed to create project");

      const data = await response.json();
      setProjects((prev) => [...prev, data.project]);
    } catch (error) {
      console.error("Error creating project:", error);
      throw error;
    }
  };

  const handleUpdateProject = async (id: number, updates: Partial<Project>) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Failed to update project");

      const data = await response.json();
      setProjects((prev) => prev.map((p) => (p.id === id ? data.project : p)));
    } catch (error) {
      console.error("Error updating project:", error);
      throw error;
    }
  };

  const handleDeleteProject = async (id: number) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete project");

      setProjects((prev) => prev.filter((p) => p.id !== id));

      // If the deleted project was selected, switch to "all"
      if (selectedProjectId === id) {
        setSelectedProjectId("all");
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      throw error;
    }
  };

  // Calculate task counts per project
  const taskCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    tasks.forEach((task) => {
      const projectId = task.projectId || 0; // 0 for tasks with no project
      counts[projectId] = (counts[projectId] || 0) + 1;
    });
    return counts;
  }, [tasks]);

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
              <SettingsDrawer />
            </div>
          </div>

          {/* Quick Add */}
          <div className="mb-6">
            <QuickAdd onAdd={handleAddTask} />
          </div>

          {/* Task List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          ) : (
            <TaskList
              tasks={tasks}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
            />
          )}
        </div>
      </div>
    </div>
  );
}
