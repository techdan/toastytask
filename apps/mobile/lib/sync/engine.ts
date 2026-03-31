import type { SyncPullResponse, SyncOperation } from "@toasty/contracts";
import { api } from "../api";
import { OutboxQueue } from "./outbox";
import { LocalDatabase } from "../storage/database";
import { EventEmitter } from "./events";
import { getNetworkStateSync } from "./network";

export type SyncEvent =
  | { type: "sync:started" }
  | { type: "sync:progress"; phase: "auth" | "push" | "pull"; message: string }
  | { type: "sync:completed"; cursor: string }
  | { type: "sync:offline" }
  | { type: "sync:error"; error: Error }
  | { type: "sync:auth-required" }
  | { type: "sync:pending-count"; count: number };

export interface SyncEngineConfig {
  database: LocalDatabase;
  outbox: OutboxQueue;
  refreshAuthToken: () => Promise<boolean>;
}

export class SyncEngine {
  private isSyncing = false;
  public events = new EventEmitter<SyncEvent>();

  constructor(private config: SyncEngineConfig) {}

  /**
   * Perform full sync (push then pull)
   */
  async sync(): Promise<void> {
    console.log('[SyncEngine] Sync requested');
    if (this.isSyncing) {
      console.log('[SyncEngine] Already syncing, skipping');
      return;
    }
    if (!getNetworkStateSync()) {
      console.log('[SyncEngine] Offline, skipping sync');
      this.events.emit({ type: "sync:offline" });
      return;
    }

    this.isSyncing = true;
    this.events.emit({ type: "sync:started" });
    console.log('[SyncEngine] Sync started');

    try {
      // Validate auth token
      console.log('[SyncEngine] Checking auth token...');
      this.events.emit({ type: "sync:progress", phase: "auth", message: "Authenticating..." });
      const authValid = await this.config.refreshAuthToken();
      console.log('[SyncEngine] Auth valid:', authValid);
      if (!authValid) {
        this.events.emit({ type: "sync:auth-required" });
        return;
      }

      // Push local changes first
      console.log('[SyncEngine] Starting push phase...');
      this.events.emit({ type: "sync:progress", phase: "push", message: "Uploading changes..." });
      await this.push();
      console.log('[SyncEngine] Push completed');

      // Then pull remote changes
      console.log('[SyncEngine] Starting pull phase...');
      this.events.emit({ type: "sync:progress", phase: "pull", message: "Downloading tasks..." });
      await this.pull();
      console.log('[SyncEngine] Pull completed');

      const cursor = this.config.database.getSyncCursor();
      this.events.emit({ type: "sync:completed", cursor });
    } catch (error) {
      this.events.emit({ type: "sync:error", error: error as Error });
    } finally {
      this.isSyncing = false;
      this.emitPendingCount();
    }
  }

  /**
   * Push queued operations to server
   */
  private async push(): Promise<void> {
    const pending = this.config.outbox.getPending(100);
    if (pending.length === 0) return;

    // Mark as in-flight
    this.config.outbox.markInFlight(pending.map((p) => p.id));

    // Convert to sync operations
    const operations: SyncOperation[] = pending.map((entry) => ({
      idempotencyKey: entry.idempotencyKey,
      method: entry.method,
      path: entry.path,
      body: entry.body,
    }));

    try {
      const response = await api.sync.push(operations);

      // Process results
      for (const result of response.results) {
        if (result.status === "success") {
          this.config.outbox.markApplied(result.idempotencyKey);

          // Handle ID mapping for creates
          if ("clientId" in result && "serverId" in result && result.clientId && result.serverId) {
            this.config.database.mapClientToServerId(
              result.clientId,
              result.serverId
            );
          }

          // Update local entity with server response
          if ("entity" in result && result.entity) {
            this.config.database.upsertFromServer(result.entity);
          }
        } else if (result.status === "error") {
          this.config.outbox.markFailed(
            result.idempotencyKey,
            result.code,
            result.message,
            result.retryable
          );
        }
      }

      // Update sync cursor if provided
      if (response.cursor) {
        this.config.database.setSyncCursor(response.cursor);
      }

      this.config.database.setLastPushTime(new Date().toISOString());
    } catch (error) {
      // Network error - reset to pending for retry
      for (const entry of pending) {
        this.config.outbox.markFailed(
          entry.idempotencyKey,
          "NETWORK_ERROR",
          "Network request failed",
          true
        );
      }
      throw error;
    }
  }

  /**
   * Pull changes from server
   */
  private async pull(): Promise<void> {
    let cursor = this.config.database.getSyncCursor();
    let hasMore = true;
    console.log('[SyncEngine] Pull starting with cursor:', cursor);

    while (hasMore) {
      console.log('[SyncEngine] Calling api.sync.pull with cursor:', cursor);
      const response = await api.sync.pull(cursor, 500);
      console.log('[SyncEngine] Pull response received:', { hasMore: response.hasMore, entityCounts: {
        tasks: response.entities.tasks.length,
        projects: response.entities.projects.length,
        notes: response.entities.notes.length
      }});

      // Apply entities to local database
      this.applyPullResponse(response);

      cursor = response.cursor;
      hasMore = response.hasMore;
    }

    // Store final cursor
    this.config.database.setSyncCursor(cursor);
    this.config.database.setLastPullTime(new Date().toISOString());
  }

  private applyPullResponse(response: SyncPullResponse): void {
    const db = this.config.database;

    // Tasks
    for (const task of response.entities.tasks) {
      if (task.deletedAt) {
        db.deleteTask(task.id);
      } else {
        db.upsertTask(task);
      }
    }

    // Projects
    for (const project of response.entities.projects) {
      if (project.deletedAt) {
        db.deleteProject(project.id);
      } else {
        db.upsertProject(project);
      }
    }

    // Notes
    for (const note of response.entities.notes) {
      db.upsertNote(note);
    }

    // Settings
    if (response.entities.settings) {
      db.upsertSettings(response.entities.settings);
    }
  }

  private emitPendingCount(): void {
    const count = this.config.outbox.getPendingCount();
    this.events.emit({ type: "sync:pending-count", count });
  }

  /**
   * Get current sync status
   */
  getStatus(): {
    isSyncing: boolean;
    pendingCount: number;
    syncState: ReturnType<LocalDatabase["getSyncState"]>;
  } {
    return {
      isSyncing: this.isSyncing,
      pendingCount: this.config.outbox.getPendingCount(),
      syncState: this.config.database.getSyncState(),
    };
  }
}
