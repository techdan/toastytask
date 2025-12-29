import * as SQLite from "expo-sqlite";
import { v4 as uuid } from "uuid";

export interface OutboxEntry {
  id: number;
  idempotencyKey: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  clientId?: string;
  state: "pending" | "in_flight" | "applied" | "failed";
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  lastAttemptAt?: string;
}

export class OutboxQueue {
  constructor(private db: SQLite.SQLiteDatabase) {}

  /**
   * Add an operation to the outbox
   * Returns the idempotency key for tracking
   */
  enqueue(operation: {
    method: "POST" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
    clientId?: string;
  }): string {
    const idempotencyKey = uuid();
    const now = new Date().toISOString();

    this.db.runSync(
      `INSERT INTO outbox (idempotency_key, method, path, body, client_id, state, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [
        idempotencyKey,
        operation.method,
        operation.path,
        operation.body ? JSON.stringify(operation.body) : null,
        operation.clientId ?? null,
        now,
      ]
    );

    return idempotencyKey;
  }

  /**
   * Get pending operations for push (up to limit)
   */
  getPending(limit = 100): OutboxEntry[] {
    const rows = this.db.getAllSync<Record<string, unknown>>(
      `SELECT * FROM outbox
       WHERE state IN ('pending', 'failed') AND retry_count < 5
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit]
    );

    return rows.map(this.parseRow);
  }

  /**
   * Mark entries as in-flight before push
   */
  markInFlight(ids: number[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => "?").join(",");
    this.db.runSync(
      `UPDATE outbox SET state = 'in_flight', last_attempt_at = ? WHERE id IN (${placeholders})`,
      [new Date().toISOString(), ...ids]
    );
  }

  /**
   * Mark entry as successfully applied
   */
  markApplied(idempotencyKey: string): void {
    this.db.runSync(
      "UPDATE outbox SET state = 'applied' WHERE idempotency_key = ?",
      [idempotencyKey]
    );
  }

  /**
   * Mark entry as failed with error details
   */
  markFailed(
    idempotencyKey: string,
    errorCode: string,
    errorMessage: string,
    retryable: boolean
  ): void {
    if (retryable) {
      this.db.runSync(
        `UPDATE outbox
         SET state = 'failed', error_code = ?, error_message = ?, retry_count = retry_count + 1
         WHERE idempotency_key = ?`,
        [errorCode, errorMessage, idempotencyKey]
      );
    } else {
      // Permanent failure - don't retry
      this.db.runSync(
        `UPDATE outbox
         SET state = 'failed', error_code = ?, error_message = ?, retry_count = 999
         WHERE idempotency_key = ?`,
        [errorCode, errorMessage, idempotencyKey]
      );
    }
  }

  /**
   * Get failed operations for user review
   */
  getFailed(): OutboxEntry[] {
    const rows = this.db.getAllSync<Record<string, unknown>>(
      "SELECT * FROM outbox WHERE state = 'failed' AND retry_count >= 5 ORDER BY created_at ASC"
    );
    return rows.map(this.parseRow);
  }

  /**
   * Remove applied entries (cleanup)
   */
  cleanup(): void {
    this.db.runSync("DELETE FROM outbox WHERE state = 'applied'");
  }

  /**
   * Get pending count for UI indicator
   */
  getPendingCount(): number {
    const result = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM outbox WHERE state IN ('pending', 'in_flight', 'failed') AND retry_count < 5"
    );
    return result?.count ?? 0;
  }

  /**
   * Retry a specific failed operation
   */
  retry(idempotencyKey: string): void {
    this.db.runSync(
      "UPDATE outbox SET state = 'pending', retry_count = 0, error_code = NULL, error_message = NULL WHERE idempotency_key = ?",
      [idempotencyKey]
    );
  }

  /**
   * Discard a failed operation
   */
  discard(idempotencyKey: string): void {
    this.db.runSync(
      "DELETE FROM outbox WHERE idempotency_key = ?",
      [idempotencyKey]
    );
  }

  private parseRow(row: Record<string, unknown>): OutboxEntry {
    return {
      id: row.id as number,
      idempotencyKey: row.idempotency_key as string,
      method: row.method as "POST" | "PATCH" | "DELETE",
      path: row.path as string,
      body: row.body ? JSON.parse(row.body as string) : undefined,
      clientId: row.client_id as string | undefined,
      state: row.state as OutboxEntry["state"],
      errorCode: row.error_code as string | undefined,
      errorMessage: row.error_message as string | undefined,
      retryCount: row.retry_count as number,
      createdAt: row.created_at as string,
      lastAttemptAt: row.last_attempt_at as string | undefined,
    };
  }
}
