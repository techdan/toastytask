import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";

// Force Node.js runtime for database compatibility
export const runtime = "nodejs";

/**
 * POST /api/tasks/[id]/touch
 *
 * Marks a task as touched without changing its heat adjustment. Updates
 * lastTouchedAt (and touch count) to reflect the interaction while keeping
 * heat calculations in sync with the new recency value.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const taskId = Number.parseInt(id, 10);

    if (Number.isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    const existingTask = await taskRepository.findById(taskId, userId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const touchedTask = await taskRepository.touch(taskId, userId);
    const now = new Date();
    const freshImportance = calculateImportanceV1(touchedTask, now);
    const freshHeat = calculateHeat(touchedTask, now, freshImportance);

    await taskRepository.updateHeat(taskId, freshHeat, userId);

    const finalTask = await taskRepository.findById(taskId, userId);

    return NextResponse.json({
      task: finalTask ?? {
        ...touchedTask,
        heat: freshHeat,
        heatCalculatedAt: now,
      },
    });
  } catch (error) {
    console.error("Failed to touch task:", error);
    return NextResponse.json({ error: "Failed to touch task" }, { status: 500 });
  }
}
