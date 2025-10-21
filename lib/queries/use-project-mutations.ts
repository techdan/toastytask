import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project, NewProject } from "@/types";

interface ProjectResponse {
  project: Project;
}

interface UpdateProjectData {
  id: number;
  updates: Partial<Project>;
}

// Create project
async function createProject(projectData: NewProject): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectData),
  });

  if (!response.ok) {
    throw new Error("Failed to create project");
  }

  const data: ProjectResponse = await response.json();
  return data.project;
}

// Update project
async function updateProject({
  id,
  updates,
}: UpdateProjectData): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error("Failed to update project");
  }

  const data: ProjectResponse = await response.json();
  return data.project;
}

// Delete project
async function deleteProject(id: number): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete project");
  }
}

// Hook: Create project with optimistic update
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      // Invalidate projects queries to refetch with new project
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Hook: Update project with optimistic update
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProject,
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["projects"] });

      // Snapshot previous values
      const previousProjects = queryClient.getQueriesData({
        queryKey: ["projects"],
      });

      // Optimistically update all project queries
      queryClient.setQueriesData<Project[]>(
        { queryKey: ["projects"] },
        (oldProjects) => {
          if (!oldProjects) return oldProjects;

          return oldProjects.map((project) =>
            project.id === id ? { ...project, ...updates } : project
          );
        }
      );

      return { previousProjects };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        context.previousProjects.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// Hook: Delete project with optimistic update
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProject,
    onMutate: async (projectId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["projects"] });

      // Snapshot previous values
      const previousProjects = queryClient.getQueriesData({
        queryKey: ["projects"],
      });

      // Optimistically remove project from all queries
      queryClient.setQueriesData<Project[]>(
        { queryKey: ["projects"] },
        (oldProjects) => {
          if (!oldProjects) return oldProjects;
          return oldProjects.filter((project) => project.id !== projectId);
        }
      );

      return { previousProjects };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        context.previousProjects.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
