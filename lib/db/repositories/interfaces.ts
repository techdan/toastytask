import type { Task, NewTask, Project, NewProject, Settings, NewSettings } from "@/lib/db/schema";
import type { Bucket, Priority } from "@/types";

// Task Repository Interface
export interface ITaskRepository {
  // Create
  create(task: NewTask): Promise<Task>;
  createMany(tasks: NewTask[]): Promise<Task[]>;

  // Read
  findById(id: number): Promise<Task | undefined>;
  findAll(options?: TaskQueryOptions): Promise<Task[]>;
  findByBucket(bucket: Bucket): Promise<Task[]>;
  findByProject(projectId: number): Promise<Task[]>;
  findCompleted(): Promise<Task[]>;
  findArchived(): Promise<Task[]>;

  // Update
  update(id: number, updates: Partial<NewTask>): Promise<Task>;
  updateMany(ids: number[], updates: Partial<NewTask>): Promise<void>;

  // Delete (soft delete)
  softDelete(id: number): Promise<void>;
  softDeleteMany(ids: number[]): Promise<void>;

  // Special operations
  touch(id: number): Promise<Task>;
  snooze(id: number, untilDate: Date): Promise<Task>;
  complete(id: number): Promise<Task>;
  uncomplete(id: number): Promise<Task>;
  archive(id: number): Promise<Task>;
  unarchive(id: number): Promise<Task>;

  // Bulk operations
  moveToBucket(ids: number[], bucket: Bucket): Promise<void>;
  updateHeat(id: number, heat: number): Promise<void>;
  recalculateAllHeat(): Promise<void>;
}

export interface TaskQueryOptions {
  includeCompleted?: boolean;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  sortBy?: "heat" | "importance" | "dueDate" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// Project Repository Interface
export interface IProjectRepository {
  // Create
  create(project: NewProject): Promise<Project>;

  // Read
  findById(id: number): Promise<Project | undefined>;
  findAll(includeArchived?: boolean): Promise<Project[]>;

  // Update
  update(id: number, updates: Partial<NewProject>): Promise<Project>;

  // Delete
  archive(id: number): Promise<Project>;
  unarchive(id: number): Promise<Project>;
  delete(id: number): Promise<void>;
}

// Settings Repository Interface
export interface ISettingsRepository {
  // Get current settings (always returns a single row)
  get(): Promise<Settings>;

  // Update settings
  update(updates: Partial<NewSettings>): Promise<Settings>;

  // Reset to defaults
  reset(): Promise<Settings>;
}
