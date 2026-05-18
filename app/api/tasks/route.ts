import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository, noteRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import type { NewTask } from "@/types";

// Force Node.js runtime for better-sqlite3 compatibility
export const runtime = 'nodejs';

// GET /api/tasks - List all tasks
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const includeCompleted = searchParams.get("includeCompleted") === "true";

    let tasks = await taskRepository.findAll(userId, {
      includeCompleted,
      includeDeleted: false,
    });

    // Filter by project if specified
    if (projectId !== null) {
      // Acceptable values:
      // - "null"   → filter for tasks with no project
      // - number    → filter for that project id
      // Any other value (e.g., "all", "undefined", "") is treated as "no filter" for resilience
      if (projectId === "null") {
        tasks = tasks.filter((task) => task.projectId === null);
      } else if (projectId.trim().length > 0) {
        const parsed = Number(projectId);
        if (Number.isFinite(parsed)) {
          const pid = parsed;
          tasks = tasks.filter((task) => task.projectId === pid);
        }
        // else: ignore invalid projectId value
      }
    }

    // Calculate importance for heat calculation and sorting
    // Note: We calculate but don't send importanceV1 to client (pure calculation architecture)
    const now = new Date();
    tasks = tasks.map((task) => {
      // Calculate fresh importance (not persisted, only used for heat calculation)
      const freshImportance = calculateImportanceV1(task, now);

      // Always recompute heat using latest importance, but do not persist from
      // the read path. Writing cached heat here triggers the DB updated_at
      // column and makes untouched tasks look recently modified.
      const freshHeat = calculateHeat(task, now, freshImportance);

      // Store calculated importance for sorting (will be removed before sending)
      return {
        ...task,
        _calculatedImportance: freshImportance, // Temporary field for sorting
        heat: freshHeat,
        heatCalculatedAt: now,
      };
    });

    // Fetch all notes for all tasks in one query
    const taskIds = tasks.map(t => t.id);
    const allNotesMap = await noteRepository.getNotesForTasks(taskIds);

    // Attach notes data to each task
    tasks = tasks.map((task) => {
      const taskNotes = allNotesMap.get(task.id) || [];
      const lastModified = taskNotes.length > 0
        ? taskNotes.reduce((latest, note) => {
            const noteTime = new Date(note.updatedAt).getTime();
            const latestTime = new Date(latest.updatedAt).getTime();
            return noteTime > latestTime ? note : latest;
          }, taskNotes[0]).updatedAt
        : null;

      return {
        ...task,
        notes: taskNotes,
        notesCount: taskNotes.length,
        notesLastModified: lastModified ? new Date(lastModified) : null,
      };
    });

    // Sort by calculated importance (desc), then due proximity
    tasks.sort((a, b) => {
      // Sort by importance first (higher is better)
      // @ts-expect-error - _calculatedImportance is a temporary field added above
      if (b._calculatedImportance !== a._calculatedImportance) {
        // @ts-expect-error - _calculatedImportance is a temporary field added above
        return b._calculatedImportance - a._calculatedImportance;
      }

      // Then by due date (earlier is better, nulls last)
      if (a.dueAt && b.dueAt) {
        const aTime = typeof a.dueAt === "number" ? a.dueAt : a.dueAt.getTime();
        const bTime = typeof b.dueAt === "number" ? b.dueAt : b.dueAt.getTime();
        return aTime - bTime;
      }
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;

      // Finally by creation date (newest first)
      const aCreated =
        typeof a.createdAt === "number" ? a.createdAt : a.createdAt.getTime();
      const bCreated =
        typeof b.createdAt === "number" ? b.createdAt : b.createdAt.getTime();
      return bCreated - aCreated;
    });

    // Remove temporary _calculatedImportance field before sending response
    // (Pure calculation architecture: client calculates importance on render)
    const tasksWithoutCalculatedImportance = tasks.map((task) => {
      // @ts-expect-error - _calculatedImportance is a temporary field that we're removing
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _calculatedImportance, ...taskWithoutImportance } = task;
      return taskWithoutImportance;
    });

    return NextResponse.json({ tasks: tasksWithoutCalculatedImportance });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const taskData: NewTask = {
      title: body.title,
      priority: body.priority || "medium",
      bucket: body.bucket || "todo",
      starLevel: body.starLevel ?? 0, // V3: 0=none, 1=blue, 2=yellow, 3=orange
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      projectId: body.projectId || null,
      importanceV1: 0, // DEPRECATED: Will be removed in Phase 2
    };

    // Calculate importance for heat calculation (not persisted)
    const now = new Date();
    const freshImportance = calculateImportanceV1(taskData as Parameters<typeof calculateImportanceV1>[0], now);

    // Calculate initial heat using fresh importance
    taskData.heat = calculateHeat(taskData as Parameters<typeof calculateHeat>[0], now, freshImportance);
    taskData.heatCalculatedAt = now;

    // Note: We don't persist importanceV1 anymore (pure calculation architecture)
    // It will be calculated on the client side from base properties
    const task = await taskRepository.create(taskData, userId);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
