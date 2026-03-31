import { eq, and, isNull, desc, asc, inArray, sql } from "drizzle-orm";
import type { ITaskRepository, TaskQueryOptions } from "./interfaces";
import type { Task, NewTask } from "@/lib/db/schema";
import type { Bucket, RepeatType } from "@/types";
import { tasks } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";
import { calculateNextDueDate as registryCalculateNextDueDate, isRecurring, parseAndCalculate } from "@/lib/recurrence/registry";

export class TaskRepository implements ITaskRepository {
  private db = getDatabase();

  async create(task: NewTask, userId: string): Promise<Task> {
    const [newTask] = await this.db
      .insert(tasks)
      .values({
        ...task,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newTask;
  }

  async createMany(taskList: NewTask[], userId: string): Promise<Task[]> {
    const now = new Date();
    const newTasks = await this.db
      .insert(tasks)
      .values(
        taskList.map((task) => ({
          ...task,
          userId,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .returning();
    return newTasks;
  }

  async findById(id: number, userId: string): Promise<Task | undefined> {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);
    return task;
  }

  async findAll(userId: string, options: TaskQueryOptions = {}): Promise<Task[]> {
    const {
      includeCompleted = false,
      includeArchived = false,
      includeDeleted = false,
      sortBy = "heat",
      sortOrder = "desc",
      limit,
      offset,
    } = options;

    // Build WHERE conditions - ALWAYS filter by userId
    const conditions = [eq(tasks.userId, userId)];

    if (!includeCompleted) {
      conditions.push(isNull(tasks.completedAt));
    }

    if (!includeArchived) {
      conditions.push(isNull(tasks.archivedAt));
    }

    if (!includeDeleted) {
      conditions.push(isNull(tasks.deletedAt));
    }

    // Build ORDER BY
    // Note: Removed 'importance' sorting option (pure calculation architecture)
    // Importance is calculated on-demand and sorted in-memory, not in the database
    const orderByColumn = {
      heat: tasks.heat,
      dueDate: tasks.dueAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    }[sortBy];

    const orderByFn = sortOrder === "desc" ? desc : asc;

    let query = this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(orderByFn(orderByColumn));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    if (offset) {
      query = query.offset(offset) as typeof query;
    }

    return query;
  }

  async findManyByIds(ids: number[], userId: string): Promise<Task[]> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.id, uniqueIds), eq(tasks.userId, userId)));
  }

  async findByBucket(bucket: Bucket, userId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.bucket, bucket),
          isNull(tasks.completedAt),
          isNull(tasks.archivedAt),
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.heat));
  }

  async findByProject(projectId: number, userId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.projectId, projectId),
          isNull(tasks.completedAt),
          isNull(tasks.archivedAt),
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.heat));
  }

  async findCompleted(userId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          sql`${tasks.completedAt} IS NOT NULL`,
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.completedAt));
  }

  async findArchived(userId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          sql`${tasks.archivedAt} IS NOT NULL`,
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.archivedAt));
  }

  async update(id: number, updates: Partial<NewTask>, userId: string): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async updateMany(ids: number[], updates: Partial<NewTask>, userId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(inArray(tasks.id, ids), eq(tasks.userId, userId)));
  }

  async softDelete(id: number, userId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }

  async softDeleteMany(ids: number[], userId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(tasks)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(inArray(tasks.id, ids), eq(tasks.userId, userId)));
  }

  async touch(id: number, userId: string): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        touchCount: sql`${tasks.touchCount} + 1`,
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async complete(id: number, userId: string): Promise<Task> {
    // First, fetch the task to check if it's recurring
    const task = await this.findById(id, userId);
    if (!task) {
      throw new Error(`Task with id ${id} not found`);
    }

    // If the task is recurring, advance the due date instead of marking as completed
    if (task.repeatType && isRecurring(task.repeatType as RepeatType)) {
      if (!task.dueAt) {
        throw new Error(`Recurring task ${id} must have a due date`);
      }

      // Handle custom recurrence rules
      let nextDueDate: Date;
      if (task.repeatType === "custom") {
        if (!task.repeatRule) {
          throw new Error(`Custom recurring task ${id} must have a repeatRule`);
        }
        nextDueDate = parseAndCalculate(task.dueAt, task.repeatRule);
      } else {
        // Use built-in recurrence pattern
        nextDueDate = registryCalculateNextDueDate(task.repeatType as RepeatType, task.dueAt);
      }

      const [updatedTask] = await this.db
        .update(tasks)
        .set({
          dueAt: nextDueDate,
          lastTouchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .returning();
      return updatedTask;
    }

    // Otherwise, mark the task as completed normally
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        completedAt: new Date(),
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async uncomplete(id: number, userId: string): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        completedAt: null,
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async archive(id: number, userId: string): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async unarchive(id: number, userId: string): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async moveToBucket(ids: number[], bucket: Bucket, userId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ bucket, updatedAt: new Date() })
      .where(and(inArray(tasks.id, ids), eq(tasks.userId, userId)));
  }

  /**
   * Updates the cached heat value for a task in the database.
   *
   * HYBRID PATTERN: This method caches calculated heat in the database for performance.
   * The cached value is used for database-level sorting (ORDER BY heat) to enable efficient
   * queries on large task lists (1000+ tasks). The client will recalculate fresh heat values
   * on every render for accurate display.
   *
   * Data Flow:
   * 1. Server calculates fresh heat during mutations
   * 2. This method writes calculated heat to database
   * 3. Database uses cached heat for ORDER BY operations with index support
   * 4. Client fetches tasks with cached heat values
   * 5. Client immediately recalculates _freshHeat for display
   *
   * Tradeoff: Cached values become stale between mutations, but this is acceptable because:
   * - Enables fast database-level sorting without calculating all tasks
   * - Client recalculates fresh values ensuring accurate display
   * - Staleness is minimal (only occurs between user actions)
   *
   * @param id - Task ID
   * @param heat - Calculated heat value to cache (0-145)
   * @param userId - User ID for authorization
   */
  async updateHeat(id: number, heat: number, userId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(tasks)
      // Refresh cached heat metadata without changing the user-visible modified timestamp.
      .set({ heat, heatCalculatedAt: now })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }
}
