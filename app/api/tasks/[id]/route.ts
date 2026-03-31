import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

const TOUCH_ON_EDIT_FIELDS = new Set([
  "title",
  "priority",
  "dueAt",
  "projectId",
  "repeatType",
  "repeatRule",
  "bucket",
]);

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

    const now = new Date();

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
    if (updates.lastTouchedAt !== undefined) {
      updates.lastTouchedAt = updates.lastTouchedAt && (typeof updates.lastTouchedAt === 'string' || typeof updates.lastTouchedAt === 'number')
        ? new Date(updates.lastTouchedAt as string | number)
        : null;
    }
    if (updates.lastHeatTouchedAt !== undefined) {
      updates.lastHeatTouchedAt = updates.lastHeatTouchedAt && (typeof updates.lastHeatTouchedAt === 'string' || typeof updates.lastHeatTouchedAt === 'number')
        ? new Date(updates.lastHeatTouchedAt as string | number)
        : null;
    }

    const shouldCountAsTouch =
      updates.lastHeatTouchedAt === undefined &&
      Object.keys(body).some((key) => TOUCH_ON_EDIT_FIELDS.has(key));

    if (shouldCountAsTouch) {
      updates.lastTouchedAt = now;
      updates.touchCount = (existingTask.touchCount ?? 0) + 1;
    }

    // Note: We no longer persist importanceV1 (pure calculation architecture)
    // Importance will be calculated on the client side from base properties

    const task = await taskRepository.update(taskId, updates, userId);

    // Recalculate heat using fresh importance
    // Calculate importance if relevant fields changed (for heat calculation only)
    let freshImportance: number | undefined;
    if (
      updates.priority !== undefined ||
      updates.starLevel !== undefined ||
      updates.dueAt !== undefined
    ) {
      freshImportance = calculateImportanceV1(task, now);
    }

    const recalculatedHeat = calculateHeat(task, now, freshImportance);
    await taskRepository.updateHeat(taskId, recalculatedHeat, userId);

    const finalTask = await taskRepository.findById(taskId, userId);

    return NextResponse.json({ task: finalTask ?? task });
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
