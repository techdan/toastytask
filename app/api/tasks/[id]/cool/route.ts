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

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { decrement, visibleTaskIds } = body;

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

    const visibleTaskIdsOrdered = visibleTaskIds as number[];
    const visibleTaskIdsDeduped = Array.from(new Set(visibleTaskIdsOrdered));

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

    // Build context from all active task IDs (client now sends all active tasks, not just ±20 window)
    // This fixes production bug where rapid clicks sent stale context due to React render cycle delays
    const neighborIds = visibleTaskIdsDeduped.filter((id) => id !== existingTask.id);

    // Log context for debugging production issues
    console.log(`[cool-context] taskId=${taskId}, receivedContextSize=${visibleTaskIdsDeduped.length}, neighborCount=${neighborIds.length}`);

    let contextTasks: Array<{id: number; heat: number}> = [];
    if (neighborIds.length > 0) {
      const neighborRecords = await taskRepository.findManyByIds(neighborIds, userId);

      // Verify we got all the neighbors we expected
      if (neighborRecords.length !== neighborIds.length) {
        console.warn(`[cool-context-mismatch] Expected ${neighborIds.length} neighbors but got ${neighborRecords.length}`);
      }

      contextTasks = neighborRecords.map((neighbor) => {
        // CRITICAL FIX: Recalculate importanceV1 fresh (don't trust DB value)
        // importanceV1 is time-dependent and can become stale in the database
        const freshImportance = calculateImportanceV1(neighbor);
        const freshHeat = calculateHeat({ ...neighbor, importanceV1: freshImportance }, now);
        return { id: neighbor.id, heat: freshHeat };
      });

      // DIAGNOSTIC: Log heat distribution to identify calculation mismatches
      const sortedHeats = contextTasks.map(t => t.heat).sort((a, b) => b - a);
      const heatsNearCurrent = sortedHeats.filter(h => h >= contextCurrentHeat - 15 && h <= contextCurrentHeat + 5);
      console.log(`[cool-heat-distribution] heatsNear${contextCurrentHeat.toFixed(0)} (±15): [${heatsNearCurrent.map(h => h.toFixed(1)).join(', ')}]`);

      // DIAGNOSTIC: Count duplicates to identify if multiple tasks have same heat
      const heatCounts = new Map<number, number>();
      contextTasks.forEach(t => {
        const rounded = Math.round(t.heat);
        heatCounts.set(rounded, (heatCounts.get(rounded) || 0) + 1);
      });
      const duplicates = Array.from(heatCounts.entries())
        .filter(([, count]) => count > 1)
        .sort(([a], [b]) => b - a)
        .slice(0, 5);
      if (duplicates.length > 0) {
        console.log(`[cool-heat-duplicates] tasksWithSameHeat: ${duplicates.map(([heat, count]) => `${heat}(${count}x)`).join(', ')}`);
      }
    }

    // Calculate context-aware drop (move down 3 positions)
    const dropHeatDelta =
      decrement !== undefined
        ? Math.max(Math.min(decrement, -1), -HEAT_CONFIG.MAX_DROP_PER_CLICK)
        : calculateCoolDrop(
            { heat: contextCurrentHeat, id: existingTask.id },
            contextTasks
          );

    // Log the calculated drop to verify context-aware calculation
    console.log(`[cool-delta] taskId=${taskId}, currentHeat=${contextCurrentHeat.toFixed(1)}, dropDelta=${dropHeatDelta.toFixed(1)}, contextTaskCount=${contextTasks.length}`);

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
