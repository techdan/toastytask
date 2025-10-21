import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Task } from "@/types";

interface TasksQueryParams {
  projectId?: number | null;
  includeCompleted?: boolean;
}

interface TasksResponse {
  tasks: Task[];
}

async function fetchTasks(params: TasksQueryParams = {}): Promise<Task[]> {
  const searchParams = new URLSearchParams();

  if (params.projectId !== undefined) {
    searchParams.set("projectId", String(params.projectId));
  }

  if (params.includeCompleted !== undefined) {
    searchParams.set("includeCompleted", String(params.includeCompleted));
  }

  const url = `/api/tasks${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch tasks");
  }

  const data: TasksResponse = await response.json();
  return data.tasks;
}

export function useTasksQuery(params: TasksQueryParams = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", params],
    queryFn: () => fetchTasks(params),
    // Tasks are critical data - refetch on window focus
    refetchOnWindowFocus: true,
    // Note: Uses default 5-minute staleTime from QueryProvider.
    // Server recalculates importance on every GET (see app/api/tasks/route.ts),
    // so when cache does refetch (on focus, navigation, etc), importance is fresh.
    // Worst case: 5min stale importance if user keeps app open without interaction.
  });

  // Seed the notes cache when tasks load
  useEffect(() => {
    if (query.data) {
      query.data.forEach((task) => {
        if (task.notes) {
          // Seed the notes cache for this task
          queryClient.setQueryData(["notes", task.id], task.notes);
        }
      });
    }
  }, [query.data, queryClient]);

  return query;
}
