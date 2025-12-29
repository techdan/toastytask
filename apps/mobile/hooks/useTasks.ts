import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TaskDTO, Bucket, CreateTaskDTO } from "@toasty/contracts";
import { calculateHeat, calculateImportanceV1 } from "@toasty/domain";

interface UseTasksOptions {
  bucket?: Bucket;
  projectId?: number | null;
  includeCompleted?: boolean;
}

interface TaskWithFresh extends TaskDTO {
  _freshHeat: number;
  _freshImportance: number;
}

/**
 * Calculate fresh values and sort tasks by heat
 */
function processTasksWithFreshValues(tasks: TaskDTO[]): TaskWithFresh[] {
  const now = new Date();

  return tasks
    .map((task) => {
      const freshImportance = calculateImportanceV1(
        {
          priority: task.priority,
          dueAt: task.dueAt,
          starLevel: task.starLevel,
        },
        now
      );

      const freshHeat = calculateHeat(
        {
          heatAdjustment: task.heatAdjustment,
          lastTouchedAt: task.lastTouchedAt,
          lastHeatTouchedAt: task.lastHeatTouchedAt,
          importanceV1: freshImportance,
          isFocused: task.isFocused,
          focusSnoozeUntil: task.focusSnoozeUntil,
        },
        now,
        freshImportance
      );

      return {
        ...task,
        _freshHeat: freshHeat,
        _freshImportance: freshImportance,
      };
    })
    .sort((a, b) => {
      // Untouched tasks first
      const aUntouched = !a.lastTouchedAt && !a.lastHeatTouchedAt;
      const bUntouched = !b.lastTouchedAt && !b.lastHeatTouchedAt;

      if (aUntouched && !bUntouched) return -1;
      if (!aUntouched && bUntouched) return 1;

      // Then by heat descending
      return b._freshHeat - a._freshHeat;
    });
}

export function useTasks(options?: UseTasksOptions) {
  const queryKey = ["tasks", options?.bucket, options?.projectId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.tasks.list({
        bucket: options?.bucket,
        projectId: options?.projectId,
        includeCompleted: options?.includeCompleted,
      });
      return processTasksWithFreshValues(response.tasks);
    },
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useTask(id: number) {
  const query = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const response = await api.tasks.get(id);
      return response.task;
    },
    enabled: id > 0,
  });

  return {
    task: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTaskDTO) => {
      const response = await api.tasks.create(data);
      return response.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.tasks.complete(id);
      return response.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUncompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.tasks.uncomplete(id);
      return response.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useHeatTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      visibleTasks,
    }: {
      id: number;
      visibleTasks?: Array<{ id: number; heat: number }>;
    }) => {
      const response = await api.tasks.heat(id, { visibleTasks });
      return response.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCoolTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      visibleTasks,
    }: {
      id: number;
      visibleTasks?: Array<{ id: number; heat: number }>;
    }) => {
      const response = await api.tasks.cool(id, { visibleTasks });
      return response.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCycleStarTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.tasks.cycleStar(id);
      return response.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
