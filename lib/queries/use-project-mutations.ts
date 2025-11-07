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

function splitProjectsByArchived(projects: Project[]) {
  return projects.reduce(
    (acc, project) => {
      if (project.archived) {
        acc.archived.push(project);
      } else {
        acc.active.push(project);
      }
      return acc;
    },
    { active: [] as Project[], archived: [] as Project[] }
  );
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

// Reorder projects
async function reorderProjectsRequest(projectIds: number[]): Promise<void> {
  const response = await fetch("/api/projects/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds }),
  });

  if (!response.ok) {
    throw new Error("Failed to reorder projects");
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

      let maxSortOrder = 0;
      previousProjects.forEach(([, data]) => {
        if (!Array.isArray(data)) return;
        data.forEach((project) => {
          if (!project.archived) {
            maxSortOrder = Math.max(maxSortOrder, project.sortOrder ?? 0);
          }
        });
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
        sortOrder: maxSortOrder + 1,
      };

      // Optimistically add project to all project queries
      queryClient.setQueriesData<Project[]>(
        { queryKey: ["projects"] },
        (oldProjects) => {
          if (!oldProjects || !Array.isArray(oldProjects)) {
            return oldProjects;
          }
          return appendProjectToActiveList(oldProjects, optimisticProject);
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

// Hook: Reorder projects with optimistic update
export function useReorderProjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderProjectsRequest,
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ["projects"] });

      const previousProjects = queryClient.getQueriesData({
        queryKey: ["projects"],
      });

      queryClient.setQueriesData<Project[]>(
        { queryKey: ["projects"] },
        (oldProjects) => reorderProjectList(oldProjects, orderedIds)
      );

      return { previousProjects };
    },
    onError: (error, _variables, context) => {
      if (context?.previousProjects) {
        context.previousProjects.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to reorder projects", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

function appendProjectToActiveList(projects: Project[], projectToAdd: Project) {
  const { active, archived } = splitProjectsByArchived(projects);
  return [...active, projectToAdd, ...archived];
}

function reorderProjectList(
  projects: Project[] | undefined,
  orderedIds: number[]
): Project[] | undefined {
  if (!projects || !Array.isArray(projects) || orderedIds.length === 0) {
    return projects;
  }

  const { active, archived } = splitProjectsByArchived(projects);
  const projectMap = new Map(active.map((project) => [project.id, project]));
  const reorderedActive: Project[] = [];

  orderedIds.forEach((id, index) => {
    const project = projectMap.get(id);
    if (project) {
      reorderedActive.push({ ...project, sortOrder: index + 1 });
      projectMap.delete(id);
    }
  });

  if (projectMap.size > 0) {
    let offset = reorderedActive.length;
    projectMap.forEach((project) => {
      offset += 1;
      reorderedActive.push({ ...project, sortOrder: offset });
    });
  }

  return [...reorderedActive, ...archived];
}
