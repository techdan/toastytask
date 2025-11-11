"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectsSidebar } from "@/components/projects/projects-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserAccountDropdown } from "@/components/auth/user-account-dropdown";
import { SearchBar } from "@/components/search/search-bar";
import { SearchDropdown } from "@/components/search/search-dropdown";
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
  const [searchInputValue, setSearchInputValue] = useState(searchQuery);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const queryClient = useQueryClient();

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
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full min-w-0 px-4 py-8 lg:px-[40px]">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold">
                <svg
                  viewBox="0 0 512 512"
                  width={40}
                  height={40}
                  className="h-10 w-10"
                  style={{
                    "--line": "var(--foreground)",
                  } as React.CSSProperties & Record<string, string>}
                >
                  <style>{`
                    svg {
                      --bg: transparent;
                      --line: #efeedd;
                    }
                    .bg { fill: var(--bg); }
                    .line { fill: var(--line); }
                  `}</style>
                  <rect width="100%" height="100%" className="bg" />
                  <path
                    d="M 461.00,60.00 L 459.00,61.00 L 457.00,62.00 L 455.00,63.00 L 453.00,63.00 L 451.00,64.00 L 449.00,65.00 L 448.00,66.00 L 446.00,67.00 L 444.00,68.00 L 442.00,69.00 L 440.00,69.00 L 439.00,71.00 L 437.00,72.00 L 435.00,73.00 L 433.00,74.00 L 431.00,76.00 L 429.00,77.00 L 427.00,78.00 L 425.00,79.00 L 423.00,81.00 L 421.00,82.00 L 419.00,84.00 L 417.00,85.00 L 415.00,86.00 L 414.00,88.00 L 412.00,88.00 L 410.00,90.00 L 408.00,92.00 L 406.00,93.00 L 404.00,95.00 L 402.00,97.00 L 400.00,98.00 L 398.00,100.00 L 396.00,102.00 L 394.00,102.00 L 393.00,104.00 L 392.00,106.00 L 390.00,106.00 L 389.00,108.00 L 387.00,110.00 L 385.00,111.00 L 384.00,113.00 L 382.00,114.00 L 380.00,116.00 L 379.00,118.00 L 377.00,119.00 L 376.00,121.00 L 374.00,123.00 L 372.00,124.00 L 371.00,126.00 L 369.00,127.00 L 367.00,129.00 L 366.00,131.00 L 364.00,132.00 L 363.00,134.00 L 361.00,135.00 L 359.00,137.00 L 358.00,139.00 L 356.00,140.00 L 355.00,142.00 L 353.00,144.00 L 352.00,145.00 L 351.00,147.00 L 349.00,149.00 L 347.00,151.00 L 345.00,153.00 L 343.00,155.00 L 341.00,157.00 L 340.00,159.00 L 338.00,161.00 L 336.00,163.00 L 334.00,165.00 L 333.00,167.00 L 332.00,169.00 L 330.00,170.00 L 329.00,172.00 L 328.00,174.00 L 326.00,176.00 L 324.00,178.00 L 323.00,180.00 L 321.00,182.00 L 320.00,184.00 L 318.00,186.00 L 316.00,188.00 L 316.00,190.00 L 314.00,191.00 L 313.00,193.00 L 312.00,195.00 L 310.00,197.00 L 308.00,199.00 L 307.00,201.00 L 305.00,203.00 L 303.00,205.00 L 303.00,207.00 L 301.00,208.00 L 300.00,210.00 L 299.00,212.00 L 297.00,214.00 L 296.00,216.00 L 294.00,218.00 L 293.00,220.00 L 292.00,222.00 L 291.00,224.00 L 289.00,226.00 L 288.00,228.00 L 286.00,230.00 L 285.00,232.00 L 283.00,234.00 L 283.00,236.00 L 281.00,238.00 L 280.00,239.00 L 279.00,241.00 L 278.00,243.00 L 276.00,245.00 L 275.00,247.00 L 274.00,249.00 L 272.00,250.00 L 272.00,252.00 L 270.00,254.00 L 269.00,256.00 L 267.00,258.00 L 267.00,260.00 L 265.00,262.00 L 264.00,264.00 L 263.00,266.00 L 261.00,268.00 L 261.00,270.00 L 259.00,271.00 L 258.00,273.00 L 257.00,275.00 L 255.00,277.00 L 254.00,279.00 L 254.00,281.00 L 252.00,283.00 L 251.00,284.00 L 250.00,286.00 L 249.00,288.00 L 247.00,290.00 L 246.00,292.00 L 246.00,294.00 L 245.00,296.00 L 243.00,298.00 L 242.00,300.00 L 240.00,302.00 L 240.00,304.00 L 238.00,305.00 L 238.00,307.00 L 237.00,309.00 L 235.00,311.00 L 234.00,313.00 L 233.00,315.00 L 232.00,317.00 L 231.00,319.00 L 229.00,321.00 L 228.00,323.00 L 228.00,325.00 L 226.00,327.00 L 225.00,329.00 L 224.00,331.00 L 224.00,333.00 L 223.00,335.00 L 221.00,337.00 L 219.00,336.00 L 218.00,334.00 L 216.00,333.00 L 216.00,331.00 L 214.00,329.00 L 213.00,327.00 L 211.00,325.00 L 210.00,323.00 L 209.00,322.00 L 207.00,320.00 L 206.00,318.00 L 205.00,316.00 L 203.00,314.00 L 202.00,312.00 L 200.00,310.00 L 199.00,308.00 L 197.00,306.00 L 196.00,305.00 L 194.00,303.00 L 194.00,301.00 L 192.00,299.00 L 190.00,297.00 L 189.00,295.00 L 187.00,293.00 L 186.00,291.00 L 184.00,289.00 L 182.00,287.00 L 182.00,285.00 L 180.00,283.00 L 178.00,282.00 L 178.00,280.00 L 176.00,278.00 L 174.00,276.00 L 172.00,274.00 L 170.00,272.00 L 169.00,270.00 L 167.00,268.00 L 165.00,266.00 L 163.00,264.00 L 161.00,262.00 L 159.00,261.00 L 157.00,259.00 L 155.00,259.00 L 153.00,259.00 L 151.00,259.00 L 149.00,259.00 L 148.00,261.00 L 146.00,261.00 L 144.00,263.00 L 144.00,265.00 L 143.00,267.00 L 143.00,269.00 L 144.00,271.00 L 145.00,273.00 L 146.00,275.00 L 148.00,276.00 L 149.00,278.00 L 150.00,280.00 L 152.00,282.00 L 154.00,284.00 L 156.00,286.00 L 158.00,288.00 L 160.00,290.00 L 161.00,292.00 L 163.00,294.00 L 164.00,296.00 L 165.00,298.00 L 167.00,299.00 L 169.00,301.00 L 169.00,303.00 L 171.00,305.00 L 173.00,307.00 L 174.00,309.00 L 175.00,311.00 L 176.00,312.00 L 178.00,314.00 L 179.00,316.00 L 181.00,317.00 L 181.00,319.00 L 182.00,321.00 L 184.00,323.00 L 186.00,325.00 L 187.00,327.00 L 188.00,328.00 L 190.00,330.00 L 190.00,332.00 L 192.00,334.00 L 194.00,335.00 L 194.00,337.00 L 196.00,339.00 L 196.00,341.00 L 198.00,342.00 L 200.00,344.00 L 200.00,346.00 L 202.00,347.00 L 203.00,349.00 L 204.00,351.00 L 205.00,353.00 L 207.00,355.00 L 207.00,357.00 L 209.00,359.00 L 210.00,361.00 L 212.00,363.00 L 213.00,365.00 L 215.00,367.00 L 217.00,368.00 L 219.00,370.00 L 221.00,370.00 L 223.00,370.00 L 225.00,369.00 L 227.00,368.00 L 229.00,366.00 L 231.00,364.00 L 232.00,362.00 L 233.00,360.00 L 234.00,358.00 L 235.00,357.00 L 236.00,355.00 L 237.00,353.00 L 237.00,351.00 L 239.00,350.00 L 239.00,348.00 L 240.00,346.00 L 242.00,344.00 L 243.00,342.00 L 244.00,340.00 L 245.00,338.00 L 246.00,336.00 L 247.00,334.00 L 249.00,332.00 L 249.00,330.00 L 250.00,328.00 L 252.00,326.00 L 253.00,324.00 L 253.00,322.00 L 254.00,320.00 L 256.00,318.00 L 257.00,316.00 L 258.00,314.00 L 259.00,312.00 L 260.00,311.00 L 261.00,309.00 L 262.00,307.00 L 264.00,305.00 L 265.00,303.00 L 266.00,301.00 L 267.00,299.00 L 268.00,297.00 L 270.00,295.00 L 270.00,293.00 L 272.00,291.00 L 273.00,290.00 L 274.00,288.00 L 275.00,286.00 L 277.00,284.00 L 278.00,282.00 L 278.00,280.00 L 280.00,278.00 L 281.00,276.00 L 283.00,274.00 L 284.00,272.00 L 286.00,270.00 L 286.00,268.00 L 288.00,266.00 L 289.00,264.00 L 290.00,262.00 L 292.00,260.00 L 292.00,258.00 L 294.00,257.00 L 294.00,255.00 L 296.00,253.00 L 297.00,251.00 L 299.00,249.00 L 299.00,247.00 L 301.00,245.00 L 301.00,244.00 L 303.00,242.00 L 304.00,240.00 L 306.00,238.00 L 307.00,236.00 L 308.00,234.00 L 309.00,232.00 L 311.00,230.00 L 312.00,228.00 L 314.00,226.00 L 315.00,224.00 L 317.00,222.00 L 318.00,220.00 L 319.00,219.00 L 320.00,217.00 L 321.00,215.00 L 323.00,213.00 L 325.00,211.00 L 326.00,209.00 L 328.00,207.00 L 329.00,205.00 L 330.00,203.00 L 332.00,202.00 L 332.00,200.00 L 334.00,198.00 L 336.00,196.00 L 337.00,194.00 L 339.00,192.00 L 340.00,190.00 L 342.00,188.00 L 343.00,186.00 L 344.00,184.00 L 346.00,182.00 L 347.00,180.00 L 349.00,178.00 L 351.00,176.00 L 353.00,174.00 L 354.00,172.00 L 355.00,170.00 L 357.00,169.00 L 358.00,167.00 L 359.00,165.00 L 361.00,163.00 L 363.00,161.00 L 364.00,159.00 L 366.00,157.00 L 368.00,155.00 L 370.00,153.00 L 371.00,151.00 L 372.00,149.00 L 374.00,148.00 L 376.00,146.00 L 377.00,144.00 L 379.00,143.00 L 379.00,141.00 L 381.00,139.00 L 383.00,137.00 L 385.00,135.00 L 387.00,133.00 L 389.00,131.00 L 390.00,129.00 L 392.00,127.00 L 394.00,125.00 L 396.00,123.00 L 398.00,121.00 L 400.00,119.00 L 402.00,117.00 L 404.00,115.00 L 406.00,113.00 L 408.00,111.00 L 410.00,109.00 L 412.00,108.00 L 413.00,106.00 L 415.00,104.00 L 417.00,102.00 L 419.00,101.00 L 421.00,99.00 L 423.00,97.00 L 425.00,95.00 L 427.00,93.00 L 429.00,92.00 L 431.00,91.00 L 432.00,89.00 L 434.00,88.00 L 435.00,86.00 L 437.00,85.00 L 439.00,83.00 L 441.00,82.00 L 443.00,80.00 L 445.00,79.00 L 447.00,77.00 L 449.00,75.00 L 451.00,75.00 L 452.00,73.00 L 454.00,72.00 L 456.00,70.00 L 458.00,69.00 L 460.00,67.00 L 462.00,66.00 L 464.00,64.00 L 464.00,62.00 L 464.00,60.00 L 462.00,60.00 Z M 215.00,47.00 L 207.00,48.00 L 199.00,48.00 L 191.00,50.00 L 183.00,51.00 L 175.00,52.00 L 168.00,54.00 L 160.00,56.00 L 152.00,57.00 L 145.00,60.00 L 138.00,63.00 L 130.00,65.00 L 122.00,69.00 L 114.00,73.00 L 107.00,76.00 L 100.00,80.00 L 92.00,85.00 L 84.00,90.00 L 76.00,98.00 L 69.00,104.00 L 62.00,112.00 L 57.00,119.00 L 54.00,127.00 L 51.00,134.00 L 48.00,141.00 L 47.00,149.00 L 47.00,157.00 L 48.00,165.00 L 50.00,172.00 L 53.00,180.00 L 58.00,188.00 L 66.00,196.00 L 72.00,204.00 L 77.00,212.00 L 80.00,220.00 L 82.00,228.00 L 84.00,235.00 L 85.00,243.00 L 85.00,251.00 L 85.00,259.00 L 85.00,267.00 L 85.00,275.00 L 84.00,283.00 L 84.00,291.00 L 84.00,299.00 L 84.00,307.00 L 82.00,314.00 L 82.00,322.00 L 82.00,330.00 L 81.00,338.00 L 81.00,346.00 L 81.00,354.00 L 81.00,362.00 L 81.00,370.00 L 81.00,378.00 L 81.00,386.00 L 81.00,394.00 L 82.00,402.00 L 84.00,410.00 L 85.00,418.00 L 88.00,426.00 L 90.00,434.00 L 95.00,441.00 L 103.00,449.00 L 110.00,454.00 L 118.00,456.00 L 125.00,459.00 L 133.00,460.00 L 141.00,461.00 L 149.00,461.00 L 157.00,461.00 L 165.00,463.00 L 173.00,463.00 L 181.00,463.00 L 189.00,463.00 L 197.00,463.00 L 205.00,463.00 L 213.00,463.00 L 221.00,464.00 L 229.00,464.00 L 237.00,464.00 L 245.00,464.00 L 253.00,464.00 L 261.00,464.00 L 269.00,464.00 L 277.00,464.00 L 285.00,463.00 L 293.00,463.00 L 301.00,463.00 L 309.00,463.00 L 317.00,463.00 L 325.00,461.00 L 333.00,461.00 L 341.00,460.00 L 349.00,460.00 L 357.00,457.00 L 365.00,455.00 L 373.00,452.00 L 381.00,446.00 L 388.00,438.00 L 392.00,431.00 L 395.00,423.00 L 397.00,415.00 L 398.00,407.00 L 398.00,399.00 L 400.00,391.00 L 400.00,383.00 L 400.00,375.00 L 400.00,367.00 L 400.00,359.00 L 400.00,351.00 L 400.00,343.00 L 398.00,335.00 L 398.00,327.00 L 399.00,319.00 L 397.00,311.00 L 397.00,303.00 L 397.00,295.00 L 397.00,287.00 L 396.00,279.00 L 396.00,271.00 L 396.00,263.00 L 396.00,255.00 L 396.00,247.00 L 397.00,239.00 L 398.00,231.00 L 400.00,224.00 L 402.00,216.00 L 406.00,209.00 L 411.00,202.00 L 417.00,195.00 L 424.00,187.00 L 429.00,180.00 L 432.00,172.00 L 434.00,164.00 L 434.00,156.00 L 434.00,148.00 L 433.00,140.00 L 430.00,133.00 L 426.00,125.00 L 421.00,120.00 L 424.00,128.00 L 427.00,136.00 L 430.00,144.00 L 431.00,152.00 L 431.00,160.00 L 430.00,168.00 L 427.00,175.00 L 422.00,183.00 L 417.00,190.00 L 411.00,197.00 L 406.00,205.00 L 401.00,212.00 L 398.00,219.00 L 396.00,227.00 L 394.00,235.00 L 393.00,243.00 L 393.00,251.00 L 393.00,259.00 L 393.00,267.00 L 393.00,275.00 L 393.00,283.00 L 393.00,291.00 L 393.00,299.00 L 394.00,307.00 L 394.00,315.00 L 394.00,323.00 L 396.00,331.00 L 396.00,339.00 L 396.00,347.00 L 396.00,355.00 L 397.00,363.00 L 397.00,371.00 L 397.00,379.00 L 396.00,387.00 L 396.00,395.00 L 394.00,402.00 L 394.00,410.00 L 393.00,418.00 L 390.00,426.00 L 386.00,434.00 L 380.00,441.00 L 374.00,448.00 L 366.00,452.00 L 359.00,455.00 L 351.00,456.00 L 343.00,457.00 L 335.00,458.00 L 327.00,458.00 L 319.00,460.00 L 311.00,460.00 L 303.00,460.00 L 295.00,460.00 L 287.00,460.00 L 279.00,461.00 L 271.00,461.00 L 263.00,461.00 L 255.00,461.00 L 247.00,461.00 L 239.00,461.00 L 231.00,461.00 L 223.00,461.00 L 215.00,461.00 L 207.00,461.00 L 199.00,460.00 L 191.00,460.00 L 183.00,460.00 L 175.00,460.00 L 167.00,460.00 L 159.00,460.00 L 151.00,458.00 L 143.00,458.00 L 135.00,457.00 L 127.00,456.00 L 119.00,453.00 L 111.00,449.00 L 104.00,444.00 L 97.00,438.00 L 93.00,430.00 L 89.00,422.00 L 88.00,414.00 L 87.00,406.00 L 85.00,398.00 L 85.00,390.00 L 84.00,382.00 L 84.00,374.00 L 84.00,366.00 L 84.00,358.00 L 84.00,350.00 L 85.00,342.00 L 85.00,334.00 L 85.00,326.00 L 85.00,318.00 L 87.00,311.00 L 87.00,303.00 L 87.00,295.00 L 88.00,287.00 L 88.00,279.00 L 88.00,271.00 L 88.00,263.00 L 88.00,255.00 L 88.00,247.00 L 88.00,239.00 L 87.00,231.00 L 84.00,223.00 L 82.00,216.00 L 79.00,208.00 L 74.00,201.00 L 68.00,194.00 L 63.00,187.00 L 58.00,180.00 L 54.00,172.00 L 51.00,164.00 L 51.00,156.00 L 51.00,148.00 L 52.00,140.00 L 54.00,133.00 L 58.00,126.00 L 63.00,118.00 L 67.00,111.00 L 75.00,103.00 L 83.00,97.00 L 90.00,91.00 L 97.00,86.00 L 105.00,81.00 L 113.00,77.00 L 121.00,72.00 L 129.00,70.00 L 137.00,66.00 L 145.00,63.00 L 152.00,61.00 L 160.00,59.00 L 168.00,58.00 L 175.00,56.00 L 183.00,54.00 L 191.00,53.00 L 199.00,53.00 L 207.00,51.00 L 215.00,51.00 L 223.00,50.00 L 231.00,50.00 L 239.00,50.00 L 247.00,50.00 L 255.00,50.00 L 263.00,50.00 L 271.00,51.00 L 279.00,52.00 L 286.00,53.00 L 294.00,54.00 L 302.00,55.00 L 310.00,57.00 L 318.00,59.00 L 326.00,62.00 L 334.00,64.00 L 341.00,66.00 L 349.00,70.00 L 357.00,72.00 L 365.00,77.00 L 372.00,80.00 L 380.00,85.00 L 388.00,88.00 L 382.00,82.00 L 375.00,77.00 L 367.00,73.00 L 359.00,69.00 L 351.00,67.00 L 344.00,64.00 L 336.00,61.00 L 328.00,59.00 L 320.00,56.00 L 312.00,55.00 L 304.00,52.00 L 296.00,51.00 L 288.00,50.00 L 281.00,48.00 L 273.00,48.00 L 265.00,47.00 L 257.00,47.00 L 249.00,47.00 L 241.00,47.00 L 233.00,47.00 L 225.00,47.00 L 217.00,47.00 Z M 211.00,26.00 L 202.00,27.00 L 193.00,29.00 L 184.00,30.00 L 175.00,31.00 L 167.00,33.00 L 158.00,34.00 L 149.00,37.00 L 140.00,39.00 L 131.00,43.00 L 122.00,46.00 L 114.00,50.00 L 105.00,53.00 L 96.00,57.00 L 88.00,63.00 L 79.00,68.00 L 71.00,73.00 L 63.00,80.00 L 56.00,87.00 L 48.00,94.00 L 42.00,103.00 L 36.00,112.00 L 32.00,121.00 L 29.00,130.00 L 27.00,139.00 L 26.00,148.00 L 26.00,157.00 L 26.00,166.00 L 28.00,175.00 L 31.00,184.00 L 35.00,193.00 L 41.00,201.00 L 48.00,210.00 L 54.00,216.00 L 59.00,225.00 L 61.00,234.00 L 63.00,243.00 L 63.00,252.00 L 63.00,261.00 L 63.00,270.00 L 63.00,279.00 L 62.00,288.00 L 61.00,296.00 L 61.00,305.00 L 60.00,314.00 L 60.00,323.00 L 60.00,332.00 L 59.00,341.00 L 59.00,350.00 L 59.00,359.00 L 59.00,368.00 L 59.00,377.00 L 59.00,386.00 L 59.00,395.00 L 60.00,404.00 L 61.00,413.00 L 63.00,421.00 L 64.00,430.00 L 67.00,439.00 L 72.00,448.00 L 77.00,457.00 L 86.00,465.00 L 94.00,471.00 L 102.00,475.00 L 111.00,478.00 L 119.00,480.00 L 128.00,481.00 L 137.00,482.00 L 145.00,484.00 L 154.00,484.00 L 163.00,484.00 L 172.00,484.00 L 181.00,484.00 L 190.00,485.00 L 199.00,485.00 L 208.00,485.00 L 217.00,485.00 L 226.00,485.00 L 235.00,485.00 L 244.00,485.00 L 253.00,485.00 L 262.00,485.00 L 271.00,485.00 L 280.00,485.00 L 289.00,485.00 L 298.00,484.00 L 307.00,484.00 L 316.00,484.00 L 325.00,484.00 L 334.00,484.00 L 343.00,482.00 L 352.00,482.00 L 361.00,480.00 L 370.00,478.00 L 379.00,475.00 L 387.00,471.00 L 395.00,465.00 L 404.00,457.00 L 410.00,448.00 L 414.00,439.00 L 417.00,431.00 L 418.00,422.00 L 420.00,413.00 L 421.00,405.00 L 422.00,396.00 L 422.00,387.00 L 422.00,378.00 L 422.00,369.00 L 422.00,360.00 L 422.00,351.00 L 421.00,342.00 L 421.00,333.00 L 421.00,324.00 L 419.00,316.00 L 419.00,307.00 L 419.00,298.00 L 418.00,289.00 L 418.00,280.00 L 418.00,271.00 L 417.00,262.00 L 418.00,253.00 L 418.00,244.00 L 419.00,235.00 L 422.00,226.00 L 426.00,217.00 L 433.00,209.00 L 442.00,200.00 L 447.00,191.00 L 451.00,182.00 L 454.00,173.00 L 455.00,164.00 L 456.00,155.00 L 455.00,146.00 L 454.00,137.00 L 451.00,129.00 L 448.00,121.00 L 444.00,112.00 L 438.00,106.00 L 436.00,114.00 L 441.00,123.00 L 445.00,132.00 L 447.00,140.00 L 448.00,149.00 L 448.00,158.00 L 448.00,167.00 L 445.00,176.00 L 441.00,185.00 L 436.00,194.00 L 430.00,202.00 L 423.00,210.00 L 418.00,219.00 L 414.00,228.00 L 411.00,237.00 L 410.00,246.00 L 410.00,255.00 L 410.00,264.00 L 410.00,273.00 L 411.00,282.00 L 411.00,291.00 L 411.00,300.00 L 412.00,308.00 L 413.00,317.00 L 413.00,326.00 L 414.00,335.00 L 414.00,344.00 L 414.00,353.00 L 414.00,362.00 L 414.00,371.00 L 414.00,380.00 L 414.00,389.00 L 414.00,398.00 L 413.00,407.00 L 412.00,416.00 L 410.00,425.00 L 407.00,434.00 L 404.00,443.00 L 398.00,451.00 L 389.00,460.00 L 381.00,465.00 L 372.00,470.00 L 363.00,473.00 L 354.00,474.00 L 345.00,476.00 L 336.00,476.00 L 327.00,477.00 L 318.00,477.00 L 309.00,477.00 L 300.00,477.00 L 291.00,478.00 L 282.00,478.00 L 273.00,478.00 L 264.00,478.00 L 255.00,478.00 L 246.00,478.00 L 237.00,478.00 L 228.00,478.00 L 219.00,478.00 L 210.00,478.00 L 201.00,478.00 L 192.00,478.00 L 183.00,477.00 L 174.00,477.00 L 165.00,477.00 L 156.00,477.00 L 147.00,476.00 L 138.00,476.00 L 129.00,474.00 L 120.00,473.00 L 111.00,470.00 L 102.00,466.00 L 93.00,461.00 L 84.00,452.00 L 78.00,444.00 L 74.00,436.00 L 72.00,427.00 L 70.00,418.00 L 68.00,409.00 L 67.00,400.00 L 67.00,391.00 L 67.00,382.00 L 66.00,373.00 L 67.00,364.00 L 67.00,355.00 L 67.00,346.00 L 67.00,337.00 L 68.00,328.00 L 68.00,319.00 L 68.00,310.00 L 70.00,301.00 L 70.00,292.00 L 70.00,283.00 L 71.00,274.00 L 71.00,265.00 L 71.00,256.00 L 71.00,247.00 L 70.00,238.00 L 68.00,229.00 L 64.00,220.00 L 60.00,211.00 L 54.00,203.00 L 46.00,194.00 L 40.00,185.00 L 36.00,176.00 L 34.00,167.00 L 33.00,158.00 L 33.00,149.00 L 34.00,140.00 L 37.00,131.00 L 40.00,122.00 L 44.00,114.00 L 50.00,106.00 L 56.00,97.00 L 63.00,90.00 L 72.00,83.00 L 81.00,76.00 L 90.00,70.00 L 99.00,65.00 L 107.00,60.00 L 115.00,56.00 L 124.00,53.00 L 133.00,49.00 L 142.00,47.00 L 151.00,43.00 L 160.00,42.00 L 169.00,39.00 L 178.00,38.00 L 187.00,37.00 L 196.00,35.00 L 205.00,34.00 L 214.00,34.00 L 223.00,33.00 L 232.00,33.00 L 241.00,33.00 L 250.00,33.00 L 259.00,33.00 L 268.00,34.00 L 277.00,35.00 L 286.00,36.00 L 295.00,37.00 L 304.00,39.00 L 313.00,41.00 L 322.00,42.00 L 331.00,45.00 L 340.00,48.00 L 349.00,50.00 L 358.00,54.00 L 366.00,58.00 L 375.00,63.00 L 383.00,67.00 L 392.00,72.00 L 400.00,77.00 L 402.00,70.00 L 394.00,65.00 L 385.00,60.00 L 376.00,55.00 L 367.00,51.00 L 358.00,46.00 L 350.00,43.00 L 342.00,40.00 L 333.00,38.00 L 324.00,35.00 L 315.00,34.00 L 306.00,31.00 L 297.00,30.00 L 288.00,29.00 L 279.00,27.00 L 270.00,27.00 L 261.00,26.00 L 252.00,26.00 L 243.00,26.00 L 234.00,26.00 L 225.00,26.00 L 216.00,26.00 Z"
                    fillRule="evenodd"
                    className="line"
                  />
                </svg>
                Toasty Task
              </h1>
              <p className="text-muted-foreground">
                Manage your tasks with importance-based prioritization
              </p>
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
