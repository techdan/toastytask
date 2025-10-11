import { NextResponse } from "next/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    const body = await request.json();

    // Get existing task
    const existingTask = await taskRepository.findById(taskId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Prepare updates
    const updates: any = { ...body };

    // Convert date strings to Date objects if present
    if (updates.dueAt !== undefined) {
      updates.dueAt = updates.dueAt ? new Date(updates.dueAt) : null;
    }
    if (updates.completedAt !== undefined) {
      updates.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
    }

    // Recalculate importance if relevant fields changed
    if (
      updates.priority !== undefined ||
      updates.star !== undefined ||
      updates.dueAt !== undefined
    ) {
      const updatedTask = { ...existingTask, ...updates };
      updates.importanceV1 = calculateImportanceV1(updatedTask);
    }

    const task = await taskRepository.update(taskId, updates);

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Soft delete a task
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);

    // Soft delete by setting deletedAt timestamp
    await taskRepository.update(taskId, {
      deletedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
