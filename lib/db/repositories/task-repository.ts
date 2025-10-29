import { eq, and, isNull, desc, asc, inArray, sql } from "drizzle-orm";
import type { ITaskRepository, TaskQueryOptions } from "./interfaces";
import type { Task, NewTask } from "@/lib/db/schema";
import type { Bucket } from "@/types";
import { RepeatType } from "@/types";
import { tasks } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

/**
 * Calculate the next due date for a recurring task
 */
function calculateNextDueDate(currentDueDate: Date | null, repeatType: string): Date {
  const now = new Date();
  const baseDate = currentDueDate || now;
  const nextDate = new Date(baseDate);

  switch (repeatType) {
    case RepeatType.DAILY:
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case RepeatType.WEEKLY:
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case RepeatType.MONTHLY:
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    default:
      // If no repeat type or "none", return the current date
      return baseDate;
  }

  return nextDate;
}

export class SQLiteTaskRepository implements ITaskRepository {
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
    const orderByColumn = {
      heat: tasks.heat,
      importance: tasks.importanceV1,
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

  /**
   * Increment other_touch_count for field edits (Heat v2)
   * This tracks user engagement with task fields (title, priority, due date, notes, etc.)
   * Does NOT apply decay - that only happens on heat icon clicks
   */
  async incrementOtherTouchCount(id: number, userId: string): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        otherTouchCount: sql`${tasks.otherTouchCount} + 1`,
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async snooze(id: number, untilDate: Date, userId: string): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        nextSurfaceAt: untilDate,
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

    // If the task is recurring (repeatType is not "none"), advance the due date instead of marking as completed
    if (task.repeatType && task.repeatType !== RepeatType.NONE) {
      const nextDueDate = calculateNextDueDate(task.dueAt, task.repeatType);
      const [updatedTask] = await this.db
        .update(tasks)
        .set({
          dueAt: nextDueDate,
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

  async updateHeat(id: number, heat: number, userId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ heat, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }

  async recalculateAllHeat(userId: string): Promise<void> {
    // This will be implemented in Phase 3 when we build the heat calculation engine
    // For now, this is a placeholder
    console.log(`recalculateAllHeat not yet implemented for user ${userId}`);
  }
}
