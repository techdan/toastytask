import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateHeat, calculateHeatWithBreakdown, calculateHeatBoost, applyAsymmetricDecay, resolveAdjustmentForTargetHeat } from "@/lib/scoring/heat-v3";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

/**
 * POST /api/tasks/[id]/heat - Apply heat (Heat V3)
 *
 * Behavior (Heat V3):
 * - Context-aware: Calculates boost to move task up 1 position
 * - Updates heatAdjustment (capped at ±45 pts)
 * - Updates last_heat_touched_at and last_touched_at
 * - Recalculates heat immediately
 * - Returns updated task with heat delta and breakdown
 *
 * Request body (optional):
 * - increment?: number - Manual increment override (for context-aware from client)
 * - visibleTasks?: Array<{id, heat}> - For context-aware calculation on server
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
    const { increment, visibleTasks } = body;

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

    // Determine target heat using client-visible heat values
    let contextTasks = Array.isArray(visibleTasks) ? visibleTasks : undefined;

    if (contextTasks && contextTasks.length > 0) {
      const neighborIds = Array.from(new Set(contextTasks.map((t) => t.id))).filter((id) => id !== existingTask.id);
      if (neighborIds.length > 0) {
        const neighborRecords = await taskRepository.findManyByIds(neighborIds, userId);
        const recalculated = await Promise.all(
          neighborRecords.map(async (neighbor) => {
            const freshHeat = calculateHeat(neighbor, now);
            const storedHeat = typeof neighbor.heat === "number" ? neighbor.heat : 0;
            if (!Number.isFinite(storedHeat) || Math.abs(freshHeat - storedHeat) > 0.001) {
              await taskRepository.updateHeat(neighbor.id, freshHeat, userId);
            }
            return { id: neighbor.id, heat: freshHeat };
          })
        );

        const recalculatedMap = new Map(recalculated.map((entry) => [entry.id, entry.heat]));
        contextTasks = contextTasks.map((entry) => {
          const updatedHeat = recalculatedMap.get(entry.id);
          return updatedHeat !== undefined ? { id: entry.id, heat: updatedHeat } : entry;
        });
      }
    }

    if (contextTasks) {
      contextTasks = contextTasks.filter((entry) => entry.id !== existingTask.id);
    }

    const contextCurrentHeat = Number.isFinite(existingTask.heat)
      ? (existingTask.heat as number)
      : calculateHeat(existingTask, now);

    const needsHotterNeighbor =
      !contextTasks ||
      !contextTasks.some((t) => Number.isFinite(t.heat) && t.heat > contextCurrentHeat);

    if (needsHotterNeighbor) {
      const dbTasks = await taskRepository.findAll(userId, {
        includeCompleted: false,
        includeArchived: false,
        includeDeleted: false,
        sortBy: "heat",
        sortOrder: "desc",
        limit: 25,
      });

      const recalculated = await Promise.all(
        dbTasks
          .filter((t) => !t.completedAt)
          .map(async (t) => {
            const freshHeat = calculateHeat(t, now);
            const storedHeat = typeof t.heat === "number" ? t.heat : 0;
            if (!Number.isFinite(storedHeat) || Math.abs(freshHeat - storedHeat) > 0.001) {
              await taskRepository.updateHeat(t.id, freshHeat, userId);
            }
            return { id: t.id, heat: freshHeat };
          })
      );

      contextTasks = recalculated;
    }

    let boostHeatDelta =
      increment !== undefined
        ? Math.min(Math.max(increment, 1), HEAT_CONFIG.MAX_BOOST_PER_CLICK)
        : calculateHeatBoost(
            { heat: contextCurrentHeat, id: existingTask.id },
            contextTasks
          );

    let targetHeat = Math.min(
      Math.max(contextCurrentHeat + boostHeatDelta, HEAT_CONFIG.MIN_FINAL_SCORE),
      HEAT_CONFIG.MAX_FINAL_SCORE
    );

    const hotterNeighbors = (contextTasks ?? [])
      .filter((t) => t.heat > contextCurrentHeat)
      .sort((a, b) => a.heat - b.heat);

    if (hotterNeighbors.length > 0) {
      const nextNeighborHeat = hotterNeighbors[0].heat;
      targetHeat = Math.min(Math.max(nextNeighborHeat + 1, HEAT_CONFIG.MIN_FINAL_SCORE), targetHeat);
      boostHeatDelta = targetHeat - contextCurrentHeat;
    }

    const {
      newAdjustment,
      baselineHeat,
      adjustmentDelta,
    } = resolveAdjustmentForTargetHeat(
      targetHeat,
      {
        importanceV1: existingTask.importanceV1,
        heatAdjustment: decayedAdjustment,
        lastTouchedAt: existingTask.lastTouchedAt,
        lastHeatTouchedAt: existingTask.lastHeatTouchedAt,
      },
      now
    );

    // Update task with new values
    const updatedTask = await taskRepository.update(taskId, {
      heatAdjustment: newAdjustment,
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

    // Calculate deltas
    const heatDelta = newHeat - baselineHeat;

    return NextResponse.json({
      task: finalTask,
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
