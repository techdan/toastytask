"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsQuery } from "@/lib/queries/use-settings-query";
import type { NewTask } from "@/types";

interface QuickAddProps {
  onAdd: (task: Omit<NewTask, "createdAt" | "updatedAt">) => void;
  defaultPriority?: "low" | "medium" | "high" | "top";
  currentProjectId?: number | null;
}

// Helper to calculate due date from default setting
function calculateDueDate(defaultDueDate: "none" | "today" | "tomorrow" | "next_week"): Date | null {
  const now = new Date();
  now.setHours(23, 59, 59, 999); // Set to end of day

  switch (defaultDueDate) {
    case "none":
      return null;
    case "today":
      return now;
    case "tomorrow":
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    case "next_week":
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    default:
      return null;
  }
}

export function QuickAdd({ onAdd, defaultPriority, currentProjectId }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Fetch settings for defaults
  const { data: settings } = useSettingsQuery();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setIsAdding(true);

    try {
      // Use settings defaults if available, otherwise fall back to props or hardcoded defaults
      const priority = defaultPriority || settings?.defaultPriority || "medium";
      const dueAt = calculateDueDate(settings?.defaultDueDate || "none");

      // Create task with defaults
      await onAdd({
        title: trimmedTitle,
        priority,
        bucket: "todo", // Always default to "todo"
        star: false,
        dueAt,
        projectId: currentProjectId ?? null,
        heat: 0.0,
        touchCount: 0,
        importanceV1: 0, // DEPRECATED: Placeholder only, will be removed in Phase 2
        repeatType: "none", // Default to non-recurring
      });

      // Clear input on success
      setTitle("");
    } catch (error) {
      console.error("Failed to add task:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setTitle("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Plus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Add a new task..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isAdding}
          className="pl-10"
        />
      </div>
      <Button type="submit" disabled={!title.trim() || isAdding}>
        {isAdding ? "Adding..." : "Add Task"}
      </Button>
    </form>
  );
}
