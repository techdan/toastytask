import { eq, desc, inArray, sql } from "drizzle-orm";
import type { NoteRow, NewNoteRow, NoteRowVersion } from "@/lib/db/schema";
import { noteRows, noteRowVersions } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

export interface NoteRowWithVersion extends NoteRow {
  currentText?: string;
}

export interface NotesMetadata {
  taskId: number;
  count: number;
  lastModified: Date | null;
}

export interface INoteRepository {
  getNotesForTask(taskId: number): Promise<NoteRowWithVersion[]>;
  getNotesForTasks(taskIds: number[]): Promise<Map<number, NoteRowWithVersion[]>>;
  getNotesMetadataForTasks(taskIds: number[]): Promise<Map<number, NotesMetadata>>;
  createNoteRow(noteRow: NewNoteRow, text: string): Promise<NoteRowWithVersion>;
  updateNoteRow(noteRowId: number, text: string): Promise<NoteRowWithVersion>;
  deleteNoteRow(noteRowId: number): Promise<void>;
  reorderNoteRows(taskId: number, ordinals: Record<number, number>): Promise<void>;
  reorderNoteRowsBulk(taskId: number, ordinals: Record<number, number>): Promise<void>;
  getNoteVersionHistory(noteRowId: number): Promise<NoteRowVersion[]>;
  restoreVersion(noteRowId: number, versionId: number): Promise<NoteRowWithVersion>;
}

export class NoteRepository implements INoteRepository {
  private db = getDatabase();

  async getNotesForTasks(taskIds: number[]): Promise<Map<number, NoteRowWithVersion[]>> {
    if (taskIds.length === 0) {
      return new Map();
    }

    // Fetch all note rows for all tasks
    const rows = await this.db
      .select()
      .from(noteRows)
      .where(inArray(noteRows.taskId, taskIds))
      .orderBy(noteRows.taskId, noteRows.ordinal);

    // Fetch all active versions for these notes
    const noteRowIds = rows.map(r => r.id);
    const versions = noteRowIds.length > 0
      ? await this.db
          .select()
          .from(noteRowVersions)
          .where(inArray(noteRowVersions.id, rows.map(r => r.activeVersionId).filter(Boolean) as number[]))
      : [];

    // Create a map of versionId -> text
    const versionTextMap = new Map<number, string>();
    for (const version of versions) {
      versionTextMap.set(version.id, version.text);
    }

    // Group rows by taskId and attach text
    const notesMap = new Map<number, NoteRowWithVersion[]>();
    for (const row of rows) {
      const rowWithVersion: NoteRowWithVersion = {
        ...row,
        currentText: row.activeVersionId ? (versionTextMap.get(row.activeVersionId) || "") : "",
      };

      if (!notesMap.has(row.taskId)) {
        notesMap.set(row.taskId, []);
      }
      notesMap.get(row.taskId)!.push(rowWithVersion);
    }

    return notesMap;
  }

  async getNotesMetadataForTasks(taskIds: number[]): Promise<Map<number, NotesMetadata>> {
    if (taskIds.length === 0) {
      return new Map();
    }

    // Query to get count and max updatedAt for each task
    const results = await this.db
      .select({
        taskId: noteRows.taskId,
        count: sql<number>`count(*)`,
        lastModified: sql<Date | null>`max(${noteRows.updatedAt})`,
      })
      .from(noteRows)
      .where(inArray(noteRows.taskId, taskIds))
      .groupBy(noteRows.taskId);

    const metadataMap = new Map<number, NotesMetadata>();
    for (const result of results) {
      metadataMap.set(result.taskId, {
        taskId: result.taskId,
        count: result.count,
        lastModified: result.lastModified,
      });
    }

    return metadataMap;
  }

  async getNotesForTask(taskId: number): Promise<NoteRowWithVersion[]> {
    const rows = await this.db
      .select()
      .from(noteRows)
      .where(eq(noteRows.taskId, taskId))
      .orderBy(noteRows.ordinal);

    // Fetch current text for each row
    const rowsWithText: NoteRowWithVersion[] = [];
    for (const row of rows) {
      if (row.activeVersionId) {
        const [version] = await this.db
          .select()
          .from(noteRowVersions)
          .where(eq(noteRowVersions.id, row.activeVersionId))
          .limit(1);

        rowsWithText.push({
          ...row,
          currentText: version?.text || "",
        });
      } else {
        rowsWithText.push({ ...row, currentText: "" });
      }
    }

    return rowsWithText;
  }

  async createNoteRow(noteRow: NewNoteRow, text: string): Promise<NoteRowWithVersion> {
    // Create the note row first
    const now = new Date();

    const [newRow] = await this.db
      .insert(noteRows)
      .values({
        ...noteRow,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Create the first version
    const [version] = await this.db
      .insert(noteRowVersions)
      .values({
        noteRowId: newRow.id,
        text,
        createdAt: new Date(),
      })
      .returning();

    // Update the note row to point to this version
    const [updatedRow] = await this.db
      .update(noteRows)
      .set({ activeVersionId: version.id })
      .where(eq(noteRows.id, newRow.id))
      .returning();

    return {
      ...updatedRow,
      currentText: text,
    };
  }

  async updateNoteRow(noteRowId: number, text: string): Promise<NoteRowWithVersion> {
    // Create a new version
    const [version] = await this.db
      .insert(noteRowVersions)
      .values({
        noteRowId,
        text,
        createdAt: new Date(),
      })
      .returning();

    // Update the note row to point to this version
    const [updatedRow] = await this.db
      .update(noteRows)
      .set({
        activeVersionId: version.id,
        updatedAt: new Date(),
      })
      .where(eq(noteRows.id, noteRowId))
      .returning();

    return {
      ...updatedRow,
      currentText: text,
    };
  }

  async deleteNoteRow(noteRowId: number): Promise<void> {
    await this.db.delete(noteRows).where(eq(noteRows.id, noteRowId));
  }

  async reorderNoteRows(taskId: number, ordinals: Record<number, number>): Promise<void> {
    // Update ordinals for all affected rows WITHOUT touching updatedAt
    for (const [noteRowId, ordinal] of Object.entries(ordinals)) {
      await this.db
        .update(noteRows)
        .set({ ordinal })
        .where(eq(noteRows.id, parseInt(noteRowId)));
    }
  }

  // Bulk reorder ordinals using a single UPDATE ... FROM (VALUES ...) for Postgres
  async reorderNoteRowsBulk(taskId: number, ordinals: Record<number, number>): Promise<void> {
    const pairs = Object.entries(ordinals);
    if (pairs.length === 0) return;

    // Build VALUES list: (id, ordinal)
    const valuesSql = pairs
      .map(([id, ord]) => `(${parseInt(id)}, ${ord})`)
      .join(", ");

    // Execute bulk update (Postgres specific)
    await this.db.execute(sql`
      UPDATE ${noteRows} AS nr
      SET ordinal = v.ordinal
      FROM (VALUES ${sql.raw(valuesSql)}) AS v(id, ordinal)
      WHERE nr.id = v.id AND nr.task_id = ${taskId} AND (nr.ordinal IS DISTINCT FROM v.ordinal)
    `);
  }

  async getNoteVersionHistory(noteRowId: number): Promise<NoteRowVersion[]> {
    return this.db
      .select()
      .from(noteRowVersions)
      .where(eq(noteRowVersions.noteRowId, noteRowId))
      .orderBy(desc(noteRowVersions.createdAt));
  }

  async restoreVersion(noteRowId: number, versionId: number): Promise<NoteRowWithVersion> {
    // Get the version text
    const [version] = await this.db
      .select()
      .from(noteRowVersions)
      .where(eq(noteRowVersions.id, versionId))
      .limit(1);

    if (!version) {
      throw new Error("Version not found");
    }

    // Create a new version with the restored text
    return this.updateNoteRow(noteRowId, version.text);
  }
}
