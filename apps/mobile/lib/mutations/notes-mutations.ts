import type { NoteRowDTO } from "@toasty/contracts";
import { LocalDatabase } from "../storage/database";
import { OutboxQueue } from "../sync/outbox";
import { diffNoteLines, trimTrailingBlanks, defaultNormalize } from "../sync/diff-note-lines";

export interface NotesMutationsConfig {
  database: LocalDatabase;
  outbox: OutboxQueue;
}

export class NotesMutations {
  constructor(private config: NotesMutationsConfig) {}

  /**
   * Save notes for a task using smart LCS diff.
   *
   * Unchanged lines keep their original row IDs and timestamps, preserving
   * version history. Only genuinely changed lines are updated; new lines are
   * inserted and removed lines are hard-deleted.
   */
  saveNotes(taskId: number, text: string): NoteRowDTO[] {
    const now = new Date().toISOString();
    const db = this.config.database;

    const existingNotes = db.getNotesForTask(taskId);
    const newLines = trimTrailingBlanks(text.split("\n"));
    const oldLines = existingNotes.map((n) => n.currentText);

    // Fast path: clearing all notes
    if (newLines.length === 0) {
      for (const note of existingNotes) {
        db.deleteNote(note.id);
      }
      if (taskId > 0) {
        this.config.outbox.enqueue({
          method: "POST",
          path: `/api/tasks/${taskId}/notes`,
          body: { text: "" },
        });
      }
      return [];
    }

    const { ops } = diffNoteLines(oldLines, newLines, { normalize: defaultNormalize });

    const result: NoteRowDTO[] = new Array(newLines.length);
    const toDelete = new Set<number>(); // old indices to hard-delete

    for (const op of ops) {
      switch (op.op) {
        case "equal": {
          const row = existingNotes[op.oldIndex];
          if (row.ordinal !== op.newIndex) {
            db.updateNoteOrdinal(row.id, op.newIndex);
          }
          result[op.newIndex] = { ...row, ordinal: op.newIndex };
          break;
        }
        case "replace": {
          const row = existingNotes[op.oldIndex];
          const updated = db.updateNoteText(row.id, newLines[op.newIndex], op.newIndex, now);
          result[op.newIndex] = updated;
          break;
        }
        case "insert": {
          // Stable local ID: negative, unique within task + position + time bucket
          const localId = -(taskId * 100000 + op.newIndex * 1000 + (Date.now() % 1000));
          const newNote: NoteRowDTO = {
            id: localId,
            taskId,
            ordinal: op.newIndex,
            currentText: newLines[op.newIndex],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          db.upsertNote(newNote);
          result[op.newIndex] = newNote;
          break;
        }
        case "delete": {
          toDelete.add(op.oldIndex);
          break;
        }
      }
    }

    // Hard-delete removed rows
    for (const oldIdx of toDelete) {
      db.deleteNote(existingNotes[oldIdx].id);
    }

    // Queue full-text save for server-side smart diff
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "POST",
        path: `/api/tasks/${taskId}/notes`,
        body: { text },
      });
    }

    return result.filter(Boolean);
  }

  /**
   * Get notes for a task as combined text
   */
  getNotesText(taskId: number): string {
    const notes = this.config.database.getNotesForTask(taskId);
    return notes.map((n) => n.currentText).join("\n");
  }
}
