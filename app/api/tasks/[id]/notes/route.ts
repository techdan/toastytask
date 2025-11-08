import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { noteRepository, taskRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { diffNoteLines, trimTrailingBlanks, defaultNormalize } from "@/lib/notes/diff-note-lines";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/tasks/[id]/notes - Get all notes for a task
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const taskId = parseInt(id);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    // Verify task ownership before returning notes
    const task = await taskRepository.findById(taskId, userId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const notes = await noteRepository.getNotesForTask(taskId);

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// POST /api/tasks/[id]/notes - Create or update notes for a task
// Body: { text: string } - Full note text (will be split into lines)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const taskId = parseInt(id);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const body = await request.json();
    const text = body.text || "";

    // Get existing notes
    const existingNotes = await noteRepository.getNotesForTask(taskId);

    // Track if any notes were actually changed (for touch tracking)
    let notesChanged = false;

    // If text is empty or only whitespace, delete all notes and touch task
    if (text.trim() === "") {
      if (existingNotes.length > 0) {
        notesChanged = true;
        for (const note of existingNotes) {
          await noteRepository.deleteNoteRow(note.id);
        }
      }

      if (notesChanged) {
        const touchedTask = await taskRepository.touch(taskId, userId);
        const now = new Date();
        const freshImportance = calculateImportanceV1(touchedTask, now);
        const freshHeat = calculateHeat(touchedTask, now, freshImportance);
        await taskRepository.updateHeat(taskId, freshHeat, userId);
      }

      return NextResponse.json({ notes: [] });
    }

    // Split and normalize lines: trim trailing blanks; equality ignores whitespace
    const rawLines = text.split("\n");
    const nextLines = trimTrailingBlanks(rawLines);

    const oldLines = existingNotes.map(r => r.currentText || "");
    const { ops } = diffNoteLines(oldLines, nextLines, { normalize: defaultNormalize });

    // Build new ordered list and track required changes
    const updatedNotes: typeof existingNotes = [];
    const usedOld = new Set<number>();

    // Note: we assign new rows provisional ordinals equal to their newIndex.
    // We normalize to contiguous ordinals [0..n-1] below.

    // First pass: process equal/replace/insert in order of new indices
    // We will collect deletions after by looking at unused old indices
    for (const op of ops) {
      if (op.op === "equal") {
        const row = existingNotes[op.oldIndex];
        // If only whitespace differs, ignore update; keep original text
        // Always position to newIndex
        updatedNotes[op.newIndex] = row;
        usedOld.add(op.oldIndex);
        if (!op.textEqual) {
          // Whitespace-only difference: do not count as change
        }
      } else if (op.op === "replace") {
        const row = existingNotes[op.oldIndex];
        const newText = nextLines[op.newIndex];
        if (row.currentText !== newText) {
          const updated = await noteRepository.updateNoteRow(row.id, newText);
          updatedNotes[op.newIndex] = updated;
          notesChanged = true;
        } else {
          // Exact text equal fallback (should be rare) -> treat as equal
          updatedNotes[op.newIndex] = row;
        }
        usedOld.add(op.oldIndex);
      } else if (op.op === "insert") {
        const newText = nextLines[op.newIndex];
        const created = await noteRepository.createNoteRow(
          {
            taskId,
            // Assign target index; final compaction will normalize to contiguous ordinals
            ordinal: op.newIndex,
            activeVersionId: null,
          },
          newText
        );
        updatedNotes[op.newIndex] = created;
        notesChanged = true;
      }
    }

    // Deletions: any old index not used (includes trimmed trailing blanks)
    for (let i = 0; i < existingNotes.length; i++) {
      if (!usedOld.has(i)) {
        await noteRepository.deleteNoteRow(existingNotes[i].id);
        notesChanged = true;
      }
    }

    // Assemble final notes in the new line order
    const finalNotesUnordered = updatedNotes.filter(n => n !== undefined);

    // Always normalize to contiguous ordinals [0..n-1] after save
    {
      // Compute contiguous ordinals [0..n-1] in the displayed order
      const ordinalsToUpdate: Record<number, number> = {};
      finalNotesUnordered.forEach((row, idx) => {
        if (row.ordinal !== idx) {
          ordinalsToUpdate[row.id] = idx;
        }
      });
      if (Object.keys(ordinalsToUpdate).length > 0) {
        await noteRepository.reorderNoteRowsBulk(taskId, ordinalsToUpdate);
      }
      // Apply updated ordinals in-memory for the response
      for (let i = 0; i < finalNotesUnordered.length; i++) {
        const row = finalNotesUnordered[i];
        const newOrd = ordinalsToUpdate[row.id];
        if (typeof newOrd === 'number') {
          (finalNotesUnordered[i] = { ...row, ordinal: newOrd });
        }
      }
    }

    // Sort by ordinal for response consistency
    const finalNotes = finalNotesUnordered.sort((a, b) => a.ordinal - b.ordinal);

    if (notesChanged) {
      const touchedTask = await taskRepository.touch(taskId, userId);
      const now = new Date();
      const freshImportance = calculateImportanceV1(touchedTask, now);
      const freshHeat = calculateHeat(touchedTask, now, freshImportance);
      await taskRepository.updateHeat(taskId, freshHeat, userId);
    }

    // V3: Note edits no longer tracked for engagement (removed otherTouchCount)
    // Heat V3 relies on manual heat/cool adjustments only

    return NextResponse.json({ notes: finalNotes });
  } catch (error) {
    console.error("Failed to update notes:", error);
    return NextResponse.json({ error: "Failed to update notes" }, { status: 500 });
  }
}
