import type { ApiClient } from "./client";
import type { NoteRowDTO } from "@toasty/contracts";

export interface NotesResponse {
  notes: NoteRowDTO[];
}

export class NotesApi {
  constructor(private client: ApiClient) {}

  /**
   * Get notes for a task
   */
  async get(taskId: number): Promise<NotesResponse> {
    return this.client.get<NotesResponse>(`/api/tasks/${taskId}/notes`);
  }

  /**
   * Update notes for a task (full text replacement)
   */
  async update(taskId: number, text: string): Promise<NotesResponse> {
    return this.client.post<NotesResponse>(`/api/tasks/${taskId}/notes`, {
      text,
    });
  }
}
