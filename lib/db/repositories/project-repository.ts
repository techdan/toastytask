import { eq, and, sql, asc } from "drizzle-orm";
import type { IProjectRepository } from "./interfaces";
import type { Project, NewProject } from "@/lib/db/schema";
import { projects } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

export class ProjectRepository implements IProjectRepository {
  private db = getDatabase();

  async create(project: NewProject, userId: string): Promise<Project> {
    const nextSortOrder = await this.getNextSortOrder(userId);

    const [newProject] = await this.db
      .insert(projects)
      .values({
        ...project,
        userId,
        createdAt: new Date(),
        sortOrder: nextSortOrder,
      })
      .returning();
    return newProject;
  }

  async findById(id: number, userId: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);
    return project;
  }

  async findAll(userId: string, includeArchived: boolean = false): Promise<Project[]> {
    if (includeArchived) {
      return this.db
        .select()
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(asc(projects.sortOrder), asc(projects.name));
    }

    return this.db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.archived, false)))
      .orderBy(asc(projects.sortOrder), asc(projects.name));
  }

  async update(id: number, updates: Partial<NewProject>, userId: string): Promise<Project> {
    const [updatedProject] = await this.db
      .update(projects)
      .set(updates)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return updatedProject;
  }

  async archive(id: number, userId: string): Promise<Project> {
    const [archivedProject] = await this.db
      .update(projects)
      .set({ archived: true })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return archivedProject;
  }

  async unarchive(id: number, userId: string): Promise<Project> {
    const [unarchivedProject] = await this.db
      .update(projects)
      .set({ archived: false })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return unarchivedProject;
  }

  async delete(id: number, userId: string): Promise<void> {
    await this.db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  }

  async reorder(projectIds: number[], userId: string): Promise<void> {
    if (projectIds.length === 0) {
      return;
    }

    await this.db.transaction(async (tx) => {
      for (const [index, projectId] of projectIds.entries()) {
        await tx
          .update(projects)
          .set({ sortOrder: index + 1 })
          .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      }
    });
  }

  private async getNextSortOrder(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ maxSortOrder: sql<number>`COALESCE(MAX(${projects.sortOrder}), 0)` })
      .from(projects)
      .where(eq(projects.userId, userId));

    return (result?.maxSortOrder ?? 0) + 1;
  }
}
