import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateSnoozeDecay, calculateHeat, calculateHeatWithBreakdown } from "@/lib/scoring/heat-v2";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

/**
 * POST /api/tasks/[id]/snooze - Apply snooze (cool interaction)
 *
 * Behavior:
 * - Sets next_surface_at to selected date
 * - Applies projected decay to heat_touch_count (natural cooling)
 * - Updates last_heat_touched_at and last_touched_at
 * - Recalculates heat immediately (drops significantly)
 * - Task remains visible but drops to new position
 * - Returns updated task with heat delta, decay info, and breakdown
 */
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
    const taskId = parseInt(id, 10);

    // Parse request body
    const body = await request.json();
    const { nextSurfaceAt } = body;

    if (!nextSurfaceAt) {
      return NextResponse.json({ error: "nextSurfaceAt is required" }, { status: 400 });
    }

    const nextSurfaceDate = new Date(nextSurfaceAt);

    // Get existing task
    const existingTask = await taskRepository.findById(taskId, userId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Calculate old heat for delta
    const oldHeat = existingTask.heat;

    // Apply projected decay to heat_touch_count
    const now = new Date();
    const { newCount, decayFactor, touchesRetained } = calculateSnoozeDecay(
      existingTask.heatTouchCount,
      nextSurfaceDate,
      now
    );

    // Calculate days until resurface
    const daysUntilResurface = (nextSurfaceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Update task with new values
    const updatedTask = await taskRepository.update(taskId, {
      nextSurfaceAt: nextSurfaceDate,
      heatTouchCount: newCount,
      lastHeatTouchedAt: now,
      lastTouchedAt: now,
    }, userId);

    // Recalculate heat (will drop significantly)
    const newHeat = calculateHeat(updatedTask, now);

    // Update heat in database
    await taskRepository.updateHeat(taskId, newHeat, userId);

    // Get final task with updated heat
    const finalTask = await taskRepository.findById(taskId, userId);
    if (!finalTask) {
      return NextResponse.json({ error: "Task not found after update" }, { status: 404 });
    }

    // Calculate heat breakdown for tooltip
    const heatBreakdown = calculateHeatWithBreakdown(finalTask, now);

    // Calculate delta
    const heatDelta = newHeat - oldHeat;

    return NextResponse.json({
      task: finalTask,
      heatDelta,
      heatBreakdown,
      decayFactor,
      touchesRetained,
      resurfaceDate: nextSurfaceDate,
      daysUntilResurface,
    });
  } catch (error) {
    console.error("Failed to apply snooze:", error);
    return NextResponse.json({ error: "Failed to apply snooze" }, { status: 500 });
  }
}
