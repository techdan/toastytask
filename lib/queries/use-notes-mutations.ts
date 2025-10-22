import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NoteRowData } from "./use-notes-query";

interface SaveNotesData {
  taskId: number;
  text: string;
}

interface NotesResponse {
  notes: NoteRowData[];
}

// Save notes
async function saveNotes({ taskId, text }: SaveNotesData): Promise<NoteRowData[]> {
  const response = await fetch(`/api/tasks/${taskId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("Failed to save notes");
  }

  const data: NotesResponse = await response.json();
  return data.notes;
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

      // Optimistically update the cache with the new text
      const lines = text.split("\n");
      const optimisticNotes: NoteRowData[] = lines.map((line, index) => ({
        id: previousNotes?.[index]?.id ?? index, // Keep existing IDs or use index temporarily
        currentText: line,
        updatedAt: new Date(), // Set to current time
      }));

      queryClient.setQueryData(["notes", taskId], optimisticNotes);

      // Return context with the previous value for rollback
      return { previousNotes };
    },
    onSuccess: (data, variables) => {
      // Set the actual server response data
      queryClient.setQueryData(["notes", variables.taskId], data);

      // Invalidate and refetch tasks cache to update notesCount and notesLastModified
      queryClient.invalidateQueries({
        queryKey: ["tasks"],
        refetchType: 'active' // Force active queries to refetch immediately
      });
    },
    onError: (err, variables, context) => {
      // Rollback to previous value on error
      if (context?.previousNotes) {
        queryClient.setQueryData(["notes", variables.taskId], context.previousNotes);
      }
    },
  });
}
