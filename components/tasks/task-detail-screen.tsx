"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flame, Snowflake, Star, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PrioritySelect } from "./priority-select";
import { TaskProjectSelect } from "./project-select";
import { RecurrenceSelect } from "./recurrence-select";
import { DueDateDisplay } from "./due-date-display";
import { HeatBadge } from "./heat-badge";
import { useTasksQuery, useProjectsQuery, useNotesQuery } from "@/lib/queries";
import { useCompleteTask, useUncompleteTask, useUpdateTask, useDeleteTask } from "@/lib/queries";
import { useTouchTask, useCoolTask, useStarTask } from "@/lib/queries/use-task-mutations";
import { useSaveNotes } from "@/lib/queries/use-notes-mutations";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { cn } from "@/lib/utils";
import type { SortMode, Task, TaskWithFreshValues } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Mode = "fullscreen" | "modal";

interface TaskDetailScreenProps {
  taskId: number;
  onClose: () => void;
  mode: Mode;
}

export function TaskDetailScreen({ taskId, onClose, mode }: TaskDetailScreenProps) {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useTasksQuery({ includeCompleted: true });
  const { data: projects = [] } = useProjectsQuery({ includeArchived: true });
  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) as TaskWithFreshValues | undefined,
    [tasks, taskId]
  );
  const { data: notesData = task?.notes ?? [], isFetching: isNotesLoading } = useNotesQuery(taskId, true, task?.notes);

  const updateTaskMutation = useUpdateTask();
  const completeTaskMutation = useCompleteTask();
  const uncompleteTaskMutation = useUncompleteTask();
  const touchTaskMutation = useTouchTask();
  const coolTaskMutation = useCoolTask();
  const starTaskMutation = useStarTask();
  const saveNotesMutation = useSaveNotes();
  const [badgeMode, setBadgeMode] = useState<SortMode>("heat");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const deleteTaskMutation = useDeleteTask();
  const enrichedTask = useMemo(() => {
    if (!task) return undefined;
    const now = new Date();
    const _freshImportance = calculateImportanceV1(task, now);
    const _freshHeat = calculateHeat(task, now, _freshImportance);
    return { ...task, _freshImportance, _freshHeat };
  }, [task]);

  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(
    Array.isArray(notesData) && notesData.length > 0
      ? notesData.map((note) => note.currentText).join("\n")
      : ""
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isDeleting, setIsDeleting] = useState(false);
  const [highlightDueDate, setHighlightDueDate] = useState(false);
  const [highlightRecurrence, setHighlightRecurrence] = useState(false);
  const [showCompletedCheckmark, setShowCompletedCheckmark] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(
        Array.isArray(notesData) && notesData.length > 0
          ? notesData.map((note) => note.currentText).join("\n")
          : ""
      );
    }
  }, [notesData, task]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  const runSave = useCallback(
    async (updates: Partial<Task>) => {
      setSaveError(null);
      try {
        await updateTaskMutation.mutateAsync({ id: taskId, updates });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Save failed");
      }
    },
    [taskId, updateTaskMutation]
  );

  const handleTitleBlur = useCallback(() => {
    if (!title.trim() || title === task?.title) return;
    runSave({ title: title.trim() });
  }, [runSave, task?.title, title]);

  const handleNotesBlur = useCallback(() => {
    const current = Array.isArray(notesData) && notesData.length > 0
      ? notesData.map((note) => note.currentText).join("\n")
      : "";
    if (notes === current) return;
    saveNotesMutation.mutate(
      { taskId, text: notes },
      {
        onSuccess: () => {
        },
        onError: (error) => {
          setSaveError(error instanceof Error ? error.message : "Save failed");
        },
      }
    );
  }, [notes, notesData, saveNotesMutation, taskId]);

  const handleCompleteToggle = useCallback(async () => {
    try {
      const isRecurring = task?.repeatType && task.repeatType !== "none";
      const wasCompleted = Boolean(task?.completedAt);

      if (wasCompleted) {
        await uncompleteTaskMutation.mutateAsync(taskId);
      } else {
        await completeTaskMutation.mutateAsync(taskId);

        // Highlight due date and recurrence for recurring tasks when completing
        if (isRecurring) {
          setHighlightDueDate(true);
          setHighlightRecurrence(true);
          setShowCompletedCheckmark(true);
          window.setTimeout(() => {
            setHighlightDueDate(false);
            setHighlightRecurrence(false);
          }, 2000);
          window.setTimeout(() => {
            setShowCompletedCheckmark(false);
          }, 1200);
        }
      }
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 800);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Save failed");
    }
  }, [completeTaskMutation, task?.completedAt, task?.repeatType, taskId, uncompleteTaskMutation]);

  const handleHeat = useCallback(async () => {
    if (!task) return;
    const now = new Date();
    const importance = calculateImportanceV1(task, now);
    const visible = [{ id: task.id, heat: calculateHeat(task, now, importance) }];
    await touchTaskMutation.mutateAsync({ taskId: task.id, visibleTaskIds: visible });
  }, [task, touchTaskMutation]);

  const handleCool = useCallback(async () => {
    if (!task) return;
    const now = new Date();
    const importance = calculateImportanceV1(task, now);
    const visible = [{ id: task.id, heat: calculateHeat(task, now, importance) }];
    await coolTaskMutation.mutateAsync({ taskId: task.id, visibleTaskIds: visible });
  }, [coolTaskMutation, task]);

  const handleStar = useCallback(async () => {
    if (!task) return;
    await starTaskMutation.mutateAsync({ taskId: task.id });
  }, [starTaskMutation, task]);

  const handleConfirmDelete = useCallback(async () => {
    if (!task) return;
    try {
      setIsDeleting(true);
      await deleteTaskMutation.mutateAsync(task.id);
      router.push("/tasks");
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  }, [deleteTaskMutation, router, task]);

  if (isLoading || isNotesLoading || !task) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        {isLoading || isNotesLoading ? "Loading task..." : "Task not found"}
      </div>
    );
  }

  const isModal = mode === "modal";

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 flex",
          isModal ? "items-center justify-center bg-black/50 px-4 py-6 sm:px-6" : "bg-background"
        )}
        onClick={isModal ? handleClose : undefined}
      >
        <div
          className={cn(
            "relative flex w-full flex-col overflow-hidden bg-background",
            isModal
              ? "max-h-[80vh] max-w-xl rounded-2xl shadow-2xl"
              : "h-full max-w-none"
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex items-center justify-between border-b px-4 py-2 h-20">
            <Button
              variant="ghost"
              className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
              onClick={handleClose}
              aria-label="Back"
            >
              <ArrowLeft className="h-10 w-10" />
            </Button>
            {enrichedTask ? (
              <div className="flex flex-1 items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setBadgeMode((prev) => (prev === "heat" ? "importance" : "heat"))}
                  className="flex h-10 w-10 items-center justify-center rounded-md"
                  aria-label="Toggle heat/importance badge"
                >
                  <HeatBadge task={enrichedTask} mode={badgeMode} isCompleted={Boolean(task.completedAt)} />
                </button>
                <Button
                  variant="ghost"
                  className={cn(
                  "h-10 w-10 shrink-0 p-0 flex items-center justify-center",
                  task.starLevel === 1 && "text-sky-500",
                  task.starLevel === 2 && "text-amber-400",
                  task.starLevel === 3 && "text-orange-500",
                  (task.starLevel ?? 0) === 0 && "text-muted-foreground"
                )}
                  onClick={handleStar}
                  aria-label="Star task"
                >
                  <Star
                    className={cn(
                    "h-10 w-10",
                    (task.starLevel ?? 0) > 0 && "fill-current"
                  )}
                />
              </Button>
              <Button variant="ghost" className="h-10 w-10 shrink-0 p-0 flex items-center justify-center" onClick={handleHeat} aria-label="Heat task">
                <Flame className="h-10 w-10 text-orange-500" />
              </Button>
              <Button variant="ghost" className="h-10 w-10 shrink-0 p-0 flex items-center justify-center" onClick={handleCool} aria-label="Cool task">
                <Snowflake className="h-10 w-10 text-sky-500" />
              </Button>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {task ? (
            <div className="flex flex-col items-end justify-center text-[10px] text-muted-foreground leading-tight whitespace-nowrap pr-4">
              <div>Created: {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</div>
              <div>Modified: {new Date(task.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</div>
            </div>
          ) : (
            <div className="w-10" />
          )}
        </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={Boolean(task.completedAt) || showCompletedCheckmark}
                onCheckedChange={handleCompleteToggle}
                className={cn(
                  "h-6 w-6",
                  showCompletedCheckmark && "transition-opacity duration-1000 opacity-0"
                )}
                aria-label="Mark task complete"
              />
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={handleTitleBlur}
                className={cn(
                  "h-12 text-lg",
                  task.completedAt && "line-through text-muted-foreground italic"
                )}
                autoFocus
                placeholder="Task title"
              />
            </div>

            <div className={cn(
              "space-y-4 text-lg",
              task.completedAt && "text-muted-foreground italic"
            )}>
              <div className="flex items-center gap-4">
                <div className="w-28 text-lg font-semibold text-muted-foreground">Due date</div>
                <div className={cn("flex-1", task.completedAt && "line-through")}>
                  {highlightDueDate ? (
                    <span className="due-date-highlight">
                      <DueDateDisplay
                        dueAt={task.dueAt}
                        onDateChange={(date) => runSave({ dueAt: date })}
                        disabled={Boolean(task.completedAt)}
                        isCompleted={Boolean(task.completedAt)}
                        size="lg"
                      />
                    </span>
                  ) : (
                    <DueDateDisplay
                      dueAt={task.dueAt}
                      onDateChange={(date) => runSave({ dueAt: date })}
                      disabled={Boolean(task.completedAt)}
                      isCompleted={Boolean(task.completedAt)}
                      size="lg"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-28 text-lg font-semibold text-muted-foreground">Priority</div>
                <div className={cn("flex-1", task.completedAt && "line-through")}>
                  <PrioritySelect
                    value={task.priority}
                    onValueChange={(priority) => runSave({ priority })}
                    disabled={Boolean(task.completedAt)}
                    isCompleted={Boolean(task.completedAt)}
                    size="lg"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-28 text-lg font-semibold text-muted-foreground">Project</div>
                <div className={cn("flex-1", task.completedAt && "line-through")}>
                  <TaskProjectSelect
                    projects={projects}
                    value={task.projectId ?? null}
                    onValueChange={(projectId) => runSave({ projectId })}
                    disabled={Boolean(task.completedAt)}
                    size="lg"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-28 text-lg font-semibold text-muted-foreground">Recurrence</div>
                <div className={cn(
                  "flex-1",
                  highlightRecurrence && "due-date-highlight",
                  task.completedAt && "line-through"
                )}>
                  <RecurrenceSelect
                    value={task.repeatType}
                    repeatRule={task.repeatRule}
                    onValueChange={(repeatType, repeatRule) => runSave({ repeatType, repeatRule })}
                    disabled={Boolean(task.completedAt)}
                    size="lg"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-lg font-semibold text-muted-foreground">Notes</div>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={handleNotesBlur}
                rows={8}
                placeholder="Notes"
                className={cn(
                  "text-lg resize-none [field-sizing:initial] !min-h-[15rem] h-auto",
                  task.completedAt && "line-through text-muted-foreground italic"
                )}
              />
            </div>

            {saveError ? (
              <div className="text-sm text-destructive" role="alert">
                {saveError}
              </div>
            ) : null}
          </div>
        </div>
      </div>

    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete task?</DialogTitle>
          <DialogDescription>
            This cannot be undone. The task and its notes will be removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
