import { eq, and, desc } from "drizzle-orm";
import type { NoteRow, NewNoteRow, NoteRowVersion, NewNoteRowVersion } from "@/lib/db/schema";
import { noteRows, noteRowVersions } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/client";

export interface NoteRowWithVersion extends NoteRow {
  currentText?: string;
}

export interface INoteRepository {
  getNotesForTask(taskId: number): Promise<NoteRowWithVersion[]>;
  createNoteRow(noteRow: NewNoteRow, text: string): Promise<NoteRowWithVersion>;
  updateNoteRow(noteRowId: number, text: string): Promise<NoteRowWithVersion>;
  deleteNoteRow(noteRowId: number): Promise<void>;
  reorderNoteRows(taskId: number, ordinals: Record<number, number>): Promise<void>;
  getNoteVersionHistory(noteRowId: number): Promise<NoteRowVersion[]>;
  restoreVersion(noteRowId: number, versionId: number): Promise<NoteRowWithVersion>;
}

export class SQLiteNoteRepository implements INoteRepository {
  private db = getDatabase();

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
    const [newRow] = await this.db
      .insert(noteRows)
      .values({
        ...noteRow,
        createdAt: new Date(),
        updatedAt: new Date(),
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
    // Update ordinals for all affected rows
    for (const [noteRowId, ordinal] of Object.entries(ordinals)) {
      await this.db
        .update(noteRows)
        .set({ ordinal, updatedAt: new Date() })
        .where(eq(noteRows.id, parseInt(noteRowId)));
    }
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
