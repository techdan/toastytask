import type { Task, NewTask, Project, NewProject, Settings, NewSettings } from "@/lib/db/schema";
import type { Bucket } from "@/types";

// Task Repository Interface
export interface ITaskRepository {
  // Create
  create(task: NewTask, userId: string): Promise<Task>;
  createMany(tasks: NewTask[], userId: string): Promise<Task[]>;

  // Read
  findById(id: number, userId: string): Promise<Task | undefined>;
  findAll(userId: string, options?: TaskQueryOptions): Promise<Task[]>;
  findManyByIds(ids: number[], userId: string): Promise<Task[]>;
  findByBucket(bucket: Bucket, userId: string): Promise<Task[]>;
  findByProject(projectId: number, userId: string): Promise<Task[]>;
  findCompleted(userId: string): Promise<Task[]>;
  findArchived(userId: string): Promise<Task[]>;

  // Update
  update(id: number, updates: Partial<NewTask>, userId: string): Promise<Task>;
  updateMany(ids: number[], updates: Partial<NewTask>, userId: string): Promise<void>;

  // Delete (soft delete)
  softDelete(id: number, userId: string): Promise<void>;
  softDeleteMany(ids: number[], userId: string): Promise<void>;

  // Special operations
  touch(id: number, userId: string): Promise<Task>;
  snooze(id: number, untilDate: Date, userId: string): Promise<Task>;
  complete(id: number, userId: string): Promise<Task>;
  uncomplete(id: number, userId: string): Promise<Task>;
  archive(id: number, userId: string): Promise<Task>;
  unarchive(id: number, userId: string): Promise<Task>;

  // Bulk operations
  moveToBucket(ids: number[], bucket: Bucket, userId: string): Promise<void>;
  updateHeat(id: number, heat: number, userId: string): Promise<void>;
  recalculateAllHeat(userId: string): Promise<void>;
}

export interface TaskQueryOptions {
  includeCompleted?: boolean;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  // Note: "importance" removed - importance is calculated on-demand, not sorted in DB (pure calculation architecture)
  sortBy?: "heat" | "dueDate" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// Project Repository Interface
export interface IProjectRepository {
  // Create
  create(project: NewProject, userId: string): Promise<Project>;

  // Read
  findById(id: number, userId: string): Promise<Project | undefined>;
  findAll(userId: string, includeArchived?: boolean): Promise<Project[]>;

  // Update
  update(id: number, updates: Partial<NewProject>, userId: string): Promise<Project>;
  reorder(projectIds: number[], userId: string): Promise<void>;

  // Delete
  archive(id: number, userId: string): Promise<Project>;
  unarchive(id: number, userId: string): Promise<Project>;
  delete(id: number, userId: string): Promise<void>;
}

// Settings Repository Interface
export interface ISettingsRepository {
  // Get current settings (always returns a single row for the user)
  get(userId: string): Promise<Settings>;

  // Update settings
  update(updates: Partial<NewSettings>, userId: string): Promise<Settings>;

  // Reset to defaults
  reset(userId: string): Promise<Settings>;
}
