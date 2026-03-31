import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { taskRepository, projectRepository, noteRepository } from "@/lib/db/repositories";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { diffNoteLines, trimTrailingBlanks, defaultNormalize } from "@/lib/notes/diff-note-lines";
import type { SyncOperation, SyncOperationResult, TaskDTO, ProjectDTO } from "@toasty/contracts";
import type { Task, Project } from "@/lib/db/schema";

export const runtime = "nodejs";

function taskToDTO(task: Task): TaskDTO {
  return {
    id: task.id,
    title: task.title,
    projectId: task.projectId ?? null,
    userId: task.userId ?? null,
    priority: task.priority as TaskDTO["priority"],
    bucket: task.bucket as TaskDTO["bucket"],
    starLevel: task.starLevel as TaskDTO["starLevel"],
    starIntentVersion: Number(task.starIntentVersion),
    dueAt: task.dueAt?.toISOString() ?? null,
    repeatType: task.repeatType as TaskDTO["repeatType"],
    repeatRule: task.repeatRule ?? null,
    heat: task.heat,
    heatCalculatedAt: task.heatCalculatedAt?.toISOString() ?? null,
    heatAdjustment: task.heatAdjustment,
    lastHeatTouchedAt: task.lastHeatTouchedAt?.toISOString() ?? null,
    lastTouchedAt: task.lastTouchedAt?.toISOString() ?? null,
    touchCount: task.touchCount,
    importanceV1: task.importanceV1,
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    deletedAt: task.deletedAt?.toISOString() ?? null,
    isFocused: task.isFocused,
    focusSnoozeUntil: task.focusSnoozeUntil?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function projectToDTO(project: Project): ProjectDTO {
  return {
    id: project.id,
    name: project.name,
    colorHex: project.colorHex,
    sortOrder: project.sortOrder,
    archived: project.archived,
    userId: project.userId ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    deletedAt: null,
  };
}

async function processOperation(
  op: SyncOperation,
  userId: string
): Promise<SyncOperationResult> {
  const { idempotencyKey, method, path, body } = op;

  try {
    // POST /api/tasks — create task
    if (method === "POST" && /^\/api\/tasks$/.test(path)) {
      const now = new Date();
      const taskData = {
        title: String(body?.title ?? ""),
        priority: String(body?.priority ?? "medium") as "low" | "medium" | "high" | "top",
        bucket: String(body?.bucket ?? "todo") as "todo" | "watch" | "later",
        starLevel: Number(body?.starLevel ?? 0),
        dueAt: body?.dueAt ? new Date(String(body.dueAt)) : null,
        projectId: body?.projectId ? Number(body.projectId) : null,
        repeatType: String(body?.repeatType ?? "none"),
        repeatRule: body?.repeatRule ? String(body.repeatRule) : null,
        isFocused: Boolean(body?.isFocused ?? false),
        importanceV1: 0,
      };
      const freshImportance = calculateImportanceV1(
        taskData as unknown as Parameters<typeof calculateImportanceV1>[0],
        now
      );
      const freshHeat = calculateHeat(
        taskData as unknown as Parameters<typeof calculateHeat>[0],
        now,
        freshImportance
      );
      const task = await taskRepository.create(
        { ...taskData, heat: freshHeat, heatCalculatedAt: now },
        userId
      );
      return {
        idempotencyKey,
        status: "success",
        clientId: body?.clientId ? String(body.clientId) : undefined,
        serverId: task.id,
        entity: taskToDTO(task),
      };
    }

    // PATCH /api/tasks/:id — update task fields
    let match = path.match(/^\/api\/tasks\/(\d+)$/);
    if (method === "PATCH" && match) {
      const taskId = parseInt(match[1]);
      const updates: Record<string, unknown> = {};
      for (const f of ["title", "priority", "bucket", "repeatType", "repeatRule"]) {
        if (body?.[f] !== undefined) updates[f] = body[f];
      }
      for (const f of ["starLevel", "projectId", "heatAdjustment"]) {
        if (body?.[f] !== undefined) updates[f] = Number(body[f]);
      }
      for (const f of ["isFocused"]) {
        if (body?.[f] !== undefined) updates[f] = Boolean(body[f]);
      }
      for (const f of ["dueAt", "focusSnoozeUntil"]) {
        if (body?.[f] !== undefined) {
          updates[f] = body[f] ? new Date(String(body[f])) : null;
        }
      }
      const task = await taskRepository.update(taskId, updates, userId);
      return { idempotencyKey, status: "success", entity: taskToDTO(task) };
    }

    // DELETE /api/tasks/:id — soft delete
    match = path.match(/^\/api\/tasks\/(\d+)$/);
    if (method === "DELETE" && match) {
      const taskId = parseInt(match[1]);
      await taskRepository.softDelete(taskId, userId);
      return { idempotencyKey, status: "success" };
    }

    // POST /api/tasks/:id/complete — mark complete (handles recurrence)
    match = path.match(/^\/api\/tasks\/(\d+)\/complete$/);
    if (method === "POST" && match) {
      const taskId = parseInt(match[1]);
      const task = await taskRepository.complete(taskId, userId);
      return { idempotencyKey, status: "success", entity: taskToDTO(task) };
    }

    // DELETE /api/tasks/:id/complete — mark incomplete
    match = path.match(/^\/api\/tasks\/(\d+)\/complete$/);
    if (method === "DELETE" && match) {
      const taskId = parseInt(match[1]);
      const task = await taskRepository.uncomplete(taskId, userId);
      return { idempotencyKey, status: "success", entity: taskToDTO(task) };
    }

    // POST /api/tasks/:id/notes — full-text note replacement via diff
    match = path.match(/^\/api\/tasks\/(\d+)\/notes$/);
    if (method === "POST" && match) {
      const taskId = parseInt(match[1]);
      const text = body?.text ? String(body.text) : "";
      const existingNotes = await noteRepository.getNotesForTask(taskId);
      let notesChanged = false;

      if (text.trim() === "") {
        for (const note of existingNotes) {
          await noteRepository.deleteNoteRow(note.id);
          notesChanged = true;
        }
      } else {
        const nextLines = trimTrailingBlanks(text.split("\n"));
        const oldLines = existingNotes.map((r) => r.currentText || "");
        const { ops } = diffNoteLines(oldLines, nextLines, { normalize: defaultNormalize });
        const updatedNotes: typeof existingNotes = [];
        const usedOld = new Set<number>();

        for (const op of ops) {
          if (op.op === "equal") {
            updatedNotes[op.newIndex] = existingNotes[op.oldIndex];
            usedOld.add(op.oldIndex);
          } else if (op.op === "replace") {
            const row = existingNotes[op.oldIndex];
            if (row.currentText !== nextLines[op.newIndex]) {
              updatedNotes[op.newIndex] = await noteRepository.updateNoteRow(
                row.id,
                nextLines[op.newIndex]
              );
              notesChanged = true;
            } else {
              updatedNotes[op.newIndex] = row;
            }
            usedOld.add(op.oldIndex);
          } else if (op.op === "insert") {
            updatedNotes[op.newIndex] = await noteRepository.createNoteRow(
              { taskId, ordinal: op.newIndex, activeVersionId: null },
              nextLines[op.newIndex]
            );
            notesChanged = true;
          }
        }

        for (let i = 0; i < existingNotes.length; i++) {
          if (!usedOld.has(i)) {
            await noteRepository.deleteNoteRow(existingNotes[i].id);
            notesChanged = true;
          }
        }
      }

      if (notesChanged) {
        const touched = await taskRepository.touch(taskId, userId);
        const now = new Date();
        const freshHeat = calculateHeat(touched, now, calculateImportanceV1(touched, now));
        await taskRepository.updateHeat(taskId, freshHeat, userId);
      }

      return { idempotencyKey, status: "success" };
    }

    // POST /api/tasks/:id/heat — increase heat adjustment
    match = path.match(/^\/api\/tasks\/(\d+)\/heat$/);
    if (method === "POST" && match) {
      const taskId = parseInt(match[1]);
      const updates: Record<string, unknown> = { lastHeatTouchedAt: new Date() };
      if (body?.heatAdjustment !== undefined) updates.heatAdjustment = Number(body.heatAdjustment);
      const task = await taskRepository.update(taskId, updates, userId);
      return { idempotencyKey, status: "success", entity: taskToDTO(task) };
    }

    // POST /api/tasks/:id/cool — decrease heat adjustment
    match = path.match(/^\/api\/tasks\/(\d+)\/cool$/);
    if (method === "POST" && match) {
      const taskId = parseInt(match[1]);
      const updates: Record<string, unknown> = { lastHeatTouchedAt: new Date() };
      if (body?.heatAdjustment !== undefined) updates.heatAdjustment = Number(body.heatAdjustment);
      const task = await taskRepository.update(taskId, updates, userId);
      return { idempotencyKey, status: "success", entity: taskToDTO(task) };
    }

    // POST /api/tasks/:id/star — cycle or set star level
    match = path.match(/^\/api\/tasks\/(\d+)\/star$/);
    if (method === "POST" && match) {
      const taskId = parseInt(match[1]);
      let starLevel: number;
      if (body?.starLevel !== undefined) {
        starLevel = Number(body.starLevel);
      } else {
        const existing = await taskRepository.findById(taskId, userId);
        if (!existing) throw new Error("Task not found");
        starLevel = ((existing.starLevel ?? 0) + 1) % 4;
      }
      const task = await taskRepository.update(taskId, { starLevel }, userId);
      return { idempotencyKey, status: "success", entity: taskToDTO(task) };
    }

    // POST /api/tasks/:id/focus — set focus / snooze
    match = path.match(/^\/api\/tasks\/(\d+)\/focus$/);
    if (method === "POST" && match) {
      const taskId = parseInt(match[1]);
      const updates: Record<string, unknown> = {};
      if (body?.isFocused !== undefined) updates.isFocused = Boolean(body.isFocused);
      if (body?.focusSnoozeUntil !== undefined) {
        updates.focusSnoozeUntil = body.focusSnoozeUntil
          ? new Date(String(body.focusSnoozeUntil))
          : null;
      }
      const task = await taskRepository.update(taskId, updates, userId);
      return { idempotencyKey, status: "success", entity: taskToDTO(task) };
    }

    // POST /api/projects — create project
    if (method === "POST" && /^\/api\/projects$/.test(path)) {
      const project = await projectRepository.create(
        {
          name: String(body?.name ?? ""),
          colorHex: body?.colorHex ? String(body.colorHex) : "#6b7280",
        },
        userId
      );
      return {
        idempotencyKey,
        status: "success",
        clientId: body?.clientId ? String(body.clientId) : undefined,
        serverId: project.id,
        entity: projectToDTO(project),
      };
    }

    // PATCH /api/projects/:id — update project
    match = path.match(/^\/api\/projects\/(\d+)$/);
    if (method === "PATCH" && match) {
      const projectId = parseInt(match[1]);
      const updates: Record<string, unknown> = {};
      if (body?.name !== undefined) updates.name = String(body.name);
      if (body?.colorHex !== undefined) updates.colorHex = String(body.colorHex);
      if (body?.archived !== undefined) updates.archived = Boolean(body.archived);
      const project = await projectRepository.update(projectId, updates, userId);
      return { idempotencyKey, status: "success", entity: projectToDTO(project) };
    }

    // DELETE /api/projects/:id — hard delete project
    match = path.match(/^\/api\/projects\/(\d+)$/);
    if (method === "DELETE" && match) {
      const projectId = parseInt(match[1]);
      await projectRepository.delete(projectId, userId);
      return { idempotencyKey, status: "success" };
    }

    return {
      idempotencyKey,
      status: "error",
      code: "UNKNOWN_OPERATION",
      message: `Unsupported operation: ${method} ${path}`,
      retryable: false,
    };
  } catch (error) {
    console.error(`Sync push operation failed [${method} ${path}]:`, error);
    return {
      idempotencyKey,
      status: "error",
      code: "OPERATION_FAILED",
      message: (error as Error).message || "Operation failed",
      retryable: true,
    };
  }
}

// POST /api/sync/push
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const operations: SyncOperation[] = (body.operations ?? []).slice(0, 100);

    // Process sequentially — operations may depend on each other (e.g. create then update)
    const results: SyncOperationResult[] = [];
    for (const op of operations) {
      results.push(await processOperation(op, userId));
    }

    return NextResponse.json({
      results,
      cursor: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sync push failed:", error);
    return NextResponse.json({ error: "Sync push failed" }, { status: 500 });
  }
}
