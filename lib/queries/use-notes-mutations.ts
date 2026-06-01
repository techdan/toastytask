import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import type { NoteRowData } from "./use-notes-query";
import { diffNoteLines, trimTrailingBlanks, defaultNormalize } from "@/lib/notes/diff-note-lines";
import { PRIMARY_TASKS_QUERY_KEY } from "./task-query-keys";
import type { Task } from "@/types";

export interface SaveNotesData {
  taskId: number;
  text: string;
}

export interface NotesResponse {
  notes: NoteRowData[];
  notesCount: number;
  notesLastModified: string | null;
}

// Save notes
export async function saveNotes({ taskId, text }: SaveNotesData): Promise<NotesResponse> {
  const response = await fetch(`/api/tasks/${taskId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("Failed to save notes");
  }

  const data: NotesResponse = await response.json();
  return data;
}

function buildOptimisticNotes(previousNotes: NoteRowData[] | undefined, text: string): NoteRowData[] {
  if (text.trim() === "") {
    return [];
  }

  const now = new Date();
  const nextLines = trimTrailingBlanks(text.split("\n"));
  const oldLines = (previousNotes ?? []).map(r => r.currentText ?? "");
  const { ops } = diffNoteLines(oldLines, nextLines, { normalize: defaultNormalize });
  const optimisticNotes: NoteRowData[] = [];

  for (const op of ops) {
    if (op.op === "equal") {
      const row = previousNotes?.[op.oldIndex];
      if (row) {
        optimisticNotes[op.newIndex] = { ...row };
      }
    } else if (op.op === "replace") {
      const row = previousNotes?.[op.oldIndex];
      const newText = nextLines[op.newIndex];
      optimisticNotes[op.newIndex] = row
        ? {
          ...row,
          currentText: newText,
          updatedAt: now,
          ordinal: row.ordinal,
        }
        : {
          id: -1000000 - op.newIndex,
          currentText: newText,
          updatedAt: now,
          ordinal: op.newIndex,
        };
    } else if (op.op === "insert") {
      const newText = nextLines[op.newIndex];
      optimisticNotes[op.newIndex] = {
        id: -1000000 - op.newIndex,
        currentText: newText,
        updatedAt: now,
        ordinal: op.newIndex,
      };
    }
  }

  return optimisticNotes.filter(n => n !== undefined);
}

export function applyOptimisticNotesText(
  queryClient: QueryClient,
  taskId: number,
  text: string
): NoteRowData[] {
  const previousNotes = queryClient.getQueryData<NoteRowData[]>(["notes", taskId]);
  const optimisticNotes = buildOptimisticNotes(previousNotes, text);
  const notesLastModified = optimisticNotes.length > 0 ? new Date() : null;

  queryClient.setQueryData(["notes", taskId], optimisticNotes);
  queryClient.setQueryData<Task[] | undefined>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
    if (!oldTasks || !Array.isArray(oldTasks)) {
      return oldTasks;
    }

    let didUpdate = false;
    const next = oldTasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      didUpdate = true;
      return {
        ...task,
        notes: optimisticNotes,
        notesCount: optimisticNotes.length,
        notesLastModified,
      };
    });

    return didUpdate ? next : oldTasks;
  });

  return optimisticNotes;
}

export function applyNotesResponseToCache(
  queryClient: QueryClient,
  taskId: number,
  data: NotesResponse
) {
  queryClient.setQueryData(["notes", taskId], data.notes);
  queryClient.setQueryData<Task[] | undefined>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
    if (!oldTasks || !Array.isArray(oldTasks)) {
      return oldTasks;
    }

    let didUpdate = false;
    const next = oldTasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      didUpdate = true;
      return {
        ...task,
        notes: data.notes,
        notesCount: data.notesCount,
        notesLastModified: data.notesLastModified ? new Date(data.notesLastModified) : null,
      };
    });

    return didUpdate ? next : oldTasks;
  });
}

// Hook: Save notes with optimistic updates
export function useSaveNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveNotes,
    // Optimistically update the cache before the mutation completes
    onMutate: async ({ taskId, text }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ["notes", taskId] });

      // Snapshot the previous value
      const previousNotes = queryClient.getQueryData<NoteRowData[]>(["notes", taskId]);

      applyOptimisticNotesText(queryClient, taskId, text);

      // Return context with the previous value for rollback
      return { previousNotes };
    },
    onSuccess: (data, variables) => {
      applyNotesResponseToCache(queryClient, variables.taskId, data);
    },
    onError: (error, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousNotes) {
        queryClient.setQueryData(["notes", variables.taskId], context.previousNotes);
      }
      toast.error("Failed to save notes", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}
