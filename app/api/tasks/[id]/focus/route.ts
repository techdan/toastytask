import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabase } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";

// Force Node.js runtime for PostgreSQL compatibility
export const runtime = 'nodejs';

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

  // Parse optional body to allow explicit enable/disable
  let enable: boolean | undefined;
  try {
    const body = await request.json();
    enable = body.enable;
  } catch {
    // No body or invalid JSON - will toggle
  }

  // Toggle focus state (or set explicitly if provided)
  const newIsFocused = typeof enable === "boolean" ? enable : !task.isFocused;

  // Update task - always clear snooze when toggling focus
  const now = new Date();
  const [updatedTask] = await db
    .update(tasks)
    .set({
      isFocused: newIsFocused,
      focusSnoozeUntil: null,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  // Recalculate heat since focus affects scoring
  const freshImportance = calculateImportanceV1(updatedTask);
  const newHeat = calculateHeat(updatedTask, now, freshImportance);

  await db
    .update(tasks)
    .set({ heat: newHeat })
    .where(eq(tasks.id, taskId));

  return NextResponse.json({
    task: { ...updatedTask, heat: newHeat },
    isFocused: newIsFocused,
  });
}
