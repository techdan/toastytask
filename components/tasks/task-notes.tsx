"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Notebook, NotebookText, NotebookPen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface NoteRowData {
  id: number;
  currentText: string;
  updatedAt: number | Date;
}

interface TaskNotesIconProps {
  taskId: number;
  isExpanded: boolean;
  onToggle: () => void;
  onMetadataLoaded?: (hasContent: boolean, lastModified: Date | null) => void;
}

interface TaskNotesPanelProps {
  taskId: number;
  isExpanded: boolean;
  noteRows: NoteRowData[];
  onNotesLoaded?: (rows: NoteRowData[]) => void;
}

interface TaskNotesProps {
  taskId: number;
  isExpanded: boolean;
  onToggle: () => void;
  onMetadataLoaded?: (hasContent: boolean, lastModified: Date | null) => void;
}

export function TaskNotes({ taskId, isExpanded, onToggle, onMetadataLoaded }: TaskNotesProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [noteRows, setNoteRows] = useState<NoteRowData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [lastModified, setLastModified] = useState<Date | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);

  // Fetch notes metadata on mount to show correct icon state
  useEffect(() => {
    fetchNotesMetadata();
  }, [taskId]);

  // Fetch full notes when expanded
  useEffect(() => {
    if (isExpanded && !isLoading) {
      fetchNotes();
    }
  }, [isExpanded, taskId]);

  const fetchNotesMetadata = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/notes`);
      if (!response.ok) throw new Error("Failed to fetch notes metadata");

      const data = await response.json();
      const text = data.notes.map((n: any) => n.currentText || "").join("\n");

      // Just update the content state and last modified, don't load full text yet
      const hasNoteContent = text.trim().length > 0;
      setHasContent(hasNoteContent);

      let noteLastModified: Date | null = null;
      if (data.notes.length > 0) {
        const mostRecent = data.notes.reduce((latest: any, note: any) => {
          if (!latest) return note;
          const noteTime = typeof note.updatedAt === 'number' ? note.updatedAt * 1000 : new Date(note.updatedAt).getTime();
          const latestTime = typeof latest.updatedAt === 'number' ? latest.updatedAt * 1000 : new Date(latest.updatedAt).getTime();
          return noteTime > latestTime ? note : latest;
        }, null);

        if (mostRecent && mostRecent.updatedAt) {
          const timestamp = typeof mostRecent.updatedAt === 'number' ? mostRecent.updatedAt * 1000 : new Date(mostRecent.updatedAt).getTime();
          noteLastModified = new Date(timestamp);
          setLastModified(noteLastModified);
        }
      }

      // Notify parent component
      onMetadataLoaded?.(hasNoteContent, noteLastModified);
    } catch (error) {
      console.error("Error fetching notes metadata:", error);
    }
  };

  const fetchNotes = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/tasks/${taskId}/notes`);
      if (!response.ok) throw new Error("Failed to fetch notes");

      const data = await response.json();

      // Store individual note rows with metadata
      const rows: NoteRowData[] = data.notes.map((n: any) => ({
        id: n.id,
        currentText: n.currentText || "",
        updatedAt: n.updatedAt,
      }));
      setNoteRows(rows);

      // Combine note lines into a single text for editing
      const text = rows.map(r => r.currentText).join("\n");
      setNotesText(text);

      // Check if there's any content
      setHasContent(text.trim().length > 0);

      // Find the most recent updatedAt from all note rows
      if (rows.length > 0) {
        const mostRecent = rows.reduce((latest, note) => {
          if (!latest) return note;
          const noteTime = typeof note.updatedAt === 'number' ? note.updatedAt * 1000 : new Date(note.updatedAt).getTime();
          const latestTime = typeof latest.updatedAt === 'number' ? latest.updatedAt * 1000 : new Date(latest.updatedAt).getTime();
          return noteTime > latestTime ? note : latest;
        }, rows[0]);

        if (mostRecent && mostRecent.updatedAt) {
          const timestamp = typeof mostRecent.updatedAt === 'number' ? mostRecent.updatedAt * 1000 : new Date(mostRecent.updatedAt).getTime();
          setLastModified(new Date(timestamp));
        }
      } else {
        setLastModified(null);
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: notesText }),
      });

      if (!response.ok) throw new Error("Failed to save notes");

      const data = await response.json();

      // Store updated note rows with metadata
      const rows: NoteRowData[] = data.notes.map((n: any) => ({
        id: n.id,
        currentText: n.currentText || "",
        updatedAt: n.updatedAt,
      }));
      setNoteRows(rows);

      const text = rows.map(r => r.currentText).join("\n");
      setIsEditing(false);

      // Update content state and last modified time
      setHasContent(text.trim().length > 0);
      setLastModified(new Date());

      // Invalidate tasks cache to refetch fresh data (including updated importance)
      // This ensures that if time has passed (e.g., midnight crossed), importance
      // values are recalculated based on current date when tasks refetch
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  };

  const handleBlur = () => {
    const currentText = noteRows.map(r => r.currentText).join("\n");
    if (notesText !== currentText) {
      handleSave();
    } else {
      setIsEditing(false);
    }
  };

  const handleClick = () => {
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  // Format the last modified date for display
  const formatLastModified = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        if (minutes === 0) return 'Just now';
        return `${minutes}m ago`;
      }
      return `${hours}h ago`;
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div
      className="relative shrink-0 flex items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={onToggle}
        className={cn(
          "transition-colors",
          isExpanded ? "text-primary" :
            hasContent ? "text-foreground/70 hover:text-foreground" :
            "text-muted-foreground/40 hover:text-muted-foreground"
        )}
        title={hasContent ? (lastModified ? `Notes (${formatLastModified(lastModified)})` : "Notes") : "Add notes"}
      >
        {isExpanded ? (
          <NotebookPen className="h-4 w-4" />
        ) : hasContent ? (
          <NotebookText className="h-4 w-4" />
        ) : (
          <Notebook className="h-4 w-4" />
        )}
      </button>

      {/* Hover tooltip with last modified date */}
      {isHovered && hasContent && lastModified && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border z-50">
          {formatLastModified(lastModified)}
        </div>
      )}
    </div>
  );
}

// Separate component for the notes panel
export function TaskNotesPanel({ taskId }: { taskId: number }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [noteRows, setNoteRows] = useState<NoteRowData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchNotes();
  }, [taskId]);

  const fetchNotes = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/tasks/${taskId}/notes`);
      if (!response.ok) throw new Error("Failed to fetch notes");

      const data = await response.json();

      const rows: NoteRowData[] = data.notes.map((n: any) => ({
        id: n.id,
        currentText: n.currentText || "",
        updatedAt: n.updatedAt,
      }));
      setNoteRows(rows);

      const text = rows.map(r => r.currentText).join("\n");
      setNotesText(text);
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: notesText }),
      });

      if (!response.ok) throw new Error("Failed to save notes");

      const data = await response.json();

      const rows: NoteRowData[] = data.notes.map((n: any) => ({
        id: n.id,
        currentText: n.currentText || "",
        updatedAt: n.updatedAt,
      }));
      setNoteRows(rows);
      setIsEditing(false);

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  };

  const handleBlur = () => {
    const currentText = noteRows.map(r => r.currentText).join("\n");
    if (notesText !== currentText) {
      handleSave();
    } else {
      setIsEditing(false);
    }
  };

  const handleClick = () => {
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  const formatLastModified = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        if (minutes === 0) return 'Just now';
        return `${minutes}m ago`;
      }
      return `${hours}h ago`;
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/20">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notes...</p>
      ) : isEditing ? (
        <Textarea
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          onBlur={handleBlur}
          className="min-h-[100px] resize-y bg-transparent text-sm"
          placeholder="Add notes here..."
          autoFocus
        />
      ) : (
        <div className="min-h-[60px] cursor-text" onClick={handleClick}>
          {noteRows.length > 0 ? (
            <div className="space-y-0">
              {noteRows.map((row, index) => {
                const updatedDate = typeof row.updatedAt === 'number'
                  ? new Date(row.updatedAt * 1000)
                  : new Date(row.updatedAt);

                return (
                  <div
                    key={row.id}
                    className="group/line relative py-1 hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20 transition-colors"
                    onMouseEnter={() => setHoveredLineIndex(index)}
                    onMouseLeave={() => setHoveredLineIndex(null)}
                  >
                    <div className="text-sm pr-32">{row.currentText || "\u00A0"}</div>

                    {/* Last modified date on hover - right edge */}
                    {hoveredLineIndex === index && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted/80 px-2 py-0.5 rounded">
                        {formatLastModified(updatedDate)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Click to add notes...</span>
          )}
        </div>
      )}
    </div>
  );
}
