import * as SQLite from "expo-sqlite";
import { runMigrations } from "./schema";
import type {
  TaskDTO,
  ProjectDTO,
  NoteRowDTO,
  SettingsDTO,
} from "@toasty/contracts";

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await SQLite.openDatabaseAsync("toasty-task.db");
  await runMigrations(dbInstance);
  return dbInstance;
}

export class LocalDatabase {
  constructor(private db: SQLite.SQLiteDatabase) {}

  // ============================================================================
  // Sync State
  // ============================================================================

  getSyncCursor(): string {
    const result = this.db.getFirstSync<{ pull_cursor: string }>(
      "SELECT pull_cursor FROM sync_state WHERE id = 1"
    );
    return result?.pull_cursor ?? "";
  }

  setSyncCursor(cursor: string): void {
    this.db.runSync(
      "UPDATE sync_state SET pull_cursor = ? WHERE id = 1",
      [cursor]
    );
  }

  setLastPullTime(time: string): void {
    this.db.runSync(
      "UPDATE sync_state SET last_pull_at = ? WHERE id = 1",
      [time]
    );
  }

  setLastPushTime(time: string): void {
    this.db.runSync(
      "UPDATE sync_state SET last_push_at = ? WHERE id = 1",
      [time]
    );
  }

  getSyncState(): { pullCursor: string; lastPullAt: string | null; lastPushAt: string | null } {
    const result = this.db.getFirstSync<{
      pull_cursor: string;
      last_pull_at: string | null;
      last_push_at: string | null;
    }>("SELECT pull_cursor, last_pull_at, last_push_at FROM sync_state WHERE id = 1");

    return {
      pullCursor: result?.pull_cursor ?? "",
      lastPullAt: result?.last_pull_at ?? null,
      lastPushAt: result?.last_push_at ?? null,
    };
  }

  // ============================================================================
  // Tasks
  // ============================================================================

  getTasks(bucket?: string): TaskDTO[] {
    let query = `
      SELECT * FROM tasks
      WHERE deleted_at IS NULL
    `;
    const params: (string | number)[] = [];

    if (bucket) {
      query += " AND bucket = ?";
      params.push(bucket);
    }

    query += " ORDER BY heat DESC";

    const rows = this.db.getAllSync<Record<string, unknown>>(query, params);
    return rows.map(this.rowToTaskDTO);
  }

  getTask(id: number): TaskDTO | null {
    const row = this.db.getFirstSync<Record<string, unknown>>(
      "SELECT * FROM tasks WHERE id = ?",
      [id]
    );
    return row ? this.rowToTaskDTO(row) : null;
  }

  upsertTask(task: TaskDTO): void {
    const now = new Date().toISOString();
    this.db.runSync(
      `INSERT OR REPLACE INTO tasks (
        id, title, project_id, user_id, priority, bucket, star_level,
        star_intent_version, due_at, repeat_type, repeat_rule, heat,
        heat_calculated_at, heat_adjustment, last_heat_touched_at,
        last_touched_at, touch_count, importance_v1, completed_at,
        archived_at, deleted_at, is_focused, focus_snooze_until,
        created_at, updated_at, sync_status, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)`,
      [
        task.id,
        task.title,
        task.projectId,
        task.userId,
        task.priority,
        task.bucket,
        task.starLevel,
        task.starIntentVersion,
        task.dueAt,
        task.repeatType,
        task.repeatRule ?? null,
        task.heat,
        task.heatCalculatedAt,
        task.heatAdjustment,
        task.lastHeatTouchedAt,
        task.lastTouchedAt,
        task.touchCount,
        task.importanceV1,
        task.completedAt,
        task.archivedAt,
        task.deletedAt,
        task.isFocused ? 1 : 0,
        task.focusSnoozeUntil,
        task.createdAt,
        task.updatedAt,
        now,
      ]
    );
  }

  deleteTask(id: number): void {
    this.db.runSync("DELETE FROM tasks WHERE id = ?", [id]);
  }

  private rowToTaskDTO(row: Record<string, unknown>): TaskDTO {
    return {
      id: row.id as number,
      title: row.title as string,
      projectId: row.project_id as number | null,
      userId: row.user_id as string | null,
      priority: row.priority as "low" | "medium" | "high" | "top",
      bucket: row.bucket as "todo" | "watch" | "later",
      starLevel: row.star_level as 0 | 1 | 2 | 3,
      starIntentVersion: row.star_intent_version as number,
      dueAt: row.due_at as string | null,
      repeatType: row.repeat_type as string,
      repeatRule: row.repeat_rule as string | null,
      heat: row.heat as number,
      heatCalculatedAt: row.heat_calculated_at as string | null,
      heatAdjustment: row.heat_adjustment as number,
      lastHeatTouchedAt: row.last_heat_touched_at as string | null,
      lastTouchedAt: row.last_touched_at as string | null,
      touchCount: row.touch_count as number,
      importanceV1: row.importance_v1 as number,
      completedAt: row.completed_at as string | null,
      archivedAt: row.archived_at as string | null,
      deletedAt: row.deleted_at as string | null,
      isFocused: (row.is_focused as number) === 1,
      focusSnoozeUntil: row.focus_snooze_until as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // ============================================================================
  // Projects
  // ============================================================================

  getProjects(): ProjectDTO[] {
    const rows = this.db.getAllSync<Record<string, unknown>>(
      "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order ASC"
    );
    return rows.map(this.rowToProjectDTO);
  }

  upsertProject(project: ProjectDTO): void {
    const now = new Date().toISOString();
    this.db.runSync(
      `INSERT OR REPLACE INTO projects (
        id, name, color_hex, sort_order, archived, user_id,
        created_at, updated_at, deleted_at, sync_status, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)`,
      [
        project.id,
        project.name,
        project.colorHex,
        project.sortOrder,
        project.archived ? 1 : 0,
        project.userId,
        project.createdAt,
        project.updatedAt,
        project.deletedAt ?? null,
        now,
      ]
    );
  }

  deleteProject(id: number): void {
    this.db.runSync("DELETE FROM projects WHERE id = ?", [id]);
  }

  private rowToProjectDTO(row: Record<string, unknown>): ProjectDTO {
    return {
      id: row.id as number,
      name: row.name as string,
      colorHex: row.color_hex as string,
      sortOrder: row.sort_order as number,
      archived: (row.archived as number) === 1,
      userId: row.user_id as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      deletedAt: row.deleted_at as string | null,
    };
  }

  // ============================================================================
  // Notes
  // ============================================================================

  getNotesForTask(taskId: number): NoteRowDTO[] {
    const rows = this.db.getAllSync<Record<string, unknown>>(
      "SELECT * FROM notes WHERE task_id = ? ORDER BY ordinal ASC",
      [taskId]
    );
    return rows.map(this.rowToNoteDTO);
  }

  upsertNote(note: NoteRowDTO): void {
    this.db.runSync(
      `INSERT OR REPLACE INTO notes (
        id, task_id, ordinal, current_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.taskId,
        note.ordinal,
        note.currentText,
        note.createdAt,
        note.updatedAt,
      ]
    );
  }

  private rowToNoteDTO(row: Record<string, unknown>): NoteRowDTO {
    return {
      id: row.id as number,
      taskId: row.task_id as number,
      ordinal: row.ordinal as number,
      currentText: row.current_text as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  // ============================================================================
  // Settings
  // ============================================================================

  getSettings(): SettingsDTO | null {
    const row = this.db.getFirstSync<Record<string, unknown>>(
      "SELECT * FROM settings WHERE id = 1"
    );
    return row ? this.rowToSettingsDTO(row) : null;
  }

  upsertSettings(settings: SettingsDTO): void {
    this.db.runSync(
      `INSERT OR REPLACE INTO settings (
        id, user_id, default_priority, default_bucket, default_due_date,
        grouping_mode, sort_mode, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settings.userId,
        settings.defaultPriority,
        settings.defaultBucket,
        settings.defaultDueDate,
        settings.groupingMode,
        settings.sortMode,
        settings.updatedAt,
      ]
    );
  }

  private rowToSettingsDTO(row: Record<string, unknown>): SettingsDTO {
    return {
      id: row.id as number,
      userId: row.user_id as string | null,
      defaultPriority: row.default_priority as "low" | "medium" | "high" | "top",
      defaultBucket: row.default_bucket as "todo" | "watch" | "later",
      defaultDueDate: row.default_due_date as "none" | "today" | "tomorrow" | "next_week",
      heatDecayHalfLifeTodo: 48,
      heatDecayHalfLifeWatch: 168,
      heatDecayHalfLifeLater: 720,
      activityNormalizationConstant: 20,
      newTaskHeatBoost: 0.7,
      newTaskHeatHalfLife: 24,
      escalationThreshold: 0.75,
      deEscalationThresholdTodoWatch: 0.25,
      deEscalationThresholdWatchLater: 0.15,
      retirementThreshold: 0.05,
      retirementDays: 90,
      reviewCadenceWatch: 7,
      reviewCadenceLater: 30,
      groupingMode: row.grouping_mode as "ungrouped" | "importance" | "heat",
      sortMode: row.sort_mode as "importance" | "heat",
      updatedAt: row.updated_at as string,
    };
  }

  // ============================================================================
  // Client/Server ID Mapping
  // ============================================================================

  mapClientToServerId(clientId: string, serverId: number): void {
    // Update any tasks with this client ID to use the server ID
    this.db.runSync(
      "UPDATE tasks SET id = ? WHERE id = ?",
      [serverId, parseInt(clientId, 10)]
    );
  }

  // ============================================================================
  // Generic upsert for sync
  // ============================================================================

  upsertFromServer(entity: unknown): void {
    // Type guard - determine entity type and call appropriate method
    const entityObj = entity as Record<string, unknown>;
    if ("title" in entityObj && "bucket" in entityObj) {
      this.upsertTask(entityObj as unknown as TaskDTO);
    } else if ("colorHex" in entityObj) {
      this.upsertProject(entityObj as unknown as ProjectDTO);
    } else if ("taskId" in entityObj && "ordinal" in entityObj) {
      this.upsertNote(entityObj as unknown as NoteRowDTO);
    } else if ("defaultPriority" in entityObj) {
      this.upsertSettings(entityObj as unknown as SettingsDTO);
    }
  }

  // ============================================================================
  // Pending Tasks (for offline-first mutations)
  // ============================================================================

  /**
   * Get tasks with pending sync status
   */
  getPendingTasks(): TaskDTO[] {
    const rows = this.db.getAllSync<Record<string, unknown>>(
      "SELECT * FROM tasks WHERE sync_status = 'pending' ORDER BY local_updated_at ASC"
    );
    return rows.map(this.rowToTaskDTO);
  }

  /**
   * Get count of pending tasks
   */
  getPendingTaskCount(): number {
    const result = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE sync_status = 'pending'"
    );
    return result?.count ?? 0;
  }

  /**
   * Mark a task as synced (after successful push)
   */
  markTaskSynced(taskId: number): void {
    const now = new Date().toISOString();
    this.db.runSync(
      "UPDATE tasks SET sync_status = 'synced', local_updated_at = ? WHERE id = ?",
      [now, taskId]
    );
  }

  /**
   * Mark a task as having a sync conflict
   */
  markTaskConflict(taskId: number): void {
    const now = new Date().toISOString();
    this.db.runSync(
      "UPDATE tasks SET sync_status = 'conflict', local_updated_at = ? WHERE id = ?",
      [now, taskId]
    );
  }

  /**
   * Get tasks with conflicts for resolution
   */
  getConflictTasks(): TaskDTO[] {
    const rows = this.db.getAllSync<Record<string, unknown>>(
      "SELECT * FROM tasks WHERE sync_status = 'conflict' ORDER BY local_updated_at ASC"
    );
    return rows.map(this.rowToTaskDTO);
  }

  /**
   * Get a task's sync status
   */
  getTaskSyncStatus(taskId: number): "synced" | "pending" | "conflict" | null {
    const result = this.db.getFirstSync<{ sync_status: string }>(
      "SELECT sync_status FROM tasks WHERE id = ?",
      [taskId]
    );
    return result?.sync_status as "synced" | "pending" | "conflict" | null;
  }

  /**
   * Get all local-only tasks (negative IDs, not yet synced to server)
   */
  getLocalOnlyTasks(): TaskDTO[] {
    const rows = this.db.getAllSync<Record<string, unknown>>(
      "SELECT * FROM tasks WHERE id < 0 ORDER BY created_at ASC"
    );
    return rows.map(this.rowToTaskDTO);
  }

  /**
   * Replace a local task ID with a server-assigned ID after create sync
   * Also updates any references (though tasks don't have FK references)
   */
  replaceLocalTaskId(localId: number, serverId: number): void {
    this.db.runSync(
      "UPDATE tasks SET id = ?, sync_status = 'synced' WHERE id = ?",
      [serverId, localId]
    );
  }

  /**
   * Get completed tasks for a bucket
   */
  getCompletedTasks(bucket?: string): TaskDTO[] {
    let query = `
      SELECT * FROM tasks
      WHERE completed_at IS NOT NULL AND deleted_at IS NULL
    `;
    const params: (string | number)[] = [];

    if (bucket) {
      query += " AND bucket = ?";
      params.push(bucket);
    }

    query += " ORDER BY completed_at DESC";

    const rows = this.db.getAllSync<Record<string, unknown>>(query, params);
    return rows.map(this.rowToTaskDTO);
  }

  /**
   * Get tasks by project
   */
  getTasksByProject(projectId: number | null): TaskDTO[] {
    const query = projectId === null
      ? "SELECT * FROM tasks WHERE project_id IS NULL AND deleted_at IS NULL ORDER BY heat DESC"
      : "SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL ORDER BY heat DESC";

    const params = projectId === null ? [] : [projectId];
    const rows = this.db.getAllSync<Record<string, unknown>>(query, params);
    return rows.map(this.rowToTaskDTO);
  }

  /**
   * Clear all local data (for logout/reset)
   */
  clearAllData(): void {
    this.db.runSync("DELETE FROM tasks");
    this.db.runSync("DELETE FROM projects");
    this.db.runSync("DELETE FROM notes");
    this.db.runSync("DELETE FROM settings");
    this.db.runSync("DELETE FROM outbox");
    this.db.runSync("UPDATE sync_state SET pull_cursor = '', last_pull_at = NULL, last_push_at = NULL WHERE id = 1");
  }

  /**
   * Get database statistics for debugging
   */
  getStats(): {
    taskCount: number;
    pendingTaskCount: number;
    conflictTaskCount: number;
    localOnlyTaskCount: number;
    projectCount: number;
    noteCount: number;
  } {
    const taskCount = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL"
    )?.count ?? 0;

    const pendingTaskCount = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE sync_status = 'pending'"
    )?.count ?? 0;

    const conflictTaskCount = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE sync_status = 'conflict'"
    )?.count ?? 0;

    const localOnlyTaskCount = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE id < 0"
    )?.count ?? 0;

    const projectCount = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM projects WHERE deleted_at IS NULL"
    )?.count ?? 0;

    const noteCount = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM notes"
    )?.count ?? 0;

    return {
      taskCount,
      pendingTaskCount,
      conflictTaskCount,
      localOnlyTaskCount,
      projectCount,
      noteCount,
    };
  }
}
