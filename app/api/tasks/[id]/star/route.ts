import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { STAR_CONFIG } from "@/lib/scoring/heat-config";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

/**
 * POST /api/tasks/[id]/star - Cycle star level (Heat V3)
 *
 * Behavior (Heat V3):
 * - Cycles through star levels: 0 (none) → 1 (blue) → 2 (yellow) → 3 (orange) → 0
 * - Updates starLevel field
 * - Recalculates importance (star affects base importance)
 * - Recalculates heat (importance is a component)
 * - Returns updated task with old and new star levels
 *
 * Star levels:
 * - 0: None (gray) = +0 to base importance
 * - 1: Blue = +1 to base importance
 * - 2: Yellow = +2 to base importance
 * - 3: Orange = +3 to base importance
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }

    const payload = typeof body === "object" && body !== null ? body as Record<string, unknown> : undefined;

    // Parse optional target star level (defaults to "cycle once" for backwards compatibility)
    const requestedTargetLevel =
      typeof payload?.targetLevel === "number" && Number.isFinite(payload.targetLevel)
        ? Math.min(STAR_CONFIG.MAX_LEVEL, Math.max(0, Math.round(payload.targetLevel)))
        : undefined;

    const requestedIntentVersion =
      typeof payload?.intentVersion === "number" && Number.isFinite(payload.intentVersion)
        ? Math.trunc(payload.intentVersion)
        : undefined;

    // Get existing task
    const existingTask = await taskRepository.findById(taskId, userId);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Get current star level (default to 0 if not set)
    const oldStarLevel = existingTask.starLevel ?? 0;

    const existingIntentVersion = existingTask.starIntentVersion ?? 0;

    // Determine target level: prefer caller-provided level, otherwise cycle once
    const newStarLevel =
      typeof requestedTargetLevel === "number"
        ? requestedTargetLevel
        : (oldStarLevel + 1) % (STAR_CONFIG.MAX_LEVEL + 1);

    const effectiveIntentVersion =
      typeof requestedIntentVersion === "number" ? requestedIntentVersion : Date.now();

    if (
      typeof requestedIntentVersion === "number" &&
      requestedIntentVersion < existingIntentVersion
    ) {
      // Ignore stale request - client already has newer intent applied
      return NextResponse.json({
        task: existingTask,
        oldStarLevel,
        newStarLevel: existingTask.starLevel ?? oldStarLevel,
        starPoints: STAR_CONFIG.POINTS[(existingTask.starLevel ?? 0) as keyof typeof STAR_CONFIG.POINTS],
        skipped: true,
      });
    }

    // Update task with new star level
    const now = new Date();
    const updatedTask = await taskRepository.update(taskId, {
      starLevel: newStarLevel,
      // Update lastTouchedAt (but NOT lastHeatTouchedAt - star is not a heat action)
      lastTouchedAt: now,
      starIntentVersion: effectiveIntentVersion,
    }, userId);

    // Calculate fresh importance (for heat calculation only - not persisted)
    // Pure calculation architecture: importance is not stored, only calculated
    const newImportance = calculateImportanceV1({
      priority: updatedTask.priority,
      dueAt: updatedTask.dueAt,
      starLevel: newStarLevel,
    }, now);

    // Recalculate heat using fresh importance
    const newHeat = calculateHeat({
      heatAdjustment: updatedTask.heatAdjustment || 0,
      lastTouchedAt: updatedTask.lastTouchedAt,
      lastHeatTouchedAt: updatedTask.lastHeatTouchedAt,
    }, now, newImportance);

    // Update heat in database
    await taskRepository.updateHeat(taskId, newHeat, userId);

    // Get final task with all updates
    const finalTask = await taskRepository.findById(taskId, userId);
    if (!finalTask) {
      return NextResponse.json({ error: "Task not found after update" }, { status: 404 });
    }

    return NextResponse.json({
      task: finalTask,
      oldStarLevel,
      newStarLevel,
      starPoints: STAR_CONFIG.POINTS[newStarLevel as keyof typeof STAR_CONFIG.POINTS],
    });
  } catch (error) {
    console.error("Failed to cycle star level:", error);
    return NextResponse.json({ error: "Failed to cycle star level" }, { status: 500 });
  }
}
