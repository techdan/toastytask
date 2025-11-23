"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  initialQuery?: string;
  returnFocusRef?: React.RefObject<HTMLElement>;
}

const HISTORY_FLAG = "searchModal";

export function SearchModal({
  isOpen,
  onClose,
  onSearch,
  initialQuery = "",
  returnFocusRef,
}: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasPushedHistoryRef = useRef(false);
  const closingFromHistoryRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
    }
  }, [initialQuery, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      const stateHasFlag = Boolean(event.state?.[HISTORY_FLAG]);
      if (stateHasFlag || hasPushedHistoryRef.current) {
        closingFromHistoryRef.current = true;
        onClose();
      }
    };

    // Push a history entry so browser back closes the modal first.
    window.history.pushState({ [HISTORY_FLAG]: true }, "", window.location.href);
    hasPushedHistoryRef.current = true;

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (hasPushedHistoryRef.current && !closingFromHistoryRef.current) {
        window.history.back();
      }
      hasPushedHistoryRef.current = false;
      closingFromHistoryRef.current = false;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      if (returnFocusRef?.current) {
        returnFocusRef.current.focus();
      }
      return;
    }

    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, returnFocusRef]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        handleClose();
        return;
      }
      onSearch(trimmed);
      handleClose();
    },
    [handleClose, onSearch, query]
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-xl p-0 sm:max-w-2xl"
      >
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close search"
            className="h-10 w-10 shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks and notes..."
                className={cn(
                  "h-11 w-full pl-10 pr-4",
                  "placeholder:text-muted-foreground/80"
                )}
                aria-label="Search tasks and notes"
              />
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
