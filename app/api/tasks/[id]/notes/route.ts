import { NextResponse } from "next/server";
import { noteRepository } from "@/lib/db/repositories";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/tasks/[id]/notes - Get all notes for a task
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
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
    const { id } = await params;
    const taskId = parseInt(id);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const body = await request.json();
    const text = body.text || "";

    // Get existing notes
    const existingNotes = await noteRepository.getNotesForTask(taskId);

    // If text is empty or only whitespace, delete all notes
    if (text.trim() === "") {
      for (const note of existingNotes) {
        await noteRepository.deleteNoteRow(note.id);
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
      }
    }

    // Delete any extra rows
    for (let i = lines.length; i < existingNotes.length; i++) {
      await noteRepository.deleteNoteRow(existingNotes[i].id);
    }

    return NextResponse.json({ notes: updatedNotes });
  } catch (error) {
    console.error("Failed to update notes:", error);
    return NextResponse.json({ error: "Failed to update notes" }, { status: 500 });
  }
}
