"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectsSidebar } from "@/components/projects/projects-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserAccountDropdown } from "@/components/auth/user-account-dropdown";
import { SearchBar } from "@/components/search/search-bar";
import { SearchDropdown } from "@/components/search/search-dropdown";
import { Logo } from "@/components/ui/logo";
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
import { searchTasks, filterResultsByProject } from "@/lib/search/search-utils";
import { navigateToTask, navigateToNote } from "@/lib/search/navigation-utils";
import type { Task, NewTask, Project, SortMode, TaskWithFreshValues } from "@/types";
import type { SearchResult } from "@/lib/search/search-utils";

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

  // If both tasks are completed, sort by completion date (most recent first)
  if (a.completedAt && b.completedAt) {
    const aCompletedTime = toMilliseconds(a.completedAt);
    const bCompletedTime = toMilliseconds(b.completedAt);
    return bCompletedTime - aCompletedTime; // Descending order (newest first)
  }

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

function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams?.get("q") || "";
  const isSearchMode = searchParams?.get("mode") === "search";

  // Read project from URL params, with fallback to "all"
  const projectParam = searchParams?.get("project");
  const initialProjectId = projectParam === "null" ? null : projectParam === "all" ? "all" : projectParam ? parseInt(projectParam, 10) : "all";

  const [selectedProjectId, setSelectedProjectId] = useState<number | null | "all">(initialProjectId);
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
  const [isMounted, setIsMounted] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState(searchQuery);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const queryClient = useQueryClient();

  // Track pending completion mutations to prevent refetch races
  const pendingCompletionMutations = useRef(new Set<number>());
  const invalidationTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  // Track the latest intended completion state to ignore out-of-order responses
  const latestCompletionIntent = useRef(new Map<number, { shouldBeCompleted: boolean; timestamp: number }>());
  // Track corrections that need to be applied
  const [correctionsNeeded, setCorrectionsNeeded] = useState(new Map<number, boolean>());

  // Initialize collapsed state from localStorage after mount to avoid hydration issues
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("toodle:sidebarCollapsed");
    if (saved === "true") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  // Sync searchInputValue with URL searchQuery when it changes
  useEffect(() => {
    setSearchInputValue(searchQuery);
  }, [searchQuery]);

  // Sync selectedProjectId with URL params when they change
  useEffect(() => {
    const projectParam = searchParams?.get("project");
    const urlProjectId = projectParam === "null" ? null : projectParam === "all" ? "all" : projectParam ? parseInt(projectParam, 10) : "all";

    if (urlProjectId !== selectedProjectId) {
      setSelectedProjectId(urlProjectId);
    }
  }, [searchParams, selectedProjectId]);

  // Query hooks - TanStack Query handles caching and state
  // Fetch ALL tasks once and filter client-side for instant project switching
  const {
    data: allTasks = [],
    isLoading: isLoadingTasks,
  } = useTasksQuery({
    projectId: undefined, // No filter - get all tasks
    includeCompleted: true, // Fetch completed tasks too for accurate counts
  });

  // Filter tasks client-side based on selected project for instant updates
  const allFetchedTasks = useMemo(() => {
    if (selectedProjectId === "all") {
      return allTasks;
    }
    return allTasks.filter(task => task.projectId === selectedProjectId);
  }, [allTasks, selectedProjectId]);

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

  // Debounced invalidation to prevent refetch races during rapid mutations
  const scheduleInvalidation = useCallback(() => {
    if (invalidationTimeout.current) {
      clearTimeout(invalidationTimeout.current);
    }

    invalidationTimeout.current = setTimeout(() => {
      if (pendingCompletionMutations.current.size === 0) {
        // Only invalidate the main "all tasks" query to avoid duplicate fetches
        // Background prefetch queries will be stale but that's fine - they're prefetches
        queryClient.invalidateQueries({
          queryKey: ["tasks", { projectId: undefined, includeCompleted: true }],
          exact: true
        });
      }
    }, 100); // Wait 100ms after last mutation
  }, [queryClient]);

  // Drop lingering/optimistic IDs once server data reflects the final completion status.
  // IMPORTANT: Don't clean up while mutations are pending to prevent flickering
  // ALSO: Check latest intent - if server state doesn't match intent, queue corrective mutation
  useEffect(() => {
    // Don't run cleanup while mutations are still pending
    if (pendingCompletionMutations.current.size > 0) {
      return;
    }

    const completedIdSet = new Set(
      allFetchedTasks.filter((task) => task.completedAt).map((task) => task.id)
    );

    // Check for intent mismatches and queue corrective mutations
    const corrections = new Map<number, boolean>();
    latestCompletionIntent.current.forEach((intent, taskId) => {
      const serverCompleted = completedIdSet.has(taskId);
      const intentCompleted = intent.shouldBeCompleted;

      if (serverCompleted !== intentCompleted) {
        // Queue correction: true = should complete, false = should uncomplete
        corrections.set(taskId, intentCompleted);
      } else {
        // Server matches intent - clean up the intent record
        latestCompletionIntent.current.delete(taskId);
      }
    });

    if (corrections.size > 0) {
      setCorrectionsNeeded(corrections);
    }

    setLingeringCompletedIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const next = new Set<number>();
      previous.forEach((id) => {
        // Keep if server confirms completed
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
        // Keep if server shows completed (we're overriding to active)
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
      const isPending = pendingCompletionMutations.current.has(task.id);

      // Always keep pending tasks visible to prevent flickering during rapid mutations
      if (isCompleted && !isOptimisticActive && !shouldLinger && !isPending && !showCompleted) {
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
        // Override completedAt based on our React state to prevent flicker during rapid mutations
        ...(isOptimisticActive ? { completedAt: null } : {}),
        ...(shouldLinger && !isCompleted ? { completedAt: new Date() } : {}),
      };

      if (isCompleted && !isOptimisticActive && !shouldLinger && !isPending) {
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
      // Clear lingering completed tasks when context changes (project or sort mode)
      if (contextChanged) {
        setLingeringCompletedIds(new Set());
        setOptimisticActiveIds(new Set());
      }
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
    const timestamp = Date.now();

    // Record the intended state
    latestCompletionIntent.current.set(id, { shouldBeCompleted: true, timestamp });

    pendingCompletionMutations.current.add(id);
    flushSync(() => {
      removeOptimisticActive(id);
      addLingeringCompleted(id);
    });
    completeTaskMutation.mutate(id, {
      onSuccess: (task) => {
        // Check if this is still the latest intent
        const latest = latestCompletionIntent.current.get(id);
        if (latest && latest.timestamp > timestamp) {
          // Don't apply this stale response - a newer mutation has started
          return;
        }

        // This is the latest intent - update cache with server response
        queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
          if (!oldTasks || !Array.isArray(oldTasks)) {
            return oldTasks;
          }
          return oldTasks.map((t) =>
            t.id === task.id ? task : t
          );
        });
      },
      onError: () => {
        removeLingeringCompleted(id);
        pendingCompletionMutations.current.delete(id);
      },
      onSettled: () => {
        pendingCompletionMutations.current.delete(id);
        scheduleInvalidation();
      },
    });
  };

  const handleUncompleteTask = async (id: number) => {
    const timestamp = Date.now();

    // Record the intended state
    latestCompletionIntent.current.set(id, { shouldBeCompleted: false, timestamp });

    pendingCompletionMutations.current.add(id);
    flushSync(() => {
      addOptimisticActive(id);
      removeLingeringCompleted(id);
    });
    uncompleteTaskMutation.mutate(id, {
      onSuccess: (task) => {
        // Check if this is still the latest intent
        const latest = latestCompletionIntent.current.get(id);
        if (latest && latest.timestamp > timestamp) {
          // Don't apply this stale response - a newer mutation has started
          return;
        }

        // This is the latest intent - update cache with server response
        queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
          if (!oldTasks || !Array.isArray(oldTasks)) {
            return oldTasks;
          }
          return oldTasks.map((t) =>
            t.id === task.id ? task : t
          );
        });
      },
      onError: () => {
        removeOptimisticActive(id);
        addLingeringCompleted(id);
        pendingCompletionMutations.current.delete(id);
      },
      onSettled: () => {
        pendingCompletionMutations.current.delete(id);
        scheduleInvalidation();
      },
    });
  };

  // Process corrective mutations when detected by cleanup effect
  useEffect(() => {
    if (correctionsNeeded.size === 0) return;

    correctionsNeeded.forEach((shouldComplete, taskId) => {
      if (shouldComplete) {
        handleCompleteTask(taskId);
      } else {
        handleUncompleteTask(taskId);
      }
    });

    // Clear the corrections queue
    setCorrectionsNeeded(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctionsNeeded]); // handleCompleteTask and handleUncompleteTask are called but not dependencies

  const handleToggleCompleted = () => {
    const newValue = !showCompleted;
    setShowCompleted(newValue);
    // Clear lingering completed tasks when hiding completed tasks
    if (!newValue) {
      setLingeringCompletedIds(new Set());
    }
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
      handleSelectProject("all");
    }
  };

  const handleReorderProjects = async (orderedIds: number[]) => {
    await reorderProjectsMutation.mutateAsync(orderedIds);
  };

  // Settings handlers
  const handleSortModeChange = (sortMode: SortMode) => {
    updateSettingsMutation.mutate({ sortMode });
  };

  // Handle project selection with URL update
  const handleSelectProject = useCallback((projectId: number | null | "all") => {
    setSelectedProjectId(projectId);

    // Clear search input when changing views
    setSearchInputValue("");
    setIsSearchDropdownOpen(false);

    // Build new URL with project param, clear search params
    const params = new URLSearchParams();
    if (projectId === null) {
      params.set("project", "null");
    } else if (projectId !== "all") {
      params.set("project", projectId.toString());
    }
    // If projectId is "all", don't set project param (default)

    const newUrl = params.toString() ? `/tasks?${params.toString()}` : "/tasks";

    // Update URL without triggering navigation (use cached data for instant UI update)
    window.history.pushState(null, "", newUrl);
  }, []);

  const handleRefreshOrder = async () => {
    if (isRefreshingOrder) {
      return;
    }

    // Clear lingering completed tasks on refresh order
    setLingeringCompletedIds(new Set());

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

  // Search handlers
  const handleSearch = useCallback((query: string) => {
    setSearchInputValue(query);

    if (query.trim()) {
      setIsSearchDropdownOpen(true);
    } else {
      setIsSearchDropdownOpen(false);
      // Clear search mode when query is empty
      if (isSearchMode) {
        router.push("/tasks");
      }
    }
  }, [isSearchMode, router]);

  const handleSearchEnter = useCallback((query: string) => {
    // Close dropdown and navigate to search results page
    setIsSearchDropdownOpen(false);
    router.push(`/tasks?q=${encodeURIComponent(query)}&mode=search`);
  }, [router]);

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    setIsSearchDropdownOpen(false);

    // Navigate to the task
    if (result.type === "task") {
      navigateToTask(result.taskId);
    } else {
      navigateToNote(result.taskId);
    }
  }, []);

  // Compute search results
  const projectsMap = useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach(project => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const searchResults = useMemo(() => {
    if (!searchInputValue.trim()) {
      return [];
    }

    // Search in all tasks (for dropdown, don't filter by project)
    const results = searchTasks(allTasks, searchInputValue, projectsMap);

    // If in search mode, apply project filter
    if (isSearchMode) {
      return filterResultsByProject(results, selectedProjectId);
    }

    return results;
  }, [searchInputValue, allTasks, projectsMap, isSearchMode, selectedProjectId]);

  // In search mode, filter tasks based on search results
  const finalDisplayedTasks = useMemo(() => {
    if (isSearchMode && searchQuery.trim()) {
      // If in search mode but no results, return empty array
      if (searchResults.length === 0) {
        return [];
      }

      // Get unique task IDs from search results
      const taskIds = new Set(searchResults.map(r => r.taskId));

      // Filter displayed tasks to only show matching ones
      return displayedTasks.filter(task => taskIds.has(task.id));
    }

    return displayedTasks;
  }, [isSearchMode, searchQuery, searchResults, displayedTasks]);

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
      {isMounted && (
        <ProjectsSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onReorderProjects={handleReorderProjects}
          taskCounts={taskCounts}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => {
            setIsSidebarCollapsed((prev) => {
              const newValue = !prev;
              // Persist to localStorage
              if (typeof window !== "undefined") {
                localStorage.setItem("toodle:sidebarCollapsed", String(newValue));
              }
              return newValue;
            });
          }}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full min-w-0 px-4 py-8 lg:px-[40px]">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold">
                <button
                  onClick={() => handleSelectProject("all")}
                  className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                  aria-label="Go to all tasks"
                >
                  <Logo width={40} height={40} className="h-10 w-10" />
                  <span className="font-fraunces text-4xl font-bold tracking-tight logo-text">
                    Toasty Task
                  </span>
                </button>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="relative w-80">
                <SearchBar
                  onSearch={handleSearch}
                  onEnter={handleSearchEnter}
                  initialValue={searchInputValue}
                />
                <SearchDropdown
                  results={searchResults}
                  isOpen={isSearchDropdownOpen}
                  onClose={() => setIsSearchDropdownOpen(false)}
                  onSelectResult={handleSelectSearchResult}
                />
              </div>
              <ThemeToggle />
              <UserAccountDropdown />
            </div>
          </div>

          {/* Quick Add - Hidden in search mode */}
          {!isSearchMode && (
            <div className="mb-6">
              <QuickAdd
                onAdd={handleAddTask}
                currentProjectId={selectedProjectId === "all" ? null : selectedProjectId}
              />
            </div>
          )}

          {/* Task List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading tasks...</p>
            </div>
          ) : (
            <>
              {isSearchMode && searchQuery.trim() && (
                <div className="mb-4 text-sm text-muted-foreground">
                  {finalDisplayedTasks.length} {finalDisplayedTasks.length === 1 ? 'result' : 'results'} for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
              <TaskList
                tasks={finalDisplayedTasks}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <TasksPageContent />
    </Suspense>
  );
}
