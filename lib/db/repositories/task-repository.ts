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

  async create(task: NewTask): Promise<Task> {
    const [newTask] = await this.db
      .insert(tasks)
      .values({
        ...task,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newTask;
  }

  async createMany(taskList: NewTask[]): Promise<Task[]> {
    const now = new Date();
    const newTasks = await this.db
      .insert(tasks)
      .values(
        taskList.map((task) => ({
          ...task,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .returning();
    return newTasks;
  }

  async findById(id: number): Promise<Task | undefined> {
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return task;
  }

  async findAll(options: TaskQueryOptions = {}): Promise<Task[]> {
    const {
      includeCompleted = false,
      includeArchived = false,
      includeDeleted = false,
      sortBy = "heat",
      sortOrder = "desc",
      limit,
      offset,
    } = options;

    // Build WHERE conditions
    const conditions = [];

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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByFn(orderByColumn));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    if (offset) {
      query = query.offset(offset) as typeof query;
    }

    return query;
  }

  async findByBucket(bucket: Bucket): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.bucket, bucket),
          isNull(tasks.completedAt),
          isNull(tasks.archivedAt),
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.heat));
  }

  async findByProject(projectId: number): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          isNull(tasks.completedAt),
          isNull(tasks.archivedAt),
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.heat));
  }

  async findCompleted(): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(sql`${tasks.completedAt} IS NOT NULL`, isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.completedAt));
  }

  async findArchived(): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(sql`${tasks.archivedAt} IS NOT NULL`, isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.archivedAt));
  }

  async update(id: number, updates: Partial<NewTask>): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async updateMany(ids: number[], updates: Partial<NewTask>): Promise<void> {
    await this.db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(inArray(tasks.id, ids));
  }

  async softDelete(id: number): Promise<void> {
    await this.db
      .update(tasks)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));
  }

  async softDeleteMany(ids: number[]): Promise<void> {
    const now = new Date();
    await this.db
      .update(tasks)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(inArray(tasks.id, ids));
  }

  async touch(id: number): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        touchCount: sql`${tasks.touchCount} + 1`,
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async snooze(id: number, untilDate: Date): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        nextSurfaceAt: untilDate,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async complete(id: number): Promise<Task> {
    // First, fetch the task to check if it's recurring
    const task = await this.findById(id);
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
        .where(eq(tasks.id, id))
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
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async uncomplete(id: number): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async archive(id: number): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async unarchive(id: number): Promise<Task> {
    const [updatedTask] = await this.db
      .update(tasks)
      .set({
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async moveToBucket(ids: number[], bucket: Bucket): Promise<void> {
    await this.db.update(tasks).set({ bucket, updatedAt: new Date() }).where(inArray(tasks.id, ids));
  }

  async updateHeat(id: number, heat: number): Promise<void> {
    await this.db.update(tasks).set({ heat, updatedAt: new Date() }).where(eq(tasks.id, id));
  }

  async recalculateAllHeat(): Promise<void> {
    // This will be implemented in Phase 3 when we build the heat calculation engine
    // For now, this is a placeholder
    console.log("recalculateAllHeat not yet implemented");
  }
}
