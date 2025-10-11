import { eq, and, isNull } from "drizzle-orm";
import type { IProjectRepository } from "./interfaces";
import type { Project, NewProject } from "@/lib/db/schema";
import { projects } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

export class SQLiteProjectRepository implements IProjectRepository {
  private db = getDatabase();

  async create(project: NewProject): Promise<Project> {
    const [newProject] = await this.db
      .insert(projects)
      .values({
        ...project,
        createdAt: new Date(),
      })
      .returning();
    return newProject;
  }

  async findById(id: number): Promise<Project | undefined> {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return project;
  }

  async findAll(includeArchived: boolean = false): Promise<Project[]> {
    if (includeArchived) {
      return this.db.select().from(projects);
    }

    return this.db
      .select()
      .from(projects)
      .where(eq(projects.archived, false));
  }

  async update(id: number, updates: Partial<NewProject>): Promise<Project> {
    const [updatedProject] = await this.db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return updatedProject;
  }

  async archive(id: number): Promise<Project> {
    const [archivedProject] = await this.db
      .update(projects)
      .set({ archived: true })
      .where(eq(projects.id, id))
      .returning();
    return archivedProject;
  }

  async unarchive(id: number): Promise<Project> {
    const [unarchivedProject] = await this.db
      .update(projects)
      .set({ archived: false })
      .where(eq(projects.id, id))
      .returning();
    return unarchivedProject;
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(projects).where(eq(projects.id, id));
  }
}
