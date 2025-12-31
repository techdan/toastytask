import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ProjectDTO } from "@toasty/contracts";
import { useLocalDatabase } from "./useLocalDatabase";

/**
 * Project with task count for display in drawer
 */
export interface ProjectWithCount extends ProjectDTO {
  taskCount: number;
}

/**
 * Result from the useProjects hook
 */
export interface UseProjectsResult {
  projects: ProjectWithCount[];
  totalTaskCount: number;
  focusedTaskCount: number;
  noProjectTaskCount: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for accessing projects from local SQLite database
 * Includes task counts for each project (uncompleted tasks only)
 *
 * Returns projects sorted by displayOrder (sortOrder in DB)
 */
export function useProjects(): UseProjectsResult {
  const { database, isReady } = useLocalDatabase();

  const projectsQuery = useQuery({
    queryKey: ["local-projects"],
    queryFn: () => {
      if (!database) {
        return [];
      }
      return database.getProjects();
    },
    enabled: isReady,
    staleTime: 1000 * 60, // 1 minute - projects don't change often
  });

  const tasksQuery = useQuery({
    queryKey: ["local-tasks-for-counts"],
    queryFn: () => {
      if (!database) {
        return [];
      }
      // Get all non-deleted tasks for counting
      return database.getTasks();
    },
    enabled: isReady,
    staleTime: 1000 * 30, // 30 seconds
  });

  const result = useMemo(() => {
    const projects = projectsQuery.data ?? [];
    const tasks = tasksQuery.data ?? [];

    // Only count uncompleted tasks
    const uncompletedTasks = tasks.filter((task) => !task.completedAt);

    // Calculate counts per project
    const projectCounts: Record<number, number> = {};
    let noProjectCount = 0;
    let focusedCount = 0;

    for (const task of uncompletedTasks) {
      // Count focused tasks
      if (task.isFocused) {
        focusedCount++;
      }

      // Count by project
      if (task.projectId === null) {
        noProjectCount++;
      } else {
        projectCounts[task.projectId] = (projectCounts[task.projectId] ?? 0) + 1;
      }
    }

    // Add counts to projects
    const projectsWithCounts: ProjectWithCount[] = projects.map((project) => ({
      ...project,
      taskCount: projectCounts[project.id] ?? 0,
    }));

    return {
      projects: projectsWithCounts,
      totalTaskCount: uncompletedTasks.length,
      focusedTaskCount: focusedCount,
      noProjectTaskCount: noProjectCount,
    };
  }, [projectsQuery.data, tasksQuery.data]);

  return {
    ...result,
    isLoading: projectsQuery.isLoading || tasksQuery.isLoading || !isReady,
    error: projectsQuery.error ?? tasksQuery.error ?? null,
    refetch: () => {
      projectsQuery.refetch();
      tasksQuery.refetch();
    },
  };
}

/**
 * Hook for getting a single project by ID
 */
export function useProject(projectId: number | null) {
  const { projects, isLoading, error } = useProjects();

  const project = useMemo(() => {
    if (projectId === null) {
      return null;
    }
    return projects.find((p) => p.id === projectId) ?? null;
  }, [projects, projectId]);

  return {
    project,
    isLoading,
    error,
  };
}
