import { v4 as uuid } from "uuid";
import type { ProjectDTO, CreateProjectDTO, UpdateProjectDTO } from "@toasty/contracts";
import { LocalDatabase } from "../storage/database";
import { OutboxQueue } from "../sync/outbox";

/**
 * Project mutations for offline-first operations.
 * All mutations:
 * 1. Write to SQLite immediately (optimistic)
 * 2. Queue operations in Outbox for sync
 */

export interface ProjectMutationsConfig {
  database: LocalDatabase;
  outbox: OutboxQueue;
  userId: string;
}

export class ProjectMutations {
  constructor(private config: ProjectMutationsConfig) {}

  /**
   * Create a new project locally and queue for sync
   */
  createProject(data: CreateProjectDTO): ProjectDTO {
    const now = new Date().toISOString();
    const clientId = uuid();
    const localId = -Math.floor(Math.random() * 1000000000);

    const existingProjects = this.config.database.getProjects();
    const maxSortOrder = existingProjects.reduce(
      (max, p) => Math.max(max, p.sortOrder),
      -1
    );

    const project: ProjectDTO = {
      id: localId,
      name: data.name,
      colorHex: data.colorHex ?? "#6b7280",
      sortOrder: data.sortOrder ?? maxSortOrder + 1,
      archived: false,
      userId: this.config.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.config.database.upsertProject(project);
    this.config.database.setProjectSyncStatus(localId, "pending");

    this.config.outbox.enqueue({
      method: "POST",
      path: "/api/projects",
      body: { ...data, clientId },
      clientId: String(localId),
    });

    return project;
  }

  /**
   * Update a project locally and queue for sync
   */
  updateProject(id: number, data: UpdateProjectDTO): ProjectDTO | null {
    const existing = this.config.database.getProject(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: ProjectDTO = {
      ...existing,
      name: data.name ?? existing.name,
      colorHex: data.colorHex ?? existing.colorHex,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      archived: data.archived ?? existing.archived,
      updatedAt: now,
    };

    this.config.database.upsertProject(updated);
    this.config.database.setProjectSyncStatus(id, "pending");

    if (id > 0) {
      this.config.outbox.enqueue({
        method: "PATCH",
        path: `/api/projects/${id}`,
        body: data as Record<string, unknown>,
      });
    }

    return updated;
  }

  /**
   * Delete a project locally (soft delete) and queue for sync
   */
  deleteProject(id: number): boolean {
    const existing = this.config.database.getProject(id);
    if (!existing) return false;

    const now = new Date().toISOString();
    const deleted: ProjectDTO = {
      ...existing,
      deletedAt: now,
      updatedAt: now,
    };

    this.config.database.upsertProject(deleted);
    this.config.database.setProjectSyncStatus(id, "pending");

    if (id > 0) {
      this.config.outbox.enqueue({
        method: "DELETE",
        path: `/api/projects/${id}`,
      });
    } else {
      this.config.database.deleteProject(id);
    }

    return true;
  }
}
