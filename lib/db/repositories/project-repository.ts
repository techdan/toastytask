import { eq, and } from "drizzle-orm";
import type { IProjectRepository } from "./interfaces";
import type { Project, NewProject } from "@/lib/db/schema";
import { projects } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

export class SQLiteProjectRepository implements IProjectRepository {
  private db = getDatabase();

  async create(project: NewProject, userId: string): Promise<Project> {
    const [newProject] = await this.db
      .insert(projects)
      .values({
        ...project,
        userId,
        createdAt: new Date(),
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
        .where(eq(projects.userId, userId));
    }

    return this.db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.archived, false)));
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
}
