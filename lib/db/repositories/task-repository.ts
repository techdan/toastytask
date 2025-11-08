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

  // Helper: days in month
  const daysInMonth = (year: number, monthIndex: number) => {
    return new Date(year, monthIndex + 1, 0).getDate();
  };

  switch (repeatType) {
    case RepeatType.DAILY: {
      const next = new Date(baseDate);
      next.setDate(next.getDate() + 1);
      return next;
    }
    case RepeatType.WEEKLY: {
      const next = new Date(baseDate);
      next.setDate(next.getDate() + 7);
      return next;
    }
    case RepeatType.MONTHLY: {
      // Smarter monthly advance:
      // - Keep the same day-of-month as the original due date when possible
      // - If completing late, advance to the next occurrence that is not in the past
      // - If target month has fewer days, clamp to last day of that month
      const anchor = baseDate.getDate();

      // Reference point: the later of current due date or now
      const ref = now > baseDate ? now : baseDate;

      let year = ref.getFullYear();
      let month = ref.getMonth();

      // If the reference day has already passed (>= anchor), move to next month
      if (ref.getDate() >= anchor) {
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }

      const dim = daysInMonth(year, month);
      const day = Math.min(anchor, dim);

      const next = new Date(baseDate);
      next.setFullYear(year);
      next.setMonth(month);
      next.setDate(day);
      return next;
    }
    default:
      // If no repeat type or "none", return the current date (no change)
      return baseDate;
  }
}

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

  async updateHeat(id: number, heat: number, userId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(tasks)
      .set({ heat, heatCalculatedAt: now, updatedAt: now })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }

  async recalculateAllHeat(userId: string): Promise<void> {
    // This will be implemented in Phase 3 when we build the heat calculation engine
    // For now, this is a placeholder
    console.log(`recalculateAllHeat not yet implemented for user ${userId}`);
  }
}
