import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { Task, TaskWithFreshValues } from "@/types";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";

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

/**
 * Enrich tasks with fresh heat and importance values.
 * Called once when data arrives from server, not on every filter/project switch.
 *
 * PERFORMANCE: This moves O(n) expensive calculations from every project switch
 * to only when data actually changes (fetch, mutation, window focus).
 */
function enrichTasksWithFreshValues(tasks: Task[]): TaskWithFreshValues[] {
  const now = new Date();
  return tasks.map((task) => {
    const freshImportance = calculateImportanceV1(task, now);
    const freshHeat = calculateHeat(task, now, freshImportance);
    return {
      ...task,
      _freshImportance: freshImportance,
      _freshHeat: freshHeat,
    };
  });
}

export function useTasksQuery(params: TasksQueryParams = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", params],
    queryFn: () => fetchTasks(params),
    // Always refetch on window focus, regardless of staleTime.
    // This ensures fresh data after returning to tab (e.g., after a day away).
    // Multi-device sync will use Supabase Realtime in the future.
    refetchOnWindowFocus: "always",
  });

  // Time key that changes every 5 minutes, used to trigger re-enrichment.
  // This keeps heat decay and due date urgency fresh without network requests.
  const [timeKey, setTimeKey] = useState(() => Math.floor(Date.now() / (5 * 60 * 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeKey(Math.floor(Date.now() / (5 * 60 * 1000)));
    }, 60 * 1000); // Check every minute, but timeKey only changes every 5 min
    return () => clearInterval(interval);
  }, []);

  // Enrich tasks with fresh heat/importance values.
  // Re-runs when: (1) server data changes, or (2) timeKey changes (every 5 min).
  // Project switching uses cached enriched data - no recalculation needed.
  const enrichedData = useMemo(() => {
    if (!query.data) return undefined;
    return enrichTasksWithFreshValues(query.data);
  }, [query.data, timeKey]);

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

  // Return query with enriched data replacing raw data
  return useMemo(
    () => ({
      ...query,
      data: enrichedData,
    }),
    [query, enrichedData]
  );
}
