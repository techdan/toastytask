import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateHeat, calculateHeatWithBreakdown, calculateHeatBoost, applyAsymmetricDecay, resolveAdjustmentForTargetHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

/**
 * POST /api/tasks/[id]/heat - Apply heat
 *
 * Behavior:
 * - Context-aware: Calculates boost to move task up 1 position
 * - Updates heatAdjustment (capped at ±45 pts)
 * - Updates last_heat_touched_at and last_touched_at
 * - Returns task with recalculated heat (never stored, always fresh)
 * - Returns heat delta and breakdown for UI feedback
 *
 * Request body (optional):
 * - increment?: number - Manual increment override (for context-aware from client)
 * - visibleTaskIds?: number[] - Task IDs for context-aware calculation (server calculates fresh heat)
 *
 * See: docs/current-heat-algorithm.md
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
    const body = await request.json().catch(() => ({}));
    const { increment, visibleTaskIds } = body;

    // Validate required visibleTaskIds parameter
    if (!visibleTaskIds || !Array.isArray(visibleTaskIds) || visibleTaskIds.length === 0) {
      return NextResponse.json(
        { error: "visibleTaskIds is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    // Get existing task
    const existingTask = await taskRepository.findById(taskId, userId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Calculate old heat for delta
    const storedAdjustment = existingTask.heatAdjustment || 0;

    // Apply asymmetric decay to get current effective adjustment
    const now = new Date();
    const { newAdjustment: decayedAdjustment } = applyAsymmetricDecay(
      storedAdjustment,
      existingTask.lastHeatTouchedAt,
      now
    );

    // Determine target heat using fresh calculations (never trust stored heat)
    // CRITICAL FIX: Recalculate fresh importance for current task
    // importanceV1 can become stale in database (time-dependent calculation)
    const currentTaskFreshImportance = calculateImportanceV1(existingTask);
    const contextCurrentHeat = calculateHeat(
      { ...existingTask, importanceV1: currentTaskFreshImportance },
      now
    );

    // Build context from nearby task IDs (performance optimization: ~20 tasks instead of all)
    const neighborIds = Array.from(new Set(visibleTaskIds)).filter((id) => id !== existingTask.id);

    let contextTasks: Array<{id: number; heat: number}> = [];
    if (neighborIds.length > 0) {
      const neighborRecords = await taskRepository.findManyByIds(neighborIds, userId);
      contextTasks = neighborRecords.map((neighbor) => {
        // Recalculate importanceV1 fresh (don't trust DB value)
        // importanceV1 is time-dependent and can become stale in the database
        const freshImportance = calculateImportanceV1(neighbor);
        const freshHeat = calculateHeat({ ...neighbor, importanceV1: freshImportance }, now);
        return { id: neighbor.id, heat: freshHeat };
      });
    }

    // Calculate context-aware boost (move up 1 position)
    const boostHeatDelta =
      increment !== undefined
        ? Math.min(Math.max(increment, 1), HEAT_CONFIG.MAX_BOOST_PER_CLICK)
        : calculateHeatBoost(
            { heat: contextCurrentHeat, id: existingTask.id },
            contextTasks
          );

    const targetHeat = Math.min(
      Math.max(contextCurrentHeat + boostHeatDelta, HEAT_CONFIG.MIN_FINAL_SCORE),
      HEAT_CONFIG.MAX_FINAL_SCORE
    );

    const {
      newAdjustment,
      baselineHeat,
      adjustmentDelta,
    } = resolveAdjustmentForTargetHeat(
      targetHeat,
      {
        importanceV1: currentTaskFreshImportance, // CRITICAL: Use fresh importance, not stale DB value!
        heatAdjustment: decayedAdjustment,
        lastTouchedAt: existingTask.lastTouchedAt,
        lastHeatTouchedAt: existingTask.lastHeatTouchedAt,
      },
      now
    );

    // Update task with new adjustment
    // Note: We no longer persist importanceV1 (pure calculation architecture)
    const updatedTask = await taskRepository.update(taskId, {
      heatAdjustment: newAdjustment,
      lastHeatTouchedAt: now,
      lastTouchedAt: now,
    }, userId);

    // Calculate fresh heat using fresh importance (not stored, only returned to client)
    const newHeat = calculateHeat(updatedTask, now, currentTaskFreshImportance);

    // Calculate heat breakdown for tooltip using fresh importance
    const heatBreakdown = calculateHeatWithBreakdown(updatedTask, now, currentTaskFreshImportance);

    // Calculate deltas
    const heatDelta = newHeat - baselineHeat;
    return NextResponse.json({
      task: updatedTask,
      heatDelta,
      adjustmentDelta,
      heatBreakdown,
      baselineHeat,
      boost: boostHeatDelta,
      targetHeat,
    });
  } catch (error) {
    console.error("Failed to apply heat:", error);
    return NextResponse.json({ error: "Failed to apply heat" }, { status: 500 });
  }
}
