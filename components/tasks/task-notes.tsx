"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Notebook, NotebookText, NotebookPen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useNotesQuery, useSaveNotes, type NoteRowData } from "@/lib/queries";

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const formatNoteRelativeTime = (date: Date) => {
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  // Clamp future timestamps (optimistic writes, clock skew) to "now"
  const diff = Math.max(0, Date.now() - timestamp);
  const days = Math.floor(diff / MS_PER_DAY);

  if (days === 0) {
    const hours = Math.floor(diff / MS_PER_HOUR);
    if (hours === 0) {
      const minutes = Math.floor(diff / MS_PER_MINUTE);
      if (minutes === 0) return "Just now";
      return `${minutes}m ago`;
    }
    return `${hours}h ago`;
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString();
};

interface TaskNotesProps {
  taskId: number;
  isExpanded: boolean;
  onToggle: () => void;
  notesCount?: number;
  notesLastModified?: Date | null;
}

export function TaskNotes({ taskId, isExpanded, onToggle, notesCount = 0, notesLastModified = null }: TaskNotesProps) {
  const [isHovered, setIsHovered] = useState(false);
  const queryClient = useQueryClient();

  // Prefer local cache for instant UX after edits
  const cachedNotes = queryClient.getQueryData<NoteRowData[]>(["notes", taskId]) || [];
  const hasLocalNotes = cachedNotes.length > 0;

  // Derive metadata from task props (passed from API)
  const hasContent = hasLocalNotes || notesCount > 0;
  // Convert to Date object if it's not already (handles serialization from API)
  const lastModifiedDate = notesLastModified
    ? notesLastModified instanceof Date
      ? notesLastModified
      : new Date(notesLastModified)
    : null;

  // If cache has notes, prefer the latest updatedAt from cache for hover text
  const cachedLastModified = hasLocalNotes
    ? cachedNotes.reduce<Date | null>((acc, n) => {
      const d = n.updatedAt instanceof Date ? n.updatedAt : new Date(n.updatedAt);
      return !acc || d > acc ? d : acc;
    }, null)
    : null;

  return (
    <div
      className="relative shrink-0 flex items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={onToggle}
        className={cn(
          "transition-colors cursor-pointer",
          isExpanded ? "text-primary" :
            hasContent ? "text-foreground/70 hover:text-foreground" :
              "text-muted-foreground/40 hover:text-muted-foreground"
        )}
        title={hasContent
          ? ((cachedLastModified || lastModifiedDate)
            ? `Notes (${formatNoteRelativeTime(cachedLastModified || (lastModifiedDate as Date))})`
            : "Notes")
          : "Add notes"}
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
          {formatNoteRelativeTime(lastModifiedDate)}
        </div>
      )}
    </div>
  );
}

// Separate component for the notes panel
export function TaskNotesPanel({
  taskId,
  initialNotes,
  isCompleted = false,
}: {
  taskId: number;
  initialNotes?: NoteRowData[];
  isCompleted?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchParams = useSearchParams();
  const showDebug = (searchParams.get("DEBUG") || "").toLowerCase() === "true";

  // Auto-resize textarea based on content (JS fallback for field-sizing: content)
  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = "auto";
    // Set height to scrollHeight (content height)
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  // Use query hook for fetching notes with caching
  // If initialNotes are provided (from task cache), use them for instant display
  const { data: noteRows = initialNotes || [], isLoading } = useNotesQuery(taskId, true, initialNotes);

  // Use mutation hook for saving notes
  const saveNotesMutation = useSaveNotes();

  // Sync notesText with fetched noteRows when data changes
  useEffect(() => {
    if (noteRows.length > 0 && !isEditing) {
      const text = noteRows.map(r => r.currentText || "").join("\n");
      setNotesText(text);
    }
  }, [noteRows, isEditing]);

  // Auto-resize when entering edit mode or when text changes
  useEffect(() => {
    if (isEditing) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(autoResize);
    }
  }, [isEditing, notesText, autoResize]);

  const handleSave = () => {
    // Optimistically exit edit mode immediately for snappy UX
    setIsEditing(false);

    // Save to server with optimistic update
    saveNotesMutation.mutate({ taskId, text: notesText });
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

  // Convert plain text to React nodes with clickable links
  const linkifyText = (text: string) => {
    if (!text) return ["\u00A0"] as ReactNode[];
    const nodes: ReactNode[] = [];
    const urlRegex = /(https?:\/\/[^\s<>")\]}]+)([)\]}.,!?;:]*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      const [full, url, trailing = ""] = match;
      const start = match.index;
      const end = start + full.length;

      if (start > lastIndex) {
        nodes.push(text.slice(lastIndex, start));
      }

      // Stop click bubbling so clicking a link doesn't enter edit mode
      nodes.push(
        <a
          key={`${start}-${end}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline text-blue-600 dark:text-blue-300 hover:opacity-90"
        >
          {url}
        </a>
      );

      if (trailing) nodes.push(trailing);
      lastIndex = end;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes.length > 0 ? nodes : [text];
  };

  const noteTextClass = cn(
    "text-sm leading-5 pr-32",
    isCompleted
      ? "text-muted-foreground italic line-through"
      : "text-gray-800 dark:text-gray-200"
  );

  const placeholderClass = cn(
    "text-sm",
    isCompleted
      ? "text-muted-foreground italic line-through"
      : "text-gray-600 dark:text-gray-400"
  );

  return (
    <div className="mt-0 rounded bg-[#FFFACD] dark:bg-[#6b5d4f] p-3 shadow-sm dark:shadow-[0_1px_3px_rgba(120,53,15,0.3)]">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notes...</p>
      ) : isEditing ? (
        <Textarea
          ref={textareaRef}
          value={notesText}
          onChange={(e) => {
            setNotesText(e.target.value);
            autoResize();
          }}
          onBlur={handleBlur}
          className="min-h-[100px] resize-none overflow-hidden bg-transparent text-sm leading-5 border-0 focus-visible:ring-0 text-gray-800 dark:text-gray-200"
          placeholder="Add notes here..."
          autoFocus
        />
      ) : (
        <div className="min-h-[60px] cursor-pointer" onClick={handleClick}>
          {noteRows.length > 0 ? (
            <div className="space-y-0">
              {noteRows.map((row, index) => {
                const updatedDate = new Date(row.updatedAt);

                return (
                  <div
                    key={row.id}
                    className="group/line relative hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    onMouseEnter={() => setHoveredLineIndex(index)}
                    onMouseLeave={() => setHoveredLineIndex(null)}
                  >
                    <div className={noteTextClass}>
                      {linkifyText(row.currentText || "\u00A0")} {showDebug && typeof row.ordinal === 'number' && (
                        <span className="text-xs text-muted-foreground">[ord {row.ordinal}]</span>
                      )}
                    </div>

                    {/* Last modified date on hover - right edge */}
                    {hoveredLineIndex === index && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted/80 px-2 py-0.5 rounded">
                        {formatNoteRelativeTime(updatedDate)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <span className={placeholderClass}>Click to add notes...</span>
          )}
        </div>
      )}
    </div>
  );
}
