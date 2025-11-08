import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { noteRepository, taskRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";

// Force Node.js runtime for DB compatibility
export const runtime = 'nodejs';

// PATCH /api/notes/{id} - Update a single note row's text
// Body: { text: string }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const noteId = parseInt(id);
    if (isNaN(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text : undefined;
    if (typeof text !== 'string') {
      return NextResponse.json({ error: "Missing 'text' in request body" }, { status: 400 });
    }

    // Load note and verify ownership via parent task
    const note = await noteRepository.getNoteRowById(noteId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const task = await taskRepository.findById(note.taskId, userId);
    if (!task) {
      // Either not found or not owned by this user
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // If no textual change, return existing note without side effects
    if ((note.currentText || "") === text) {
      return NextResponse.json({ note });
    }

    // Update note row (creates a new version and updates activeVersionId)
    const updated = await noteRepository.updateNoteRow(noteId, text);

    // Touch + recalc heat for the parent task
    const touchedTask = await taskRepository.touch(note.taskId, userId);
    const now = new Date();
    const freshImportance = calculateImportanceV1(touchedTask, now);
    const freshHeat = calculateHeat(touchedTask, now, freshImportance);
    await taskRepository.updateHeat(note.taskId, freshHeat, userId);

    return NextResponse.json({ note: updated });
  } catch (error) {
    console.error("Failed to update note:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

// DELETE /api/notes/{id} - Delete a single note row and normalize ordinals
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const noteId = parseInt(id);
    if (isNaN(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    const note = await noteRepository.getNoteRowById(noteId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Verify ownership via parent task
    const task = await taskRepository.findById(note.taskId, userId);
    if (!task) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Delete the note row
    await noteRepository.deleteNoteRow(noteId);

    // Normalize ordinals for remaining notes on the task
    const remaining = await noteRepository.getNotesForTask(note.taskId);
    const ordinalsToUpdate: Record<number, number> = {};
    remaining
      .sort((a, b) => a.ordinal - b.ordinal)
      .forEach((row, idx) => {
        if (row.ordinal !== idx) {
          ordinalsToUpdate[row.id] = idx;
        }
      });
    if (Object.keys(ordinalsToUpdate).length > 0) {
      await noteRepository.reorderNoteRowsBulk(note.taskId, ordinalsToUpdate);
    }

    // Touch + recalc heat for the parent task
    const touchedTask = await taskRepository.touch(note.taskId, userId);
    const now = new Date();
    const freshImportance = calculateImportanceV1(touchedTask, now);
    const freshHeat = calculateHeat(touchedTask, now, freshImportance);
    await taskRepository.updateHeat(note.taskId, freshHeat, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}

