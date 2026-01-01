/**
 * Notes hooks for offline-first notes management
 *
 * Provides useSaveNotes hook for updating task notes with:
 * - Optimistic local updates
 * - Automatic sync queueing
 * - React Query cache invalidation
 */

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NoteRowDTO } from "@toasty/contracts";
import { useLocalDatabase } from "./useLocalDatabase";
import { NotesMutations } from "@/lib/mutations";

interface SaveNotesParams {
  taskId: number;
  text: string;
}

/**
 * Hook to save notes for a task
 * Returns a mutation function that:
 * 1. Saves notes locally to SQLite
 * 2. Queues the save operation for sync
 * 3. Invalidates relevant queries
 */
export function useSaveNotes() {
  const { database, outbox } = useLocalDatabase();
  const queryClient = useQueryClient();

  const notesMutations = useMemo(() => {
    if (!database || !outbox) return null;
    return new NotesMutations({ database, outbox });
  }, [database, outbox]);

  return useMutation({
    mutationFn: async ({ taskId, text }: SaveNotesParams): Promise<NoteRowDTO[]> => {
      if (!notesMutations) {
        throw new Error("Database not ready");
      }
      return notesMutations.saveNotes(taskId, text);
    },
    onSuccess: (_notes, { taskId }) => {
      // Invalidate task query to refresh notes in UI
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      // Also invalidate tasks list in case it shows note counts
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/**
 * Hook to get notes text for a task
 */
export function useNotesText(taskId: number): string {
  const { database } = useLocalDatabase();

  return useMemo(() => {
    if (!database || !taskId) return "";
    const notes = database.getNotesForTask(taskId);
    return notes.map((n) => n.currentText).join("\n");
  }, [database, taskId]);
}
