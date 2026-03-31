import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, gt, and, asc, inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import { tasks, projects, noteRows, noteRowVersions } from "@/lib/db/schema";
import { settingsRepository } from "@/lib/db/repositories";
import type { Task, Project, Settings } from "@/lib/db/schema";
import type { TaskDTO, ProjectDTO, NoteRowDTO, SettingsDTO, SyncPullResponse } from "@toasty/contracts";

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

function settingsToDTO(s: Settings): SettingsDTO {
  return {
    id: s.id,
    userId: s.userId ?? null,
    defaultPriority: s.defaultPriority as SettingsDTO["defaultPriority"],
    defaultBucket: s.defaultBucket as SettingsDTO["defaultBucket"],
    defaultDueDate: s.defaultDueDate as SettingsDTO["defaultDueDate"],
    heatDecayHalfLifeTodo: s.heatDecayHalfLifeTodo,
    heatDecayHalfLifeWatch: s.heatDecayHalfLifeWatch,
    heatDecayHalfLifeLater: s.heatDecayHalfLifeLater,
    activityNormalizationConstant: s.activityNormalizationConstant,
    newTaskHeatBoost: s.newTaskHeatBoost,
    newTaskHeatHalfLife: s.newTaskHeatHalfLife,
    escalationThreshold: s.escalationThreshold,
    deEscalationThresholdTodoWatch: s.deEscalationThresholdTodoWatch,
    deEscalationThresholdWatchLater: s.deEscalationThresholdWatchLater,
    retirementThreshold: s.retirementThreshold,
    retirementDays: s.retirementDays,
    reviewCadenceWatch: s.reviewCadenceWatch,
    reviewCadenceLater: s.reviewCadenceLater,
    groupingMode: s.groupingMode as SettingsDTO["groupingMode"],
    sortMode: s.sortMode as SettingsDTO["sortMode"],
    updatedAt: s.updatedAt.toISOString(),
  };
}

// GET /api/sync/pull?since=<cursor>&limit=<n>
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sinceStr = searchParams.get("since") ?? "";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "500", 10), 1000);

    // Empty string = initial sync; use epoch so all records are returned
    const since = sinceStr ? new Date(sinceStr) : new Date(0);
    const now = new Date();

    const db = getDatabase();

    // Tasks: include soft-deleted records as tombstones; paginate by limit
    const updatedTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), gt(tasks.updatedAt, since)))
      .orderBy(asc(tasks.updatedAt))
      .limit(limit + 1); // fetch one extra to detect hasMore

    const hasMore = updatedTasks.length > limit;
    const tasksPage = hasMore ? updatedTasks.slice(0, limit) : updatedTasks;

    // Projects: typically a small set, no sub-pagination needed
    const updatedProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), gt(projects.updatedAt, since)));

    // Notes: fetch ALL current notes for tasks that changed in this page.
    // Using task IDs (not note updatedAt) means hard-deleted notes are absent,
    // so the mobile can replace the note set for each changed task wholesale.
    const changedTaskIds = tasksPage.map((t) => t.id);
    const updatedNotes =
      changedTaskIds.length > 0
        ? await db
            .select({
              id: noteRows.id,
              taskId: noteRows.taskId,
              ordinal: noteRows.ordinal,
              createdAt: noteRows.createdAt,
              updatedAt: noteRows.updatedAt,
              currentText: noteRowVersions.text,
            })
            .from(noteRows)
            .innerJoin(tasks, eq(noteRows.taskId, tasks.id))
            .leftJoin(noteRowVersions, eq(noteRowVersions.id, noteRows.activeVersionId))
            .where(and(eq(tasks.userId, userId), inArray(noteRows.taskId, changedTaskIds)))
        : [];

    // Settings: always include on initial sync, otherwise only if changed
    const userSettings = await settingsRepository.get(userId);
    const includeSettings = !sinceStr || userSettings.updatedAt > since;

    // Cursor for next sync:
    //   hasMore=true  → use last task's updatedAt (continue pagination)
    //   hasMore=false → use current server time (start of next incremental sync)
    const cursor =
      hasMore && tasksPage.length > 0
        ? tasksPage[tasksPage.length - 1].updatedAt.toISOString()
        : now.toISOString();

    const response: SyncPullResponse = {
      entities: {
        tasks: tasksPage.map(taskToDTO),
        projects: updatedProjects.map(projectToDTO),
        notes: updatedNotes.map(
          (note): NoteRowDTO => ({
            id: note.id,
            taskId: note.taskId,
            ordinal: note.ordinal,
            currentText: note.currentText ?? "",
            createdAt: note.createdAt.toISOString(),
            updatedAt: note.updatedAt.toISOString(),
          })
        ),
        settings: includeSettings ? settingsToDTO(userSettings) : undefined,
      },
      // Tell the mobile which task IDs had their notes fully refreshed so it
      // can replace (not merge) local notes, correctly removing deleted lines.
      noteTaskIds: changedTaskIds,
      cursor,
      hasMore,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Sync pull failed:", error);
    return NextResponse.json({ error: "Sync pull failed" }, { status: 500 });
  }
}
