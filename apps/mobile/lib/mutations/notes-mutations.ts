import type { SQLiteDatabase } from "expo-sqlite";
import type { NoteRowDTO } from "@toasty/contracts";
import { LocalDatabase } from "../storage/database";
import { OutboxQueue } from "../sync/outbox";

/**
 * Notes mutations for offline-first operations.
 * Notes are saved as a complete text string that gets synced to the server.
 * The server handles line-by-line diffing and storage.
 */

export interface NotesMutationsConfig {
  database: LocalDatabase;
  outbox: OutboxQueue;
}

export class NotesMutations {
  constructor(private config: NotesMutationsConfig) {}

  /**
   * Save notes for a task
   * Stores optimistically in local DB and queues for sync
   */
  saveNotes(taskId: number, text: string): NoteRowDTO[] {
    const now = new Date().toISOString();
    const db = this.config.database["db"] as SQLiteDatabase;

    // Clear existing notes for this task
    db.runSync("DELETE FROM notes WHERE task_id = ?", [taskId]);

    // Split text into lines and create note rows
    const lines = text.split("\n");
    const notes: NoteRowDTO[] = [];

    // Filter out trailing empty lines but keep internal ones
    let lastNonEmptyIndex = lines.length - 1;
    while (lastNonEmptyIndex >= 0 && lines[lastNonEmptyIndex].trim() === "") {
      lastNonEmptyIndex--;
    }

    const trimmedLines = lines.slice(0, lastNonEmptyIndex + 1);

    for (let i = 0; i < trimmedLines.length; i++) {
      const note: NoteRowDTO = {
        // Use negative IDs for local-only notes
        id: -(taskId * 1000 + i),
        taskId,
        ordinal: i,
        currentText: trimmedLines[i],
        createdAt: now,
        updatedAt: now,
      };

      notes.push(note);
      this.config.database.upsertNote(note);
    }

    // Queue save operation for sync (only for server-side tasks)
    if (taskId > 0) {
      this.config.outbox.enqueue({
        method: "POST",
        path: `/api/tasks/${taskId}/notes`,
        body: { text },
      });
    }

    return notes;
  }

  /**
   * Get notes for a task as combined text
   */
  getNotesText(taskId: number): string {
    const notes = this.config.database.getNotesForTask(taskId);
    return notes.map((n) => n.currentText).join("\n");
  }
}
