import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository, noteRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat, isHeatStale } from "@/lib/scoring/heat-v3";
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
      const pid = projectId === "null" ? null : parseInt(projectId, 10);
      tasks = tasks.filter((task) => task.projectId === pid);
    }

    // Recalculate importance for each task to ensure freshness
    // (values become stale when due dates pass since we only calculate on write)
    const now = new Date();
    tasks = await Promise.all(tasks.map(async (task) => {
      const freshImportance = calculateImportanceV1(task);

      // Always recompute heat using latest data
      const freshHeat = calculateHeat(task, now);
      const storedHeat = typeof task.heat === "number" ? task.heat : 0;
      const requiresUpdate =
        !Number.isFinite(storedHeat) ||
        Math.abs(freshHeat - storedHeat) > 0.0001 ||
        isHeatStale(task.heatCalculatedAt, now);

      if (requiresUpdate) {
        await taskRepository.updateHeat(task.id, freshHeat, userId);
      }

      return {
        ...task,
        importanceV1: freshImportance,
        heat: freshHeat,
        heatCalculatedAt: now,
      };
    }));

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

    // Sort by importance (desc), then due proximity
    tasks.sort((a, b) => {
      // Sort by importance first (higher is better)
      if (b.importanceV1 !== a.importanceV1) {
        return b.importanceV1 - a.importanceV1;
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

    return NextResponse.json({ tasks });
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
      importanceV1: 0, // Will calculate below
    };

    // Calculate importance before saving
    taskData.importanceV1 = calculateImportanceV1(taskData as Parameters<typeof calculateImportanceV1>[0]);

    // Calculate initial heat using V3 algorithm
    const now = new Date();
    taskData.heat = calculateHeat(taskData as Parameters<typeof calculateHeat>[0], now);
    taskData.heatCalculatedAt = now;

    const task = await taskRepository.create(taskData, userId);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
