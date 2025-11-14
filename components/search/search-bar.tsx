"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { debounce } from "@/lib/search/search-utils";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onEnter?: (query: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  initialValue?: string;
}

export function SearchBar({
  onSearch,
  onEnter,
  placeholder = "Search tasks and notes...",
  className = "",
  autoFocus = false,
  initialValue = "",
}: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync when parent-controlled value changes (e.g., route updates)
  useEffect(() => {
    setSearchQuery(initialValue);
  }, [initialValue]);

  // Debounced search callback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      onSearch(query);
    }, 300),
    [onSearch]
  );

  // Handle input change
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = event.target.value;
    setSearchQuery(newQuery);
    debouncedSearch(newQuery);
  };

  // Handle clear button
  const handleClear = useCallback(() => {
    setSearchQuery("");
    onSearch("");
    inputRef.current?.focus();
  }, [onSearch]);

  // Handle Enter key
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && searchQuery.trim() && onEnter) {
      event.preventDefault();
      onEnter(searchQuery.trim());
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Focus search on Ctrl/Cmd + K
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }

      // Clear search on Escape (if search is focused)
      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        handleClear();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleClear]);

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        className="pl-9 pr-9"
      />
      {searchQuery && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
        {!searchQuery && (
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 border border-border rounded bg-muted">
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
}
