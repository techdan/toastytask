"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TaskNotesProps {
  taskId: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function TaskNotes({ taskId, isExpanded, onToggle }: TaskNotesProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch notes when expanded
  useEffect(() => {
    if (isExpanded && !isLoading) {
      fetchNotes();
    }
  }, [isExpanded, taskId]);

  const fetchNotes = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/tasks/${taskId}/notes`);
      if (!response.ok) throw new Error("Failed to fetch notes");

      const data = await response.json();

      // Combine note lines into a single text
      const text = data.notes.map((n: any) => n.currentText || "").join("\n");
      setNotesText(text);
      setDisplayText(text);
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
      const text = data.notes.map((n: any) => n.currentText || "").join("\n");
      setDisplayText(text);
      setIsEditing(false);

      // Invalidate tasks cache to refetch fresh data (including updated importance)
      // This ensures that if time has passed (e.g., midnight crossed), importance
      // values are recalculated based on current date when tasks refetch
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.error("Error saving notes:", error);
    }
  };

  const handleBlur = () => {
    if (notesText !== displayText) {
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

  return (
    <>
      {/* Notes Toggle Icon */}
      <button
        onClick={onToggle}
        className={cn(
          "shrink-0 transition-colors",
          isExpanded ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
        )}
        title="Notes"
      >
        <FileText className="h-4 w-4" />
      </button>

      {/* Notes Panel */}
      {isExpanded && (
        <div className="col-span-full mt-2 rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/20">
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
            <div
              onClick={handleClick}
              className="min-h-[60px] cursor-text whitespace-pre-wrap text-sm"
            >
              {displayText || (
                <span className="text-muted-foreground">Click to add notes...</span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
