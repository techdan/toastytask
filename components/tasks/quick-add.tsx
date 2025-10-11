"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { NewTask } from "@/types";

interface QuickAddProps {
  onAdd: (task: Omit<NewTask, "createdAt" | "updatedAt">) => void;
  defaultPriority?: "low" | "medium" | "high" | "top";
  defaultBucket?: "todo" | "watch" | "later";
}

export function QuickAdd({ onAdd, defaultPriority = "medium", defaultBucket = "todo" }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setIsAdding(true);

    try {
      // Create task with defaults
      await onAdd({
        title: trimmedTitle,
        priority: defaultPriority,
        bucket: defaultBucket,
        star: false,
        dueAt: null,
        projectId: null,
        heat: 0.0,
        touchCount: 0,
        importanceV1: 0, // Will be calculated on the server
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
