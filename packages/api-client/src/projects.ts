import type { ApiClient } from "./client";
import type {
  ProjectDTO,
  CreateProjectDTO,
  UpdateProjectDTO,
} from "@toasty/contracts";

export interface ProjectListResponse {
  projects: ProjectDTO[];
}

export interface ProjectResponse {
  project: ProjectDTO;
}

export class ProjectsApi {
  constructor(private client: ApiClient) {}

  /**
   * List all projects
   */
  async list(): Promise<ProjectListResponse> {
    return this.client.get<ProjectListResponse>("/api/projects");
  }

  /**
   * Get a single project by ID
   */
  async get(id: number): Promise<ProjectResponse> {
    return this.client.get<ProjectResponse>(`/api/projects/${id}`);
  }

  /**
   * Create a new project
   */
  async create(data: CreateProjectDTO): Promise<ProjectResponse> {
    return this.client.post<ProjectResponse>("/api/projects", data);
  }

  /**
   * Update an existing project
   */
  async update(id: number, data: UpdateProjectDTO): Promise<ProjectResponse> {
    return this.client.patch<ProjectResponse>(`/api/projects/${id}`, data);
  }

  /**
   * Delete a project
   */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.client.delete<{ success: boolean }>(`/api/projects/${id}`);
  }

  /**
   * Reorder projects
   */
  async reorder(projectIds: number[]): Promise<ProjectListResponse> {
    return this.client.post<ProjectListResponse>("/api/projects/reorder", {
      projectIds,
    });
  }
}
