import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const taskId = parseInt(id, 10);
    const body = await request.json();

    // Get existing task (scoped to user)
    const existingTask = await taskRepository.findById(taskId, userId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Prepare updates
    const updates: Record<string, unknown> = { ...body };

    // Convert date strings to Date objects if present
    if (updates.dueAt !== undefined) {
      updates.dueAt = updates.dueAt && (typeof updates.dueAt === 'string' || typeof updates.dueAt === 'number')
        ? new Date(updates.dueAt as string | number)
        : null;
    }
    if (updates.completedAt !== undefined) {
      updates.completedAt = updates.completedAt && (typeof updates.completedAt === 'string' || typeof updates.completedAt === 'number')
        ? new Date(updates.completedAt as string | number)
        : null;
    }

    // Track field edits for Heat v2 (increment other_touch_count)
    // Fields that count as "engagement": title, priority, dueAt, star, projectId, bucket
    const isFieldEdit =
      updates.title !== undefined ||
      updates.priority !== undefined ||
      updates.dueAt !== undefined ||
      updates.star !== undefined ||
      updates.projectId !== undefined ||
      updates.bucket !== undefined;

    if (isFieldEdit) {
      await taskRepository.incrementOtherTouchCount(taskId, userId);
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

    const task = await taskRepository.update(taskId, updates, userId);

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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const taskId = parseInt(id, 10);

    // Soft delete by setting deletedAt timestamp (scoped to user)
    await taskRepository.update(taskId, {
      deletedAt: new Date(),
    }, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
