import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository } from "@/lib/db/repositories";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// POST /api/tasks/[id]/complete - Complete a task (handles recurring tasks)
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

    // Use the repository's complete method which handles recurrence logic
    const task = await taskRepository.complete(taskId, userId);

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Failed to complete task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete task" },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id]/complete - Uncomplete a task
export async function DELETE(
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

    // Use the repository's uncomplete method
    const task = await taskRepository.uncomplete(taskId, userId);

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Failed to uncomplete task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to uncomplete task" },
      { status: 500 }
    );
  }
}
