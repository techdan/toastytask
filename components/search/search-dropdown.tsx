"use client";

import { useRef, useEffect } from "react";
import { FileText, StickyNote } from "lucide-react";
import type { SearchResult } from "@/lib/search/search-utils";

interface SearchDropdownProps {
  results: SearchResult[];
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
  maxResults?: number;
}

export function SearchDropdown({
  results,
  isOpen,
  onClose,
  onSelectResult,
  maxResults = 10,
}: SearchDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const displayedResults = results.slice(0, maxResults);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || displayedResults.length === 0) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
    >
      <div className="p-2">
        {displayedResults.map((result, index) => (
          <button
            key={`${result.type}-${result.taskId}-${result.noteId || index}`}
            onClick={() => onSelectResult(result)}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors flex items-start gap-3 group"
          >
            <div className="flex-shrink-0 mt-0.5">
              {result.type === "task" ? (
                <FileText className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              ) : (
                <StickyNote className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-sm font-medium truncate"
                  dangerouslySetInnerHTML={{ __html: result.type === "task" ? result.highlightedText : result.taskTitle }}
                />
                {result.projectName && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {result.projectName}
                  </span>
                )}
              </div>
              {result.type === "note" && result.context && (
                <div
                  className="text-xs text-muted-foreground line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: result.highlightedText }}
                />
              )}
            </div>
          </button>
        ))}
      </div>

      {results.length > maxResults && (
        <div className="border-t border-border p-2 text-center">
          <span className="text-xs text-muted-foreground">
            Showing {maxResults} of {results.length} results
          </span>
        </div>
      )}
    </div>
  );
}
