import type { ApiClient } from "./client";
import type {
  TaskDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
} from "@toasty/contracts";

export interface ListTasksOptions {
  projectId?: number | null;
  bucket?: "todo" | "watch" | "later";
  includeCompleted?: boolean;
  includeFocused?: boolean;
}

export interface TaskListResponse {
  tasks: TaskDTO[];
}

export interface TaskResponse {
  task: TaskDTO;
}

export interface HeatCoolOptions {
  increment?: number;
  decrement?: number;
  visibleTasks?: Array<{ id: number; heat: number }>;
}

export class TasksApi {
  constructor(private client: ApiClient) {}

  /**
   * List tasks with optional filters
   */
  async list(options?: ListTasksOptions): Promise<TaskListResponse> {
    const params = new URLSearchParams();

    if (options?.projectId !== undefined) {
      params.set(
        "projectId",
        options.projectId === null ? "null" : String(options.projectId)
      );
    }
    if (options?.bucket) {
      params.set("bucket", options.bucket);
    }
    if (options?.includeCompleted) {
      params.set("includeCompleted", "true");
    }
    if (options?.includeFocused) {
      params.set("includeFocused", "true");
    }

    const query = params.toString();
    const path = query ? `/api/tasks?${query}` : "/api/tasks";

    return this.client.get<TaskListResponse>(path);
  }

  /**
   * Get a single task by ID
   */
  async get(id: number): Promise<TaskResponse> {
    return this.client.get<TaskResponse>(`/api/tasks/${id}`);
  }

  /**
   * Create a new task
   */
  async create(data: CreateTaskDTO): Promise<TaskResponse> {
    return this.client.post<TaskResponse>("/api/tasks", data);
  }

  /**
   * Update an existing task
   */
  async update(id: number, data: UpdateTaskDTO): Promise<TaskResponse> {
    return this.client.patch<TaskResponse>(`/api/tasks/${id}`, data);
  }

  /**
   * Delete a task (soft delete)
   */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.client.delete<{ success: boolean }>(`/api/tasks/${id}`);
  }

  /**
   * Complete a task
   */
  async complete(id: number): Promise<TaskResponse> {
    return this.client.post<TaskResponse>(`/api/tasks/${id}/complete`);
  }

  /**
   * Uncomplete a task
   */
  async uncomplete(id: number): Promise<TaskResponse> {
    return this.client.delete<TaskResponse>(`/api/tasks/${id}/complete`);
  }

  /**
   * Increase task heat (move up in priority)
   */
  async heat(id: number, options?: HeatCoolOptions): Promise<TaskResponse> {
    return this.client.post<TaskResponse>(`/api/tasks/${id}/heat`, options ?? {});
  }

  /**
   * Decrease task heat (move down in priority)
   */
  async cool(id: number, options?: HeatCoolOptions): Promise<TaskResponse> {
    return this.client.post<TaskResponse>(`/api/tasks/${id}/cool`, options ?? {});
  }

  /**
   * Cycle star level (none -> blue -> yellow -> orange -> none)
   */
  async cycleStar(id: number): Promise<TaskResponse> {
    return this.client.post<TaskResponse>(`/api/tasks/${id}/star`);
  }

  /**
   * Touch a task (update lastTouchedAt for recency)
   */
  async touch(id: number): Promise<TaskResponse> {
    return this.client.post<TaskResponse>(`/api/tasks/${id}/touch`);
  }

  /**
   * Toggle focus on a task
   */
  async toggleFocus(id: number): Promise<TaskResponse> {
    return this.client.post<TaskResponse>(`/api/tasks/${id}/focus`);
  }

  /**
   * Snooze a focused task until a specific time
   */
  async snoozeFocus(id: number, until: string): Promise<TaskResponse> {
    return this.client.post<TaskResponse>(`/api/tasks/${id}/focus/snooze`, {
      until,
    });
  }
}
