import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabase } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";

// Force Node.js runtime for PostgreSQL compatibility
export const runtime = 'nodejs';

/**
 * Calculate the next wake time (4:00 AM local time tomorrow)
 */
function getNextWakeTime(now: Date): Date {
  const wake = new Date(now);
  wake.setDate(wake.getDate() + 1);
  wake.setHours(HEAT_CONFIG.SNOOZE_WAKE_HOUR, 0, 0, 0);
  return wake;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  // Get current task
  const db = getDatabase();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Can only snooze focused tasks
  if (!task.isFocused) {
    return NextResponse.json(
      { error: "Can only snooze focused tasks" },
      { status: 400 }
    );
  }

  // Calculate snooze until time
  const now = new Date();
  const snoozeUntil = getNextWakeTime(now);

  // Update task
  const [updatedTask] = await db
    .update(tasks)
    .set({
      focusSnoozeUntil: snoozeUntil,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  // Recalculate heat since snooze affects scoring
  const freshImportance = calculateImportanceV1(updatedTask);
  const newHeat = calculateHeat(updatedTask, now, freshImportance);

  await db
    .update(tasks)
    .set({ heat: newHeat })
    .where(eq(tasks.id, taskId));

  return NextResponse.json({
    task: { ...updatedTask, heat: newHeat },
    snoozeUntil,
  });
}
