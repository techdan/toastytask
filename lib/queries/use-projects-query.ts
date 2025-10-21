import { useQuery } from "@tanstack/react-query";
import type { Project } from "@/types";

interface ProjectsQueryParams {
  includeArchived?: boolean;
}

interface ProjectsResponse {
  projects: Project[];
}

async function fetchProjects(
  params: ProjectsQueryParams = {}
): Promise<Project[]> {
  const searchParams = new URLSearchParams();

  if (params.includeArchived !== undefined) {
    searchParams.set("includeArchived", String(params.includeArchived));
  }

  const url = `/api/projects${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch projects");
  }

  const data: ProjectsResponse = await response.json();
  return data.projects;
}

export function useProjectsQuery(params: ProjectsQueryParams = {}) {
  return useQuery({
    queryKey: ["projects", params],
    queryFn: () => fetchProjects(params),
    // Projects change less frequently - can be more relaxed
    refetchOnWindowFocus: false,
  });
}
