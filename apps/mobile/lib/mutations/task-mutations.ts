import { v4 as uuid } from "uuid";
import type { SQLiteDatabase } from "expo-sqlite";
import type {
  TaskDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
} from "@toasty/contracts";
import { LocalDatabase } from "../storage/database";
import { OutboxQueue } from "../sync/outbox";
import { calculateHeat, calculateImportanceV1 } from "@toasty/domain";

/**
 * Task mutations for offline-first operations.
 * All mutations:
 * 1. Write to SQLite immediately (optimistic)
 * 2. Queue operations in Outbox for sync
 * 3. Generate client IDs for new entities
 */

export interface TaskMutationsConfig {
  database: LocalDatabase;
  outbox: OutboxQueue;
  userId: string;
}

export class TaskMutations {
  constructor(private config: TaskMutationsConfig) {}

  /**
   * Create a new task locally and queue for sync
   * Returns the new task with a client-generated ID
   */
  createTask(data: CreateTaskDTO): TaskDTO {
    const now = new Date().toISOString();
    const clientId = uuid();
    // Use negative IDs for local-only tasks to avoid conflicts with server IDs
    const localId = -Math.floor(Math.random() * 1000000000);

    const priority = data.priority ?? "medium";
    const bucket = data.bucket ?? "todo";
    const starLevel = data.starLevel ?? 0;
    const dueAt = data.dueAt ?? null;

    // Calculate initial importance
    const initialImportance = calculateImportanceV1(
      { priority, dueAt, starLevel },
      new Date()
    );

    // Calculate initial heat (new tasks get a boost)
    const initialHeat = calculateHeat(
      {
        heatAdjustment: 0,
        lastTouchedAt: now,
        lastHeatTouchedAt: null,
        importanceV1: initialImportance,
        isFocused: data.isFocused ?? false,
        focusSnoozeUntil: null,
      },
      new Date(),
      initialImportance
    );

    const task: TaskDTO = {
      id: localId,
      title: data.title,
      projectId: data.projectId ?? null,
      userId: this.config.userId,
      priority,
      bucket,
      starLevel,
      starIntentVersion: 0,
      dueAt,
      repeatType: data.repeatType ?? "none",
      repeatRule: data.repeatRule ?? null,
      heat: initialHeat,
      heatCalculatedAt: now,
      heatAdjustment: 0,
      lastHeatTouchedAt: null,
      lastTouchedAt: now,
      touchCount: 1,
      importanceV1: initialImportance,
      completedAt: null,
      archivedAt: null,
      deletedAt: null,
      isFocused: data.isFocused ?? false,
      focusSnoozeUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    // Write to local database with pending sync status
    this.insertLocalTask(task, "pending");

    // Queue create operation for sync
    this.config.outbox.enqueue({
      method: "POST",
      path: "/api/tasks",
      body: {
        ...data,
        clientId,
      },
      clientId: String(localId),
    });

    return task;
  }

  /**
   * Update an existing task locally and queue for sync
   */
  updateTask(taskId: number, data: UpdateTaskDTO): TaskDTO | null {
    const existingTask = this.config.database.getTask(taskId);
    if (!existingTask) {
      return null;
    }

    const now = new Date().toISOString();

    // Merge updates
    const updatedTask: TaskDTO = {
      ...existingTask,
      title: data.title ?? existingTask.title,
      projectId: data.projectId !== undefined ? data.projectId : existingTask.projectId,
      priority: data.priority ?? existingTask.priority,
      bucket: data.bucket ?? existingTask.bucket,
      starLevel: data.starLevel ?? existingTask.starLevel,
      dueAt: data.dueAt !== undefined ? data.dueAt : existingTask.dueAt,
      repeatType: data.repeatType ?? existingTask.repeatType,
      repeatRule: data.repeatRule !== undefined ? data.repeatRule : existingTask.repeatRule,
      heatAdjustment: data.heatAdjustment ?? existingTask.heatAdjustment,
      isFocused: data.isFocused ?? existingTask.isFocused,
      focusSnoozeUntil: data.focusSnoozeUntil !== undefined ? data.focusSnoozeUntil : existingTask.focusSnoozeUntil,
      updatedAt: now,
      lastTouchedAt: now,
      touchCount: existingTask.touchCount + 1,
    };

    // Recalculate importance if relevant fields changed
    if (data.priority !== undefined || data.dueAt !== undefined || data.starLevel !== undefined) {
      updatedTask.importanceV1 = calculateImportanceV1(
        {
          priority: updatedTask.priority,
          dueAt: updatedTask.dueAt,
          starLevel: updatedTask.starLevel,
        },
        new Date()
      );
    }

    // Update local database
    this.config.database.upsertTask(updatedTask);
    this.markTaskPending(taskId);

    // Queue update operation for sync (only for server-side tasks)
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "PATCH",
        path: `/api/tasks/${taskId}`,
        body: data,
      });
    }

    return updatedTask;
  }

  /**
   * Delete a task locally (soft delete) and queue for sync
   */
  deleteTask(taskId: number): boolean {
    const existingTask = this.config.database.getTask(taskId);
    if (!existingTask) {
      return false;
    }

    const now = new Date().toISOString();

    // Soft delete locally
    const deletedTask: TaskDTO = {
      ...existingTask,
      deletedAt: now,
      updatedAt: now,
    };

    this.config.database.upsertTask(deletedTask);
    this.markTaskPending(taskId);

    // Queue delete operation for sync (only for server-side tasks)
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "DELETE",
        path: `/api/tasks/${taskId}`,
      });
    } else {
      // Local-only task - just hard delete it
      this.config.database.deleteTask(taskId);
    }

    return true;
  }

  /**
   * Complete a task locally and queue for sync
   */
  completeTask(taskId: number): TaskDTO | null {
    const existingTask = this.config.database.getTask(taskId);
    if (!existingTask) {
      return null;
    }

    const now = new Date().toISOString();

    const completedTask: TaskDTO = {
      ...existingTask,
      completedAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      touchCount: existingTask.touchCount + 1,
    };

    this.config.database.upsertTask(completedTask);
    this.markTaskPending(taskId);

    // Queue complete operation for sync
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "POST",
        path: `/api/tasks/${taskId}/complete`,
      });
    }

    return completedTask;
  }

  /**
   * Uncomplete a task locally and queue for sync
   */
  uncompleteTask(taskId: number): TaskDTO | null {
    const existingTask = this.config.database.getTask(taskId);
    if (!existingTask) {
      return null;
    }

    const now = new Date().toISOString();

    const uncompletedTask: TaskDTO = {
      ...existingTask,
      completedAt: null,
      updatedAt: now,
      lastTouchedAt: now,
      touchCount: existingTask.touchCount + 1,
    };

    this.config.database.upsertTask(uncompletedTask);
    this.markTaskPending(taskId);

    // Queue uncomplete operation for sync
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "DELETE",
        path: `/api/tasks/${taskId}/complete`,
      });
    }

    return uncompletedTask;
  }

  /**
   * Heat a task (increase priority/visibility) with context-aware positioning
   */
  heatTask(
    taskId: number,
    visibleTasks?: Array<{ id: number; heat: number }>
  ): TaskDTO | null {
    const existingTask = this.config.database.getTask(taskId);
    if (!existingTask) {
      return null;
    }

    const now = new Date().toISOString();

    // Calculate heat boost based on visible tasks context
    let newHeatAdjustment = existingTask.heatAdjustment;

    if (visibleTasks && visibleTasks.length > 1) {
      // Find current position and target position (one above)
      const sortedTasks = [...visibleTasks].sort((a, b) => b.heat - a.heat);
      const currentIndex = sortedTasks.findIndex((t) => t.id === taskId);

      if (currentIndex > 0) {
        // Target is the task above
        const targetTask = sortedTasks[currentIndex - 1];
        const currentTask = sortedTasks[currentIndex];
        const heatDiff = targetTask.heat - currentTask.heat;

        // Boost adjustment to surpass the task above
        newHeatAdjustment = existingTask.heatAdjustment + heatDiff + 0.1;
      } else {
        // Already at top, small boost
        newHeatAdjustment = existingTask.heatAdjustment + 1;
      }
    } else {
      // No context, standard boost
      newHeatAdjustment = existingTask.heatAdjustment + 5;
    }

    // Clamp heat adjustment to prevent extreme values
    newHeatAdjustment = Math.min(Math.max(newHeatAdjustment, -100), 100);

    const heatedTask: TaskDTO = {
      ...existingTask,
      heatAdjustment: newHeatAdjustment,
      lastHeatTouchedAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      touchCount: existingTask.touchCount + 1,
    };

    // Recalculate heat
    heatedTask.heat = calculateHeat(
      {
        heatAdjustment: heatedTask.heatAdjustment,
        lastTouchedAt: heatedTask.lastTouchedAt,
        lastHeatTouchedAt: heatedTask.lastHeatTouchedAt,
        importanceV1: heatedTask.importanceV1,
        isFocused: heatedTask.isFocused,
        focusSnoozeUntil: heatedTask.focusSnoozeUntil,
      },
      new Date(),
      heatedTask.importanceV1
    );
    heatedTask.heatCalculatedAt = now;

    this.config.database.upsertTask(heatedTask);
    this.markTaskPending(taskId);

    // Queue heat operation for sync
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "POST",
        path: `/api/tasks/${taskId}/heat`,
        body: { visibleTasks },
      });
    }

    return heatedTask;
  }

  /**
   * Cool a task (decrease priority/visibility) with context-aware positioning
   */
  coolTask(
    taskId: number,
    visibleTasks?: Array<{ id: number; heat: number }>
  ): TaskDTO | null {
    const existingTask = this.config.database.getTask(taskId);
    if (!existingTask) {
      return null;
    }

    const now = new Date().toISOString();

    // Calculate heat drop based on visible tasks context
    let newHeatAdjustment = existingTask.heatAdjustment;

    if (visibleTasks && visibleTasks.length > 1) {
      // Find current position and target position (one below)
      const sortedTasks = [...visibleTasks].sort((a, b) => b.heat - a.heat);
      const currentIndex = sortedTasks.findIndex((t) => t.id === taskId);

      if (currentIndex < sortedTasks.length - 1) {
        // Target is the task below
        const targetTask = sortedTasks[currentIndex + 1];
        const currentTask = sortedTasks[currentIndex];
        const heatDiff = currentTask.heat - targetTask.heat;

        // Drop adjustment to go below the task below
        newHeatAdjustment = existingTask.heatAdjustment - heatDiff - 0.1;
      } else {
        // Already at bottom, small drop
        newHeatAdjustment = existingTask.heatAdjustment - 1;
      }
    } else {
      // No context, standard drop
      newHeatAdjustment = existingTask.heatAdjustment - 5;
    }

    // Clamp heat adjustment to prevent extreme values
    newHeatAdjustment = Math.min(Math.max(newHeatAdjustment, -100), 100);

    const cooledTask: TaskDTO = {
      ...existingTask,
      heatAdjustment: newHeatAdjustment,
      lastHeatTouchedAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      touchCount: existingTask.touchCount + 1,
    };

    // Recalculate heat
    cooledTask.heat = calculateHeat(
      {
        heatAdjustment: cooledTask.heatAdjustment,
        lastTouchedAt: cooledTask.lastTouchedAt,
        lastHeatTouchedAt: cooledTask.lastHeatTouchedAt,
        importanceV1: cooledTask.importanceV1,
        isFocused: cooledTask.isFocused,
        focusSnoozeUntil: cooledTask.focusSnoozeUntil,
      },
      new Date(),
      cooledTask.importanceV1
    );
    cooledTask.heatCalculatedAt = now;

    this.config.database.upsertTask(cooledTask);
    this.markTaskPending(taskId);

    // Queue cool operation for sync
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "POST",
        path: `/api/tasks/${taskId}/cool`,
        body: { visibleTasks },
      });
    }

    return cooledTask;
  }

  /**
   * Cycle star level (0 -> 1 -> 2 -> 3 -> 0)
   */
  cycleStarTask(taskId: number): TaskDTO | null {
    const existingTask = this.config.database.getTask(taskId);
    if (!existingTask) {
      return null;
    }

    const now = new Date().toISOString();

    // Cycle through star levels: 0 -> 1 -> 2 -> 3 -> 0
    const nextStarLevel = ((existingTask.starLevel + 1) % 4) as 0 | 1 | 2 | 3;

    const starredTask: TaskDTO = {
      ...existingTask,
      starLevel: nextStarLevel,
      starIntentVersion: existingTask.starIntentVersion + 1,
      updatedAt: now,
      lastTouchedAt: now,
      touchCount: existingTask.touchCount + 1,
    };

    // Recalculate importance (star level affects importance)
    starredTask.importanceV1 = calculateImportanceV1(
      {
        priority: starredTask.priority,
        dueAt: starredTask.dueAt,
        starLevel: starredTask.starLevel,
      },
      new Date()
    );

    // Recalculate heat
    starredTask.heat = calculateHeat(
      {
        heatAdjustment: starredTask.heatAdjustment,
        lastTouchedAt: starredTask.lastTouchedAt,
        lastHeatTouchedAt: starredTask.lastHeatTouchedAt,
        importanceV1: starredTask.importanceV1,
        isFocused: starredTask.isFocused,
        focusSnoozeUntil: starredTask.focusSnoozeUntil,
      },
      new Date(),
      starredTask.importanceV1
    );
    starredTask.heatCalculatedAt = now;

    this.config.database.upsertTask(starredTask);
    this.markTaskPending(taskId);

    // Queue star operation for sync
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "POST",
        path: `/api/tasks/${taskId}/star`,
      });
    }

    return starredTask;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private insertLocalTask(task: TaskDTO, syncStatus: string): void {
    const db = this.config.database["db"] as SQLiteDatabase;
    const now = new Date().toISOString();

    db.runSync(
      `INSERT OR REPLACE INTO tasks (
        id, title, project_id, user_id, priority, bucket, star_level,
        star_intent_version, due_at, repeat_type, repeat_rule, heat,
        heat_calculated_at, heat_adjustment, last_heat_touched_at,
        last_touched_at, touch_count, importance_v1, completed_at,
        archived_at, deleted_at, is_focused, focus_snooze_until,
        created_at, updated_at, sync_status, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        syncStatus,
        now,
      ]
    );
  }

  private markTaskPending(taskId: number): void {
    const db = this.config.database["db"] as SQLiteDatabase;
    const now = new Date().toISOString();

    db.runSync(
      "UPDATE tasks SET sync_status = 'pending', local_updated_at = ? WHERE id = ?",
      [now, taskId]
    );
  }
}
