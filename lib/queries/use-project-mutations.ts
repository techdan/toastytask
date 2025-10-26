import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
    onMutate: async (newProject) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["projects"] });

      // Snapshot previous values for rollback
      const previousProjects = queryClient.getQueriesData({
        queryKey: ["projects"],
      });

      // Create optimistic project with temporary negative ID
      const optimisticProject: Project = {
        id: -Date.now(), // Temporary negative ID (will be replaced by server)
        name: newProject.name,
        colorHex: newProject.colorHex ?? "#6b7280",
        archived: newProject.archived ?? false,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Optimistically add project to all project queries
      queryClient.setQueriesData<Project[]>(
        { queryKey: ["projects"] },
        (oldProjects) => {
          // Don't update if no data exists yet
          if (!oldProjects || !Array.isArray(oldProjects)) {
            return oldProjects;
          }

          // Add the new project at the beginning
          return [optimisticProject, ...oldProjects];
        }
      );

      return { previousProjects, optimisticId: optimisticProject.id };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        context.previousProjects.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to create project", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: (createdProject, _variables, context) => {
      // Replace the optimistic project with the real one from the server
      if (context?.optimisticId) {
        queryClient.setQueriesData<Project[]>(
          { queryKey: ["projects"] },
          (oldProjects) => {
            if (!oldProjects || !Array.isArray(oldProjects)) {
              return oldProjects;
            }

            // Replace the optimistic project with the real one
            return oldProjects.map((project) =>
              project.id === context.optimisticId ? createdProject : project
            );
          }
        );
      }

      toast.success("Project created successfully");
    },
    onSettled: () => {
      // Refetch to ensure consistency
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
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        context.previousProjects.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to update project", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
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
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousProjects) {
        context.previousProjects.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to delete project", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSuccess: () => {
      toast.success("Project deleted successfully");
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
