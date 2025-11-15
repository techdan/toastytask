import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { NoteRowData } from "./use-notes-query";
import { diffNoteLines, trimTrailingBlanks, defaultNormalize } from "@/lib/notes/diff-note-lines";
import { PRIMARY_TASKS_QUERY_KEY } from "./task-query-keys";
import type { Task } from "@/types";

interface SaveNotesData {
  taskId: number;
  text: string;
}

interface NotesResponse {
  notes: NoteRowData[];
  notesCount: number;
  notesLastModified: string | null;
}

// Save notes
async function saveNotes({ taskId, text }: SaveNotesData): Promise<NotesResponse> {
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

      // If text is empty or only whitespace, set to empty array
      if (text.trim() === "") {
        queryClient.setQueryData(["notes", taskId], []);
        return { previousNotes };
      }

      // Optimistically update using smart diff so unchanged lines keep timestamps
      const nextLines = trimTrailingBlanks(text.split("\n"));
      const oldLines = (previousNotes ?? []).map(r => r.currentText ?? "");
      const { ops } = diffNoteLines(oldLines, nextLines, { normalize: defaultNormalize });

      const optimisticNotes: NoteRowData[] = [];
      const usedOld = new Set<number>();

      for (const op of ops) {
        if (op.op === "equal") {
          const row = previousNotes?.[op.oldIndex];
          if (row) {
            optimisticNotes[op.newIndex] = { ...row }; // preserve updatedAt and ordinal as-is for visibility
            usedOld.add(op.oldIndex);
          }
        } else if (op.op === "replace") {
          const row = previousNotes?.[op.oldIndex];
          const newText = nextLines[op.newIndex];
          if (row) {
            optimisticNotes[op.newIndex] = {
              ...row,
              currentText: newText,
              updatedAt: new Date(),
              // keep existing ordinal for visibility during optimism
              ordinal: row.ordinal,
            };
            usedOld.add(op.oldIndex);
          } else {
            optimisticNotes[op.newIndex] = {
              id: -1000000 - op.newIndex, // temporary unique ID
              currentText: newText,
              updatedAt: new Date(),
              ordinal: op.newIndex,
            };
          }
        } else if (op.op === "insert") {
          const newText = nextLines[op.newIndex];
          optimisticNotes[op.newIndex] = {
            // ensure unique temporary ID that won't collide with existing rows
            id: -1000000 - op.newIndex,
            currentText: newText,
            updatedAt: new Date(),
            ordinal: op.newIndex,
          };
        }
      }

      // Deletions are implicit: we simply don't include unused old indices

      // Densify array
      const dense = optimisticNotes.filter(n => n !== undefined);

      queryClient.setQueryData(["notes", taskId], dense);

      // Return context with the previous value for rollback
      return { previousNotes };
    },
    onSuccess: (data, variables) => {
      // Set the actual server response data
      queryClient.setQueryData(["notes", variables.taskId], data.notes);

      // Update cached tasks so counts/metadata stay in sync without a refetch
      queryClient.setQueryData<Task[] | undefined>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) {
          return oldTasks;
        }

        let didUpdate = false;
        const next = oldTasks.map((task) => {
          if (task.id !== variables.taskId) {
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
