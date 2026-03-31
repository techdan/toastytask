import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import type { CreateProjectDTO, UpdateProjectDTO } from "@toasty/contracts";
import { useLocalDatabase } from "./useLocalDatabase";
import { ProjectMutations } from "../lib/mutations/project-mutations";

/**
 * Hook for creating projects with optimistic updates
 */
export function useCreateProject() {
  const { database, outbox } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProjectDTO) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }
      const mutations = new ProjectMutations({ database, outbox, userId });
      return mutations.createProject(data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-projects"] });
    },
  });
}

/**
 * Hook for updating projects
 */
export function useUpdateProject() {
  const { database, outbox } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateProjectDTO }) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }
      const mutations = new ProjectMutations({ database, outbox, userId });
      const result = mutations.updateProject(id, data);
      if (!result) throw new Error("Project not found");
      return result;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-projects"] });
    },
  });
}

/**
 * Hook for deleting projects
 */
export function useDeleteProject() {
  const { database, outbox } = useLocalDatabase();
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      if (!database || !outbox || !userId) {
        throw new Error("Database not ready");
      }
      const mutations = new ProjectMutations({ database, outbox, userId });
      if (!mutations.deleteProject(id)) throw new Error("Project not found");
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["local-projects"] });
      // Invalidate tasks in case tasks had this project
      queryClient.invalidateQueries({ queryKey: ["local-tasks"] });
    },
  });
}
