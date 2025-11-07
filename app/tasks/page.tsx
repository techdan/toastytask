"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectsSidebar } from "@/components/projects/projects-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserAccountDropdown } from "@/components/auth/user-account-dropdown";
import {
  useTasksQuery,
  useProjectsQuery,
  useSettingsQuery,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCompleteTask,
  useUncompleteTask,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useReorderProjects,
  useUpdateSettings,
  useTouchAllTasks,
} from "@/lib/queries";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import type { Task, NewTask, Project, SortMode, TaskWithFreshValues } from "@/types";

// Number of days to show completed tasks when visibility is enabled
const COMPLETED_TASKS_VISIBLE_DAYS = 7;

const toMilliseconds = (value: Date | string | number | null | undefined) => {
  if (!value) {
    return 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }
  return new Date(value).getTime();
};

const compareTasks = (
  a: TaskWithFreshValues,
  b: TaskWithFreshValues,
  sortMode: SortMode
) => {
  if (a.completedAt && !b.completedAt) return 1;
  if (!a.completedAt && b.completedAt) return -1;

  const aIsUntouched = !a.lastHeatTouchedAt && !a.lastTouchedAt;
  const bIsUntouched = !b.lastHeatTouchedAt && !b.lastTouchedAt;

  if (aIsUntouched && !bIsUntouched) return -1;
  if (!aIsUntouched && bIsUntouched) return 1;

  if (aIsUntouched && bIsUntouched) {
    const sortValue = sortMode === "heat" ? (a._freshHeat || 0) : a._freshImportance;
    const sortValueB = sortMode === "heat" ? (b._freshHeat || 0) : b._freshImportance;

    if (sortValueB !== sortValue) {
      return sortValueB - sortValue;
    }

    const aCreated = toMilliseconds(a.createdAt);
    const bCreated = toMilliseconds(b.createdAt);
    return bCreated - aCreated;
  }

  const sortValue = sortMode === "heat" ? (a._freshHeat || 0) : a._freshImportance;
  const sortValueB = sortMode === "heat" ? (b._freshHeat || 0) : b._freshImportance;

  if (sortValueB !== sortValue) {
    return sortValueB - sortValue;
  }

  if (a.dueAt && b.dueAt) {
    const aTime = toMilliseconds(a.dueAt);
    const bTime = toMilliseconds(b.dueAt);
    return aTime - bTime;
  }
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;

  const aCreated = toMilliseconds(a.createdAt);
  const bCreated = toMilliseconds(b.createdAt);
  return bCreated - aCreated;
};

const sortTasksByMode = (tasks: TaskWithFreshValues[], sortMode: SortMode) =>
  [...tasks].sort((a, b) => compareTasks(a, b, sortMode));

const normalizeToDate = (
  value: Task["createdAt"] | string | number | null | undefined
) => {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number") {
    const milliseconds = value < 1e12 ? value * 1000 : value;
    return new Date(milliseconds);
  }
  if (typeof value === "string" && value.length > 0) {
    return new Date(value);
  }
  return new Date();
};

const coerceCompletedDate = (value: Date | string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number") {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  return new Date(value);
};

export default function TasksPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null | "all">("all");
  const [showCompleted, setShowCompleted] = useState(() => {
    // Read from localStorage on initial load, default to false (hide completed)
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("toodle:showCompleted");
      return saved === null ? false : saved === "true";
    }
    return false;
  });
  // Keep recently completed tasks visible (styled as completed) until a full refresh occurs.
  const [lingeringCompletedIds, setLingeringCompletedIds] = useState<Set<number>>(() => new Set());
  // Track tasks that should appear active again before the server confirms uncompletion.
  const [optimisticActiveIds, setOptimisticActiveIds] = useState<Set<number>>(() => new Set());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const queryClient = useQueryClient();

  // Query hooks - TanStack Query handles caching and state
  // Always fetch ALL tasks (completed and uncompleted) for instant client-side filtering
  const {
    data: allFetchedTasks = [],
    isLoading: isLoadingTasks,
  } = useTasksQuery({
    projectId: selectedProjectId === "all" ? undefined : selectedProjectId,
    includeCompleted: true, // Always fetch completed tasks
  });


  // Always fetch ALL tasks for accurate counts in sidebar
  const { data: allTasks = [] } = useTasksQuery({
    projectId: undefined, // No filter - get all tasks
    includeCompleted: true, // Fetch completed tasks too for accurate counts
  });

  const { data: projects = [] } = useProjectsQuery({
    includeArchived: true,
  });

  const { data: settings } = useSettingsQuery();

  const addLingeringCompleted = useCallback((taskId: number) => {
    setLingeringCompletedIds((previous) => {
      if (previous.has(taskId)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(taskId);
      return next;
    });
  }, []);

  const removeLingeringCompleted = useCallback((taskId: number) => {
    setLingeringCompletedIds((previous) => {
      if (!previous.has(taskId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(taskId);
      return next;
    });
  }, []);

  const addOptimisticActive = useCallback((taskId: number) => {
    setOptimisticActiveIds((previous) => {
      if (previous.has(taskId)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(taskId);
      return next;
    });
  }, []);

  const removeOptimisticActive = useCallback((taskId: number) => {
    setOptimisticActiveIds((previous) => {
      if (!previous.has(taskId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(taskId);
      return next;
    });
  }, []);

  // Drop lingering/optimistic IDs once server data reflects the final completion status.
  useEffect(() => {
    const completedIdSet = new Set(
      allFetchedTasks.filter((task) => task.completedAt).map((task) => task.id)
    );

    setLingeringCompletedIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const next = new Set<number>();
      previous.forEach((id) => {
        if (completedIdSet.has(id)) {
          next.add(id);
        }
      });
      return next.size === previous.size ? previous : next;
    });

    setOptimisticActiveIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const next = new Set<number>();
      previous.forEach((id) => {
        if (completedIdSet.has(id)) {
          next.add(id);
        }
      });
      return next.size === previous.size ? previous : next;
    });
  }, [allFetchedTasks]);

  // Background pre-fetching for better perceived performance
  useEffect(() => {
    // After initial load, pre-fetch tasks for each project in the background
    // This makes switching between projects instant
    if (projects.length > 0 && !isLoadingTasks) {
      projects.forEach((project) => {
        // Only pre-fetch if not already in cache
        queryClient.prefetchQuery({
          queryKey: ["tasks", { projectId: project.id, includeCompleted: true }],
          queryFn: async () => {
            const response = await fetch(`/api/tasks?projectId=${project.id}&includeCompleted=true`);
            if (!response.ok) return [];
            const data = await response.json();
            return data.tasks;
          },
        });
      });

      // Also pre-fetch tasks with no project
      queryClient.prefetchQuery({
        queryKey: ["tasks", { projectId: null, includeCompleted: true }],
        queryFn: async () => {
          const response = await fetch(`/api/tasks?projectId=null&includeCompleted=true`);
          if (!response.ok) return [];
          const data = await response.json();
          return data.tasks;
        },
      });
    }
  }, [projects, isLoadingTasks, queryClient]);

  // Mutation hooks with optimistic updates
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const completeTaskMutation = useCompleteTask();
  const uncompleteTaskMutation = useUncompleteTask();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const reorderProjectsMutation = useReorderProjects();
  const updateSettingsMutation = useUpdateSettings();
  const { touchAllTasks } = useTouchAllTasks();
  const [taskOrder, setTaskOrder] = useState<number[]>([]);
  const [isRefreshingOrder, setIsRefreshingOrder] = useState(false);
  const contextRef = useRef<{ projectId: number | null | "all"; sortMode: SortMode } | null>(null);
  const prevActiveCountRef = useRef(0); // Detect first non-empty load per context for deterministic seeding
  const sortMode = settings?.sortMode || "importance";

  // Calculate fresh scoring data and split completed tasks (recent only) from actives
  const { activeTasks, completedTasks } = useMemo(() => {
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - COMPLETED_TASKS_VISIBLE_DAYS);

    const actives: TaskWithFreshValues[] = [];
    const completeds: TaskWithFreshValues[] = [];

    allFetchedTasks.forEach((task) => {
      const isCompleted = !!task.completedAt;
      const isOptimisticActive = optimisticActiveIds.has(task.id);
      const shouldLinger = !isOptimisticActive && isCompleted && lingeringCompletedIds.has(task.id);

      if (isCompleted && !isOptimisticActive && !shouldLinger && !showCompleted) {
        return;
      }

      if (isCompleted && !isOptimisticActive && !shouldLinger && showCompleted) {
        const completedDate = coerceCompletedDate(task.completedAt);

        if (!completedDate || completedDate < cutoffDate) {
          return;
        }
      }

      const freshImportance = calculateImportanceV1(task, now);
      const enrichedTask: TaskWithFreshValues = {
        ...task,
        _freshImportance: freshImportance,
        _freshHeat: calculateHeat(task, now, freshImportance),
        ...(isOptimisticActive ? { completedAt: null } : {}),
      };

      if (isCompleted && !isOptimisticActive && !shouldLinger) {
        if (showCompleted) {
          completeds.push(enrichedTask);
        }
        return;
      }

      actives.push(enrichedTask);
    });

    return { activeTasks: actives, completedTasks: completeds };
  }, [allFetchedTasks, showCompleted, lingeringCompletedIds, optimisticActiveIds]);

  const sortedActiveIds = useMemo(
    () => sortTasksByMode(activeTasks, sortMode).map((task) => task.id),
    [activeTasks, sortMode]
  );

  useEffect(() => {
    const lastContext = contextRef.current;
    const contextChanged =
      !lastContext ||
      lastContext.projectId !== selectedProjectId ||
      lastContext.sortMode !== sortMode;
    const wasPreviouslyEmpty = prevActiveCountRef.current === 0;
    const nowHasTasks = activeTasks.length > 0;
    const shouldSeedFromSorted = contextChanged || (nowHasTasks && wasPreviouslyEmpty);

    if (shouldSeedFromSorted) {
      contextRef.current = { projectId: selectedProjectId, sortMode };
      setTaskOrder(sortedActiveIds);
      prevActiveCountRef.current = activeTasks.length;
      return;
    }

    prevActiveCountRef.current = activeTasks.length;

    setTaskOrder((previousOrder) => {
      const activeIdSet = new Set(activeTasks.map((task) => task.id));
      const filteredOrder = previousOrder.filter((id) => activeIdSet.has(id));
      const filteredSet = new Set(filteredOrder);
      const newTaskIds = activeTasks
        .map((task) => task.id)
        .filter((id) => !filteredSet.has(id));

      if (newTaskIds.length === 0 && filteredOrder.length === previousOrder.length) {
        return previousOrder;
      }

      return [...newTaskIds, ...filteredOrder];
    });
  }, [activeTasks, selectedProjectId, sortMode, sortedActiveIds]);

  const orderedActiveTasks = useMemo(() => {
    if (taskOrder.length === 0) {
      return sortTasksByMode(activeTasks, sortMode);
    }

    const taskMap = new Map(activeTasks.map((task) => [task.id, task]));
    const seen = new Set<number>();
    const ordered = taskOrder
      .map((taskId) => {
        const task = taskMap.get(taskId);
        if (task) {
          seen.add(task.id);
        }
        return task;
      })
      .filter((task): task is TaskWithFreshValues => Boolean(task));

    const missing = activeTasks.filter((task) => !seen.has(task.id));

    return [...ordered, ...missing];
  }, [activeTasks, sortMode, taskOrder]);

  const completedDisplay = useMemo(
    () => (showCompleted ? sortTasksByMode(completedTasks, sortMode) : []),
    [completedTasks, showCompleted, sortMode]
  );

  const displayedTasks = useMemo(
    () => [...orderedActiveTasks, ...completedDisplay],
    [completedDisplay, orderedActiveTasks]
  );

  const handleAddTask = async (taskData: Omit<NewTask, "createdAt" | "updatedAt">) => {
    createTaskMutation.mutate(taskData as NewTask);
  };

  const handleUpdateTask = async (id: number, updates: Partial<Task>) => {
    updateTaskMutation.mutate({ id, updates });
  };

  const handleDeleteTask = async (id: number) => {
    deleteTaskMutation.mutate(id);
  };

  const handleCompleteTask = async (id: number) => {
    console.log("DEBUG: handleCompleteTask called", { id });
    removeOptimisticActive(id);
    addLingeringCompleted(id);
    completeTaskMutation.mutate(id, {
      onError: () => {
        removeLingeringCompleted(id);
      },
    });
  };

  const handleUncompleteTask = async (id: number) => {
    console.log("DEBUG: handleUncompleteTask called", { id });
    addOptimisticActive(id);
    removeLingeringCompleted(id);
    uncompleteTaskMutation.mutate(id, {
      onError: () => {
        removeOptimisticActive(id);
        addLingeringCompleted(id);
      },
    });
  };

  const handleToggleCompleted = () => {
    const newValue = !showCompleted;
    console.log("DEBUG: handleToggleCompleted called", {
      currentShowCompleted: showCompleted,
      newShowCompleted: newValue
    });
    setShowCompleted(newValue);
    // Persist to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("toodle:showCompleted", String(newValue));
    }
  };

  // Project CRUD handlers
  const handleCreateProject = async (name: string, colorHex: string) => {
    createProjectMutation.mutate({ name, colorHex, archived: false });
  };

  const handleUpdateProject = async (id: number, updates: Partial<Project>) => {
    updateProjectMutation.mutate({ id, updates });
  };

  const handleDeleteProject = async (id: number) => {
    deleteProjectMutation.mutate(id);

    // If the deleted project was selected, switch to "all"
    if (selectedProjectId === id) {
      setSelectedProjectId("all");
    }
  };

  const handleReorderProjects = async (orderedIds: number[]) => {
    await reorderProjectsMutation.mutateAsync(orderedIds);
  };

  // Settings handlers
  const handleSortModeChange = (sortMode: SortMode) => {
    updateSettingsMutation.mutate({ sortMode });
  };

  const handleRefreshOrder = async () => {
    if (isRefreshingOrder) {
      return;
    }

    setIsRefreshingOrder(true);
    const previousOrder = taskOrder;
    const recalculationTimestamp = new Date();

    const simulatedActiveTasks = activeTasks.map((task) => {
      if (task.lastTouchedAt || task.lastHeatTouchedAt) {
        return task;
      }
      const createdAtDate = normalizeToDate(task.createdAt);
      const touchedTask = {
        ...task,
        lastTouchedAt: createdAtDate,
        lastHeatTouchedAt: createdAtDate,
      };
      const freshImportance = calculateImportanceV1(touchedTask, recalculationTimestamp);
      return {
        ...touchedTask,
        _freshImportance: freshImportance,
        _freshHeat: calculateHeat(touchedTask, recalculationTimestamp, freshImportance),
      };
    });

    setTaskOrder(sortTasksByMode(simulatedActiveTasks, sortMode).map((task) => task.id));

    try {
      await touchAllTasks({
        successMessage: "Tasks resorted and marked as touched",
        errorMessage: "Failed to refresh task order",
      });
    } catch (error) {
      console.error("Failed to refresh task order:", error);
      setTaskOrder(previousOrder);
    } finally {
      setIsRefreshingOrder(false);
    }
  };

  // Calculate task counts per project from ALL tasks (exclude completed)
  const taskCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    allTasks.forEach((task) => {
      // Only count uncompleted tasks for sidebar
      if (!task.completedAt) {
        const projectId = task.projectId || 0; // 0 for tasks with no project
        counts[projectId] = (counts[projectId] || 0) + 1;
      }
    });
    return counts;
  }, [allTasks]);

  const isLoading = isLoadingTasks;

  return (
    <div className="flex h-screen">
      {/* Projects Sidebar */}
      <ProjectsSidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onReorderProjects={handleReorderProjects}
        taskCounts={taskCounts}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full min-w-0 px-4 py-8 lg:px-[40px]">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="mb-2 text-3xl font-bold">Tasks</h1>
              <p className="text-muted-foreground">
                Manage your tasks with importance-based prioritization
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <UserAccountDropdown />
            </div>
          </div>

          {/* Quick Add */}
          <div className="mb-6">
            <QuickAdd
              onAdd={handleAddTask}
              currentProjectId={selectedProjectId === "all" ? null : selectedProjectId}
            />
          </div>

          {/* Task List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          ) : (
            <TaskList
              tasks={displayedTasks}
              projects={projects}
              showCompleted={showCompleted}
              onToggleCompleted={handleToggleCompleted}
              sortMode={sortMode}
              onSortModeChange={handleSortModeChange}
              onRefreshOrder={handleRefreshOrder}
              isRefreshingOrder={isRefreshingOrder}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onComplete={handleCompleteTask}
              onUncomplete={handleUncompleteTask}
            />
          )}
        </div>
      </div>
    </div>
  );
}
