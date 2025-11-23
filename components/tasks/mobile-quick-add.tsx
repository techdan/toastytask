"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { NewTask } from "@/types";
import { useSettingsQuery } from "@/lib/queries/use-settings-query";

interface MobileQuickAddProps {
  onAdd: (task: Omit<NewTask, "createdAt" | "updatedAt">) => Promise<void> | void;
  currentProjectId?: number | null;
}

type DefaultDueDate = "none" | "today" | "tomorrow" | "next_week";

const calculateDueDate = (defaultDueDate: DefaultDueDate): Date | null => {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  switch (defaultDueDate) {
    case "today":
      return now;
    case "tomorrow": {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    case "next_week": {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }
    default:
      return null;
  }
};

export function MobileQuickAdd({ onAdd, currentProjectId }: MobileQuickAddProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: settings } = useSettingsQuery();

  useEffect(() => {
    if (!isOpen) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsAdding(true);
    try {
      const priority = settings?.defaultPriority || "medium";
      const dueAt = calculateDueDate((settings?.defaultDueDate as DefaultDueDate) || "none");
      await onAdd({
        title: trimmed,
        priority,
        bucket: "todo",
        dueAt,
        projectId: currentProjectId ?? null,
        heat: 0,
        touchCount: 0,
        importanceV1: 0,
        repeatType: "none",
      });
      setTitle("");
      setIsOpen(false);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-40 h-14 w-14 rounded-full shadow-lg sm:hidden"
      >
        <Plus className="h-6 w-6" />
        <span className="sr-only">Add task</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="flex flex-row items-center justify-between space-y-0">
            <DialogTitle>Add Task</DialogTitle>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add a new task..."
              disabled={isAdding}
              className="h-11 flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isAdding || !title.trim()}
              className="h-11 w-11"
              aria-label="Add task"
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
