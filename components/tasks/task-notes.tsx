"use client";

import { useState, useEffect, useRef } from "react";
import { Notebook, NotebookText, NotebookPen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useNotesQuery, useSaveNotes, type NoteRowData } from "@/lib/queries";

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
  notesCount?: number;
  notesLastModified?: Date | null;
}

export function TaskNotes({ taskId, isExpanded, onToggle, notesCount = 0, notesLastModified = null }: TaskNotesProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Derive metadata from task props (passed from API)
  const hasContent = notesCount > 0;
  // Convert to Date object if it's not already (handles serialization from API)
  const lastModifiedDate = notesLastModified
    ? notesLastModified instanceof Date
      ? notesLastModified
      : new Date(notesLastModified)
    : null;

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
        title={hasContent ? (lastModifiedDate ? `Notes (${formatLastModified(lastModifiedDate)})` : "Notes") : "Add notes"}
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
      {isHovered && hasContent && lastModifiedDate && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border z-50">
          {formatLastModified(lastModifiedDate)}
        </div>
      )}
    </div>
  );
}

// Separate component for the notes panel
export function TaskNotesPanel({ taskId }: { taskId: number }) {
  const [isEditing, setIsEditing] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);

  // Use query hook for fetching notes with caching
  const { data: noteRows = [], isLoading } = useNotesQuery(taskId, true);

  // Use mutation hook for saving notes
  const saveNotesMutation = useSaveNotes();

  // Sync notesText with fetched noteRows when data changes
  useEffect(() => {
    if (noteRows.length > 0 && !isEditing) {
      const text = noteRows.map(r => r.currentText || "").join("\n");
      setNotesText(text);
    }
  }, [noteRows, isEditing]);

  const handleSave = () => {
    saveNotesMutation.mutate(
      { taskId, text: notesText },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
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
