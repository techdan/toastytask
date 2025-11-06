import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateHeat, calculateHeatWithBreakdown, calculateCoolDrop, applyAsymmetricDecay, resolveAdjustmentForTargetHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

/**
 * POST /api/tasks/[id]/cool - Apply cool
 *
 * Behavior:
 * - Context-aware: Calculates drop to move task down 3 positions
 * - Updates heatAdjustment (capped at ±45 pts)
 * - Updates last_heat_touched_at and last_touched_at
 * - Returns task with recalculated heat (never stored, always fresh)
 * - Returns heat delta and breakdown for UI feedback
 *
 * Request body (optional):
 * - decrement?: number - Manual decrement override (for context-aware from client)
 * - visibleTaskIds?: number[] - Task IDs for context-aware calculation (server calculates fresh heat)
 *
 * Key Features:
 * - Asymmetric decay: Cool decays 2x faster (3-day half-life vs 7-day for heat)
 * - No snooze workflow (removed for simplification)
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

    // Parse request body (optional)
    const body = await request.json().catch(() => ({}));
    const { decrement, visibleTaskIds } = body;

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
    let contextTasks: Array<{id: number; heat: number}> = [];

    // CRITICAL FIX: Recalculate fresh importance for current task
    // importanceV1 can become stale in database (time-dependent calculation)
    const currentTaskFreshImportance = calculateImportanceV1(existingTask);
    const contextCurrentHeat = calculateHeat(
      { ...existingTask, importanceV1: currentTaskFreshImportance },
      now
    );

    // Build context from client-sent task IDs or fetch all tasks
    if (visibleTaskIds && Array.isArray(visibleTaskIds) && visibleTaskIds.length > 0) {
      // Client sent context IDs - fetch these tasks and calculate fresh heat
      const neighborIds = Array.from(new Set(visibleTaskIds)).filter((id) => id !== existingTask.id);
      if (neighborIds.length > 0) {
        const neighborRecords = await taskRepository.findManyByIds(neighborIds, userId);
        contextTasks = neighborRecords.map((neighbor) => {
          // CRITICAL FIX: Recalculate importanceV1 fresh (don't trust DB value)
          // importanceV1 is time-dependent and can become stale in the database
          const freshImportance = calculateImportanceV1(neighbor);
          const freshHeat = calculateHeat({ ...neighbor, importanceV1: freshImportance }, now);
          return { id: neighbor.id, heat: freshHeat };
        });
      }
    } else {
      // No context provided by client - fetch ALL active tasks and calculate fresh heat
      // Note: Must fetch all tasks because stored heat is stale - can't rely on DB sort
      const dbTasks = await taskRepository.findAll(userId, {
        includeCompleted: false,
        includeArchived: false,
        includeDeleted: false,
      });

      // Calculate fresh heat for all tasks and sort by it
      contextTasks = dbTasks
        .filter((t) => !t.completedAt && t.id !== existingTask.id)
        .map((t) => {
          // CRITICAL FIX: Recalculate importanceV1 fresh (don't trust DB value)
          const freshImportance = calculateImportanceV1(t);
          const freshHeat = calculateHeat({ ...t, importanceV1: freshImportance }, now);
          return { id: t.id, heat: freshHeat };
        })
        .sort((a, b) => b.heat - a.heat) // Sort by fresh heat (the ONLY accurate sort)
        .slice(0, 30); // Take top 30 by fresh heat for context
    }

    // Calculate context-aware drop (move down 3 positions)
    const dropHeatDelta =
      decrement !== undefined
        ? Math.max(Math.min(decrement, -1), -HEAT_CONFIG.MAX_DROP_PER_CLICK)
        : calculateCoolDrop(
            { heat: contextCurrentHeat, id: existingTask.id },
            contextTasks
          );

    const targetHeat = Math.min(
      Math.max(contextCurrentHeat + dropHeatDelta, HEAT_CONFIG.MIN_FINAL_SCORE),
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
      drop: dropHeatDelta,
      targetHeat,
    });
  } catch (error) {
    console.error("Failed to apply cool:", error);
    return NextResponse.json({ error: "Failed to apply cool" }, { status: 500 });
  }
}
