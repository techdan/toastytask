import type { ApiClient } from "./client";
import type {
  SyncPullResponse,
  SyncPushResponse,
  SyncOperation,
} from "@toasty/contracts";

export class SyncApi {
  constructor(private client: ApiClient) {}

  /**
   * Pull changes from server since the given cursor
   *
   * @param since - ISO 8601 timestamp or empty string for initial sync
   * @param limit - Maximum number of entities to return (default 500, max 1000)
   */
  async pull(since: string = "", limit = 500): Promise<SyncPullResponse> {
    const params = new URLSearchParams();
    params.set("since", since);
    params.set("limit", String(Math.min(limit, 1000)));

    return this.client.get<SyncPullResponse>(`/api/sync/pull?${params}`);
  }

  /**
   * Push local changes to server
   *
   * @param operations - Array of operations to push (max 100)
   */
  async push(operations: SyncOperation[]): Promise<SyncPushResponse> {
    return this.client.post<SyncPushResponse>("/api/sync/push", {
      operations: operations.slice(0, 100),
    });
  }
}
