import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { applyDecayToHeatTouches, calculateHeat, calculateHeatWithBreakdown } from "@/lib/scoring/heat-v2";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

/**
 * POST /api/tasks/[id]/touch - Apply heat touch (warm interaction)
 *
 * Behavior:
 * - Applies decay-on-touch to existing heat_touch_count
 * - Increments heat_touch_count by 1
 * - Updates last_heat_touched_at and last_touched_at
 * - Recalculates heat immediately
 * - Returns updated task with heat delta and breakdown
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

    // Get existing task
    const existingTask = await taskRepository.findById(taskId, userId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Calculate old heat for delta
    const oldHeat = existingTask.heat;

    // Apply decay-on-touch to heat_touch_count
    const now = new Date();
    const { newCount, decayFactor } = applyDecayToHeatTouches(
      existingTask.heatTouchCount,
      existingTask.lastHeatTouchedAt,
      now
    );

    // Update task with new values
    const updatedTask = await taskRepository.update(taskId, {
      heatTouchCount: newCount,
      lastHeatTouchedAt: now,
      lastTouchedAt: now,
    }, userId);

    // Recalculate heat
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
    });
  } catch (error) {
    console.error("Failed to apply heat touch:", error);
    return NextResponse.json({ error: "Failed to apply heat touch" }, { status: 500 });
  }
}
