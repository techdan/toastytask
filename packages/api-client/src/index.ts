/**
 * @toasty/api-client
 *
 * Typed HTTP client for the Toasty Task API.
 * Provides auth header injection and typed request/response handling.
 */

export { ApiClient, AuthError, ApiError, NetworkError } from "./client";
export type { ApiClientConfig } from "./client";
export { TasksApi } from "./tasks";
export type { ListTasksOptions, TaskListResponse, TaskResponse, HeatCoolOptions } from "./tasks";
export { ProjectsApi } from "./projects";
export type { ProjectListResponse, ProjectResponse } from "./projects";
export { NotesApi } from "./notes";
export type { NotesResponse } from "./notes";
export { SettingsApi } from "./settings";
export type { SettingsResponse } from "./settings";
export { SyncApi } from "./sync";

import { ApiClient, ApiClientConfig } from "./client";
import { TasksApi } from "./tasks";
import { ProjectsApi } from "./projects";
import { NotesApi } from "./notes";
import { SettingsApi } from "./settings";
import { SyncApi } from "./sync";

/**
 * Create a fully configured API client with all sub-APIs
 */
export function createApiClient(config: ApiClientConfig) {
  const client = new ApiClient(config);

  return {
    client,
    tasks: new TasksApi(client),
    projects: new ProjectsApi(client),
    notes: new NotesApi(client),
    settings: new SettingsApi(client),
    sync: new SyncApi(client),
  };
}

export type ToastyApiClient = ReturnType<typeof createApiClient>;
