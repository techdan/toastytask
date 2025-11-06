import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { noteRepository, taskRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";

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

    // Split text into lines
    const lines = text.split("\n");

    // Update or create note rows - only update if text actually changed
    const updatedNotes = [];

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];

      if (existingNotes[i]) {
        // Only update if the text has actually changed
        if (existingNotes[i].currentText !== lineText) {
          const updated = await noteRepository.updateNoteRow(existingNotes[i].id, lineText);
          updatedNotes.push(updated);
          notesChanged = true;
        } else {
          // No change - keep existing note row as-is
          updatedNotes.push(existingNotes[i]);
        }
      } else {
        // Create new row
        const created = await noteRepository.createNoteRow(
          {
            taskId,
            ordinal: i,
            activeVersionId: null,
          },
          lineText
        );
        updatedNotes.push(created);
        notesChanged = true;
      }
    }

    // Delete any extra rows
    if (lines.length < existingNotes.length) {
      for (let i = lines.length; i < existingNotes.length; i++) {
        await noteRepository.deleteNoteRow(existingNotes[i].id);
        notesChanged = true;
      }
    }

    if (notesChanged) {
      const touchedTask = await taskRepository.touch(taskId, userId);
      const now = new Date();
      const freshImportance = calculateImportanceV1(touchedTask, now);
      const freshHeat = calculateHeat(touchedTask, now, freshImportance);
      await taskRepository.updateHeat(taskId, freshHeat, userId);
    }

    // V3: Note edits no longer tracked for engagement (removed otherTouchCount)
    // Heat V3 relies on manual heat/cool adjustments only

    return NextResponse.json({ notes: updatedNotes });
  } catch (error) {
    console.error("Failed to update notes:", error);
    return NextResponse.json({ error: "Failed to update notes" }, { status: 500 });
  }
}
