import { useQuery } from "@tanstack/react-query";

export interface NoteRowData {
  id: number;
  currentText: string;
  updatedAt: number | Date;
}

interface NotesResponse {
  notes: NoteRowData[];
}

async function fetchNotes(taskId: number): Promise<NoteRowData[]> {
  const response = await fetch(`/api/tasks/${taskId}/notes`);

  if (!response.ok) {
    throw new Error("Failed to fetch notes");
  }

  const data: NotesResponse = await response.json();
  return data.notes;
}

export function useNotesQuery(taskId: number, enabled: boolean = true) {
  return useQuery({
    queryKey: ["notes", taskId],
    queryFn: () => fetchNotes(taskId),
    enabled, // Only fetch when enabled (e.g., when notes panel is expanded)
    // Notes are less critical than tasks - don't refetch on every window focus
    refetchOnWindowFocus: false,
    // Cache notes for longer since they don't change as frequently
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
