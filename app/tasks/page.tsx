"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useBreakpoint } from "@/lib/hooks/use-breakpoint";
import { MobileHeader } from "@/components/navigation/mobile-header";
import { MobileNavDrawer } from "@/components/navigation/mobile-nav-drawer";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { MobileOptionsMenu } from "@/components/tasks/mobile-options-menu";
import { ProjectsSidebar } from "@/components/projects/projects-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserAccountDropdown } from "@/components/auth/user-account-dropdown";
import { SearchBar } from "@/components/search/search-bar";
import { SearchDropdown } from "@/components/search/search-dropdown";
import { SearchModal } from "@/components/search/search-modal";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useTasksQuery,
  useProjectsQuery,
  useSettingsQuery,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useStarTask,
  useCompleteTask,
  useUncompleteTask,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useReorderProjects,
  useUpdateSettings,
  useTouchAllTasks,
} from "@/lib/queries";
import { useTouchTask, useCoolTask, useMarkTaskTouched } from "@/lib/queries/use-task-mutations";
import { PRIMARY_TASKS_QUERY_KEY } from "@/lib/queries/task-query-keys";
import { applyStarLevelToTask, mergeTaskWithCachedNotes } from "@/lib/queries/task-cache-helpers";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { searchTasks, filterResultsByProject } from "@/lib/search/search-utils";
import { navigateToTask, navigateToNote } from "@/lib/search/navigation-utils";
import type { Task, NewTask, Project, SortMode, TaskWithFreshValues, TaskDensity, SortDirection } from "@/types";
import type { SearchResult } from "@/lib/search/search-utils";

// Number of days to show completed tasks when visibility is enabled
const COMPLETED_TASKS_VISIBLE_DAYS = 7;
const STAR_DEBOUNCE_MS = 150;
const VIEW_SORT_STORAGE_KEY = "toodle:viewSortMode";
const VIEW_SORT_DIRECTION_STORAGE_KEY = "toodle:viewSortDirection";

const readStoredCustomSortMode = (): SortMode | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(VIEW_SORT_STORAGE_KEY);
  return stored === "createdAt" || stored === "updatedAt" ? (stored as SortMode) : null;
};

const readStoredSortDirection = (): SortDirection | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(VIEW_SORT_DIRECTION_STORAGE_KEY);
  return stored === "asc" || stored === "desc" ? (stored as SortDirection) : null;
};

type PendingStarIntent = {
  targetLevel: number;
  intentTimestamp: number;
  snapshotBeforeOptimism?: Task[] | undefined;
};

type PendingHeatAction = {
  type: "heat" | "cool";
  taskId: number;
  visibleTaskIds: Array<{ id: number; heat: number }>;
};

type HighlightedTask = {
  id: number;
  mode: "heat" | "cool" | "due";
} | null;

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

  const compareCreatedDesc = () => {
    const aCreated = toMilliseconds(a.createdAt);
    const bCreated = toMilliseconds(b.createdAt);
    return bCreated - aCreated;
  };

  if (sortMode === "createdAt") {
    const createdDiff = compareCreatedDesc();
    if (createdDiff !== 0) {
      return createdDiff;
    }
  } else if (sortMode === "updatedAt") {
    const getUpdatedTime = (task: TaskWithFreshValues) => {
      if (task.updatedAt) {
        return toMilliseconds(task.updatedAt);
      }
      if (task.lastTouchedAt) {
        return toMilliseconds(task.lastTouchedAt);
      }
      if (task.lastHeatTouchedAt) {
        return toMilliseconds(task.lastHeatTouchedAt);
      }
      return toMilliseconds(task.createdAt);
    };
    const updatedDiff = getUpdatedTime(b) - getUpdatedTime(a);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }
  } else {
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

      return compareCreatedDesc();
    }

    const sortValue = sortMode === "heat" ? (a._freshHeat || 0) : a._freshImportance;
    const sortValueB = sortMode === "heat" ? (b._freshHeat || 0) : b._freshImportance;

    if (sortValueB !== sortValue) {
      return sortValueB - sortValue;
    }

    // Tie-breaker for equal heat: more recently heated tasks sort first
    if (sortMode === "heat") {
      const aHeatTime = a.lastHeatTouchedAt ? toMilliseconds(a.lastHeatTouchedAt) : 0;
      const bHeatTime = b.lastHeatTouchedAt ? toMilliseconds(b.lastHeatTouchedAt) : 0;
      if (bHeatTime !== aHeatTime) {
        return bHeatTime - aHeatTime; // More recent first
      }
    }
  }

  if (a.dueAt && b.dueAt) {
    const aTime = toMilliseconds(a.dueAt);
    const bTime = toMilliseconds(b.dueAt);
    return aTime - bTime;
  }
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;

  return compareCreatedDesc();
};

const sortTasksByMode = (tasks: TaskWithFreshValues[], sortMode: SortMode, sortDirection: SortDirection) =>
  [...tasks].sort((a, b) => {
    const baseComparison = compareTasks(a, b, sortMode);
    return sortDirection === "asc" ? -baseComparison : baseComparison;
  });

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
  const breakpoint = useBreakpoint();

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
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const stored = readStoredCustomSortMode();
    return stored ?? "importance";
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    const stored = readStoredSortDirection();
    return stored ?? "desc";
  });
  const [taskDensity, setTaskDensity] = useState<TaskDensity>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("toodle:taskDensity");
      return saved === "compact" ? "compact" : "comfortable";
    }
    return "comfortable";
  });
  // Keep recently completed tasks visible (styled as completed) until a full refresh occurs.
  const [lingeringCompletedIds, setLingeringCompletedIds] = useState<Set<number>>(() => new Set());
  // Track tasks that should appear active again before the server confirms uncompletion.
  const [optimisticActiveIds, setOptimisticActiveIds] = useState<Set<number>>(() => new Set());
  // Broadcast a short strike-through + fade cue when recurring tasks advance on completion.
  const [recurringCompletionSignals, setRecurringCompletionSignals] = useState<Map<number, number>>(
    () => new Map()
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState(searchQuery);
  const [committedSearchQuery, setCommittedSearchQuery] = useState(searchQuery);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isMobileOptionsOpen, setIsMobileOptionsOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const isClientMobile = isMounted && breakpoint === "mobile";
  const queryClient = useQueryClient();

  // Track pending completion mutations to prevent refetch races
  const pendingCompletionMutations = useRef(new Set<number>());
  const invalidationTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  // Track the latest intended completion state to ignore out-of-order responses
  const latestCompletionIntent = useRef(new Map<number, { shouldBeCompleted: boolean; timestamp: number }>());
  // Track corrections that need to be applied
  const [correctionsNeeded, setCorrectionsNeeded] = useState(new Map<number, boolean>());
  const pendingStarIntents = useRef(new Map<number, PendingStarIntent>());
  const pendingStarTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const recurringCompletionTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const inflightStarRequests = useRef(new Map<number, boolean>());

  // Initialize collapsed state from localStorage after mount to avoid hydration issues
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("toodle:sidebarCollapsed");
    if (saved === "true") {
      setIsSidebarCollapsed(true);
    }
    if (typeof window !== "undefined") {
      const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
      const touchCapable = coarse || "ontouchstart" in window;
      setIsTouchDevice(touchCapable);
    }
  }, []);

  // Sync search input + committed query with URL when it changes.
  // Keep prior committed query if router temporarily drops ?q while still in search mode.
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length > 0) {
      setSearchInputValue(searchQuery);
      setCommittedSearchQuery(searchQuery);
      return;
    }

    if (!isSearchMode) {
      setSearchInputValue("");
      setCommittedSearchQuery("");
    }
  }, [searchQuery, isSearchMode]);

  // Sync selectedProjectId with URL params when they change
  useEffect(() => {
    const projectParam = searchParams?.get("project");
    const urlProjectId = projectParam === "null" ? null : projectParam === "all" ? "all" : projectParam ? parseInt(projectParam, 10) : "all";

    if (urlProjectId !== selectedProjectId) {
      setSelectedProjectId(urlProjectId);
    }
  }, [searchParams, selectedProjectId]);

  // Reset mobile-only overlays when switching breakpoints
  useEffect(() => {
    if (!isClientMobile) {
      setIsMobileNavOpen(false);
      setIsSearchModalOpen(false);
      setIsMobileOptionsOpen(false);
      return;
    }
    setIsSearchDropdownOpen(false);
  }, [isClientMobile]);

  // Query hooks - TanStack Query handles caching and state
  // Fetch ALL tasks once and filter client-side for instant project switching
  const {
    data: allTasks = [],
    isLoading: isLoadingTasks,
  } = useTasksQuery({
    includeCompleted: true, // Fetch completed tasks too for accurate counts
  });

  // Filter tasks client-side based on selected project for instant updates
  const allFetchedTasks = useMemo(() => {
    if (selectedProjectId === "all") {
      return allTasks;
    }
    return allTasks.filter(task => task.projectId === selectedProjectId);
  }, [allTasks, selectedProjectId]);

  const taskById = useMemo(() => {
    const map = new Map<number, Task>();
    allFetchedTasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [allFetchedTasks]);

  const { data: projects = [] } = useProjectsQuery({
    includeArchived: true,
  });

  const { data: settings } = useSettingsQuery();

  useEffect(() => {
    if (!settings?.sortMode) {
      return;
    }
    const stored = readStoredCustomSortMode();
    const modeToUse = stored ?? settings.sortMode;
    setSortMode((previousMode) => {
      if (previousMode === modeToUse) {
        return previousMode;
      }
      setSortDirection((prevDirection) => {
        if (prevDirection === "desc") {
          return prevDirection;
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(VIEW_SORT_DIRECTION_STORAGE_KEY, "desc");
        }
        return "desc";
      });
      return modeToUse;
    });
  }, [settings?.sortMode]);

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
        // Only invalidate the primary tasks query to avoid duplicate fetches
        queryClient.invalidateQueries({
          queryKey: PRIMARY_TASKS_QUERY_KEY,
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
      const task = taskById.get(taskId);
      const isRecurringTask = Boolean(task?.repeatType && task.repeatType !== "none");
      const serverCompleted = completedIdSet.has(taskId);
      const intentCompleted = intent.shouldBeCompleted;

      if (isRecurringTask && intentCompleted) {
        // Recurring tasks remain active even after a completion tap, so don't re-trigger mutations
        latestCompletionIntent.current.delete(taskId);
        return;
      }

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
  }, [allFetchedTasks, taskById]);

  // Mutation hooks with optimistic updates
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const latestStarIntentTimestamps = useRef(new Map<number, number>());
  const { mutateAsync: starTaskMutateAsync } = useStarTask({
    getLatestIntentTimestamp: (taskId) =>
      latestStarIntentTimestamps.current.get(taskId),
  });
  const completeTaskMutation = useCompleteTask();
  const uncompleteTaskMutation = useUncompleteTask();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const reorderProjectsMutation = useReorderProjects();
  const updateSettingsMutation = useUpdateSettings();
  const { touchAllTasks } = useTouchAllTasks();
  const touchTaskMutation = useTouchTask();
  const coolTaskMutation = useCoolTask();
  const markTaskTouchedMutation = useMarkTaskTouched();
  const markOrderAsStale = useCallback(() => {
    setIsOrderFresh(false);
  }, []);
  const [taskOrder, setTaskOrder] = useState<number[]>([]);
  const taskOrderRef = useRef<number[]>([]);
  const [isRefreshingOrder, setIsRefreshingOrder] = useState(false);
  const [isOrderFresh, setIsOrderFresh] = useState(true);
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [pendingHeatAction, setPendingHeatAction] = useState<PendingHeatAction | null>(null);
  const [highlightedTask, setHighlightedTask] = useState<HighlightedTask>(null);
  const contextRef = useRef<{ projectId: number | null | "all"; sortMode: SortMode; sortDirection: SortDirection } | null>(null);
  const prevActiveCountRef = useRef(0); // Detect first non-empty load per context for deterministic seeding
  const lastActiveIdsRef = useRef<number[]>([]);

  // Calculate fresh scoring data and split completed tasks (recent only) from actives
  const { activeTasks, completedTasks, enrichedTaskMap } = useMemo(() => {
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - COMPLETED_TASKS_VISIBLE_DAYS);

    const actives: TaskWithFreshValues[] = [];
    const completeds: TaskWithFreshValues[] = [];
    const enrichedTasks = new Map<number, TaskWithFreshValues>();

    allFetchedTasks.forEach((task) => {
      const isCompleted = !!task.completedAt;
      const isOptimisticActive = optimisticActiveIds.has(task.id);
      const shouldLinger = !isOptimisticActive && isCompleted && lingeringCompletedIds.has(task.id);
      const isPending = pendingCompletionMutations.current.has(task.id);

      const freshImportance = calculateImportanceV1(task, now);
      const freshHeat = calculateHeat(task, now, freshImportance);

      const enrichedTask: TaskWithFreshValues = {
        ...task,
        _freshImportance: freshImportance,
        _freshHeat: freshHeat,
        // Override completedAt based on our React state to prevent flicker during rapid mutations
        ...(isOptimisticActive ? { completedAt: null } : {}),
        ...(shouldLinger && !isCompleted ? { completedAt: new Date() } : {}),
      };

      enrichedTasks.set(task.id, enrichedTask);

      if (isCompleted && !isOptimisticActive && !shouldLinger && !isPending) {
        if (showCompleted) {
          const completedDate = coerceCompletedDate(task.completedAt);

          if (!completedDate || completedDate < cutoffDate) {
            return;
          }
          completeds.push(enrichedTask);
        }
        return;
      }

      actives.push(enrichedTask);
    });

    return { activeTasks: actives, completedTasks: completeds, enrichedTaskMap: enrichedTasks };
  }, [allFetchedTasks, showCompleted, lingeringCompletedIds, optimisticActiveIds]);

  const sortedActiveIds = useMemo(
    () => sortTasksByMode(activeTasks, sortMode, sortDirection).map((task) => task.id),
    [activeTasks, sortMode, sortDirection]
  );

  useEffect(() => {
    const currentActiveIds = activeTasks.map((task) => task.id);
    const lastContext = contextRef.current;
    const contextChanged =
      !lastContext ||
      lastContext.projectId !== selectedProjectId ||
      lastContext.sortMode !== sortMode ||
      lastContext.sortDirection !== sortDirection;
    const wasPreviouslyEmpty = prevActiveCountRef.current === 0;
    const nowHasTasks = activeTasks.length > 0;
    const shouldSeedFromSorted = contextChanged || (nowHasTasks && wasPreviouslyEmpty);

    if (shouldSeedFromSorted) {
      // Clear lingering completed tasks when context changes (project or sort mode)
      if (contextChanged) {
        setLingeringCompletedIds(new Set());
        setOptimisticActiveIds(new Set());
      }
      contextRef.current = { projectId: selectedProjectId, sortMode, sortDirection };
      setTaskOrder(sortedActiveIds);
      setIsOrderFresh(true);
      prevActiveCountRef.current = activeTasks.length;
      lastActiveIdsRef.current = currentActiveIds;
      return;
    }

    prevActiveCountRef.current = activeTasks.length;

    const previousActiveIds = lastActiveIdsRef.current;
    const prevIdSet = new Set(previousActiveIds);
    const currentIdSet = new Set(currentActiveIds);
    const membershipChanged =
      currentActiveIds.length !== previousActiveIds.length ||
      currentActiveIds.some((id) => !prevIdSet.has(id)) ||
      previousActiveIds.some((id) => !currentIdSet.has(id));

    if (!membershipChanged) {
      lastActiveIdsRef.current = currentActiveIds;
      return;
    }

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
    lastActiveIdsRef.current = currentActiveIds;
  }, [activeTasks, selectedProjectId, sortMode, sortDirection, sortedActiveIds]);

  const orderedActiveTasks = useMemo(() => {
    if (taskOrder.length === 0) {
      return sortTasksByMode(activeTasks, sortMode, sortDirection);
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
  }, [activeTasks, sortMode, sortDirection, taskOrder]);

  const completedDisplay = useMemo(
    () => (showCompleted ? sortTasksByMode(completedTasks, sortMode, sortDirection) : []),
    [completedTasks, showCompleted, sortMode, sortDirection]
  );

  const displayedTasks = useMemo(
    () => [...orderedActiveTasks, ...completedDisplay],
    [completedDisplay, orderedActiveTasks]
  );

  const handleAddTask = async (taskData: Omit<NewTask, "createdAt" | "updatedAt">) => {
    createTaskMutation.mutate(taskData as NewTask);
  };

  const applyOptimisticStarLevel = useCallback((taskId: number, targetLevel: number) => {
    const now = new Date();
    queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
      if (!oldTasks || !Array.isArray(oldTasks)) {
        return oldTasks;
      }

      return oldTasks.map((task) =>
        task.id === taskId ? applyStarLevelToTask(task, targetLevel, now) : task
      );
    });
  }, [queryClient]);

  const flushStarIntent = useCallback((taskId: number) => {
    if (inflightStarRequests.current.get(taskId)) {
      return;
    }

    const intent = pendingStarIntents.current.get(taskId);
    if (!intent) {
      return;
    }

    pendingStarIntents.current.delete(taskId);

    const run = async () => {
      inflightStarRequests.current.set(taskId, true);
      try {
        await starTaskMutateAsync({
          taskId,
          targetLevel: intent.targetLevel,
          intentTimestamp: intent.intentTimestamp,
          optimisticApplied: true,
          snapshotBeforeOptimism: intent.snapshotBeforeOptimism,
        });
      } catch {
        // Error handling occurs inside the mutation hook (toast + rollback)
      } finally {
        inflightStarRequests.current.delete(taskId);
        if (pendingStarIntents.current.has(taskId)) {
          flushStarIntent(taskId);
        }
      }
    };

    void run();
  }, [starTaskMutateAsync]);

  const handleStarTask = useCallback((taskId: number) => {
    const pendingIntent = pendingStarIntents.current.get(taskId);
    const currentTask = enrichedTaskMap.get(taskId);
    if (!currentTask && !pendingIntent) {
      return;
    }
    markOrderAsStale();
    const currentLevel =
      pendingIntent?.targetLevel ??
      (currentTask?.starLevel ?? 0);
    const nextLevel = (currentLevel + 1) % 4;

    const snapshot =
      pendingIntent?.snapshotBeforeOptimism ??
      queryClient.getQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY);

    applyOptimisticStarLevel(taskId, nextLevel);

    const intentTimestamp = Date.now();
    latestStarIntentTimestamps.current.set(taskId, intentTimestamp);
    pendingStarIntents.current.set(taskId, {
      targetLevel: nextLevel,
      intentTimestamp,
      snapshotBeforeOptimism: snapshot,
    });

    const existingTimer = pendingStarTimers.current.get(taskId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timeoutId = setTimeout(() => {
      pendingStarTimers.current.delete(taskId);
      flushStarIntent(taskId);
    }, STAR_DEBOUNCE_MS);

    pendingStarTimers.current.set(taskId, timeoutId);
  }, [applyOptimisticStarLevel, enrichedTaskMap, flushStarIntent, markOrderAsStale, queryClient]);

  const handleUpdateTask = async (id: number, updates: Partial<Task>) => {
    updateTaskMutation.mutate({ id, updates });
    if ("dueAt" in updates || "priority" in updates) {
      markOrderAsStale();
    }
  };

  const handleDeleteTask = async (id: number) => {
    deleteTaskMutation.mutate(id);
  };

  const triggerRecurringCompletionCue = useCallback((taskId: number) => {
    setRecurringCompletionSignals((previous) => {
      const next = new Map(previous);
      next.set(taskId, Date.now());
      return next;
    });

    const timers = recurringCompletionTimers.current;
    const existingTimer = timers.get(taskId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timeoutId = setTimeout(() => {
      setRecurringCompletionSignals((previous) => {
        const next = new Map(previous);
        next.delete(taskId);
        return next;
      });
      timers.delete(taskId);
    }, 2000);

    timers.set(taskId, timeoutId);
  }, []);

  const handleCompleteTask = async (id: number) => {
    const timestamp = Date.now();
    markOrderAsStale();

    const targetTask = taskById.get(id);
    const isRecurringTask = Boolean(targetTask?.repeatType && targetTask.repeatType !== "none");

    if (isRecurringTask) {
      triggerRecurringCompletionCue(id);
      setHighlightedTask({ id, mode: "due" });
    }

    // Record the intended state (recurring tasks stay active after completion)
    if (!isRecurringTask) {
      latestCompletionIntent.current.set(id, { shouldBeCompleted: true, timestamp });
    } else {
      latestCompletionIntent.current.delete(id);
    }

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
        queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
          if (!oldTasks || !Array.isArray(oldTasks)) {
            return oldTasks;
          }
          return oldTasks.map((t) =>
            t.id === task.id ? mergeTaskWithCachedNotes(t, task) : t
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
    markOrderAsStale();

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
        queryClient.setQueryData<Task[]>(PRIMARY_TASKS_QUERY_KEY, (oldTasks) => {
          if (!oldTasks || !Array.isArray(oldTasks)) {
            return oldTasks;
          }
          return oldTasks.map((t) =>
            t.id === task.id ? mergeTaskWithCachedNotes(t, task) : t
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

  useEffect(() => {
    const timers = pendingStarTimers.current;
    const intents = pendingStarIntents.current;
    const recurringTimers = recurringCompletionTimers.current;

    return () => {
      timers.forEach((timeoutId) => clearTimeout(timeoutId));
      timers.clear();
      intents.clear();
      recurringTimers.forEach((timeoutId) => clearTimeout(timeoutId));
      recurringTimers.clear();
    };
  }, []);

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

  const handleDensityChange = useCallback((next: TaskDensity) => {
    setTaskDensity(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("toodle:taskDensity", next);
    }
  }, []);

  const handleToggleSortDirection = useCallback(() => {
    setSortDirection((previousDirection) => {
      const nextDirection = previousDirection === "desc" ? "asc" : "desc";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(VIEW_SORT_DIRECTION_STORAGE_KEY, nextDirection);
      }
      return nextDirection;
    });
  }, []);

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
  const handleSortModeChange = useCallback((nextSortMode: SortMode) => {
    setSortMode((previousMode) => {
      if (previousMode === nextSortMode) {
        return previousMode;
      }
      setSortDirection((prevDirection) => {
        if (prevDirection === "desc") {
          return prevDirection;
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(VIEW_SORT_DIRECTION_STORAGE_KEY, "desc");
        }
        return "desc";
      });
      return nextSortMode;
    });
    if (typeof window !== "undefined") {
      if (nextSortMode === "createdAt" || nextSortMode === "updatedAt") {
        window.localStorage.setItem(VIEW_SORT_STORAGE_KEY, nextSortMode);
      } else {
        window.localStorage.removeItem(VIEW_SORT_STORAGE_KEY);
      }
    }
    if (nextSortMode === "heat" || nextSortMode === "importance") {
      updateSettingsMutation.mutate({ sortMode: nextSortMode });
    }
  }, [updateSettingsMutation]);

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

  const refreshTaskOrder = useCallback(async () => {
    if (isRefreshingOrder) {
      return false;
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

    const newOrder = sortTasksByMode(simulatedActiveTasks, sortMode, sortDirection).map((task) => task.id);
    setTaskOrder(newOrder);

    try {
      await touchAllTasks({
        successMessage: "Tasks resorted and marked as touched",
        errorMessage: "Failed to refresh task order",
      });
      setIsOrderFresh(true);
      return true;
    } catch (error) {
      console.error("Failed to refresh task order:", error);
      setTaskOrder(previousOrder);
      return false;
    } finally {
      setIsRefreshingOrder(false);
    }
  }, [activeTasks, isRefreshingOrder, sortMode, sortDirection, taskOrder, touchAllTasks]);

  const handleRefreshOrder = useCallback(async () => {
    await refreshTaskOrder();
  }, [refreshTaskOrder]);

  useEffect(() => {
    taskOrderRef.current = taskOrder;
  }, [taskOrder]);

  const reorderTaskListWithTargetHeat = useCallback(
    (taskId: number, targetHeat: number) => {
      const now = new Date();
      const simulatedTasks = activeTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              _freshHeat: targetHeat,
              lastHeatTouchedAt: now,
              lastTouchedAt: now,
            }
          : task
      );
      const orderedIds = sortTasksByMode(simulatedTasks, sortMode, sortDirection).map((task) => task.id);
      flushSync(() => {
        setTaskOrder(orderedIds);
      });
    },
    [activeTasks, sortMode, sortDirection]
  );

  const runHeatMutation = useCallback(
    async (taskId: number, visibleTaskIds: Array<{ id: number; heat: number }>) => {
      try {
        const response = await touchTaskMutation.mutateAsync({ taskId, visibleTaskIds });
        setHighlightedTask({ id: taskId, mode: "heat" });
        if (typeof response?.targetHeat === "number") {
          reorderTaskListWithTargetHeat(taskId, response.targetHeat);
        } else {
          flushSync(() => {
            setTaskOrder(sortedActiveIds);
          });
        }
      } catch (error) {
        console.error("Failed to apply heat mutation:", error);
      }
    },
    [reorderTaskListWithTargetHeat, setHighlightedTask, sortedActiveIds, touchTaskMutation]
  );

  const runCoolMutation = useCallback(
    async (taskId: number, visibleTaskIds: Array<{ id: number; heat: number }>) => {
      try {
        const response = await coolTaskMutation.mutateAsync({ taskId, visibleTaskIds });
        setHighlightedTask({ id: taskId, mode: "cool" });
        if (typeof response?.targetHeat === "number") {
          reorderTaskListWithTargetHeat(taskId, response.targetHeat);
        } else {
          flushSync(() => {
            setTaskOrder(sortedActiveIds);
          });
        }
      } catch (error) {
        console.error("Failed to apply cool mutation:", error);
      }
    },
    [coolTaskMutation, reorderTaskListWithTargetHeat, setHighlightedTask, sortedActiveIds]
  );

  const executePendingHeatAction = useCallback(
    async (action: PendingHeatAction) => {
      if (action.type === "heat") {
        await runHeatMutation(action.taskId, action.visibleTaskIds);
      } else {
        await runCoolMutation(action.taskId, action.visibleTaskIds);
      }
    },
    [runCoolMutation, runHeatMutation]
  );

  const handleHeatRequest = useCallback(
    (taskId: number, visibleTaskIds: Array<{ id: number; heat: number }>) => {
      if (!isOrderFresh) {
        setPendingHeatAction({ type: "heat", taskId, visibleTaskIds });
        setIsRefreshModalOpen(true);
        return;
      }
      void runHeatMutation(taskId, visibleTaskIds);
    },
    [isOrderFresh, runHeatMutation]
  );

  const handleCoolRequest = useCallback(
    (taskId: number, visibleTaskIds: Array<{ id: number; heat: number }>) => {
      if (!isOrderFresh) {
        setPendingHeatAction({ type: "cool", taskId, visibleTaskIds });
        setIsRefreshModalOpen(true);
        return;
      }
      void runCoolMutation(taskId, visibleTaskIds);
    },
    [isOrderFresh, runCoolMutation]
  );

  const handleTouchTask = useCallback(
    (taskId: number) => {
      setHighlightedTask(null);
      markTaskTouchedMutation.mutate(taskId);
    },
    [markTaskTouchedMutation, setHighlightedTask]
  );

  const handleCancelRefreshPrompt = useCallback(() => {
    setIsRefreshModalOpen(false);
    setPendingHeatAction(null);
  }, []);

  const handleConfirmRefreshPrompt = useCallback(async () => {
    if (!pendingHeatAction) {
      setIsRefreshModalOpen(false);
      return;
    }
    const actionToRun = pendingHeatAction;
    const refreshed = await refreshTaskOrder();
    if (!refreshed) {
      return;
    }
    setIsRefreshModalOpen(false);
    setPendingHeatAction(null);
    await executePendingHeatAction(actionToRun);
  }, [executePendingHeatAction, pendingHeatAction, refreshTaskOrder]);

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
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return;
    }

    // Close dropdown and navigate to search results page
    setIsSearchDropdownOpen(false);
    setCommittedSearchQuery(normalizedQuery);
    router.push(`/tasks?q=${encodeURIComponent(normalizedQuery)}&mode=search`);
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

  const handleSearchFromModal = useCallback((query: string) => {
    setSearchInputValue(query);
    handleSearchEnter(query);
  }, [handleSearchEnter]);

  const handleOpenSearchModal = useCallback(() => {
    setIsSearchDropdownOpen(false);
    setIsSearchModalOpen(true);
  }, []);

  // Compute search results
  const projectsMap = useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach(project => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const dropdownInputQuery = searchInputValue.trim();
  const canonicalSearchQuery = committedSearchQuery.trim();
  const dropdownQuery = dropdownInputQuery || (isSearchMode ? canonicalSearchQuery : "");

  const dropdownSearchResults = useMemo(() => {
    if (!dropdownQuery) {
      return [];
    }

    // Search in all tasks (for dropdown, don't filter by project)
    const results = searchTasks(allTasks, dropdownQuery, projectsMap);

    // If in search mode, apply project filter
    if (isSearchMode) {
      return filterResultsByProject(results, selectedProjectId);
    }

    return results;
  }, [dropdownQuery, allTasks, projectsMap, isSearchMode, selectedProjectId]);

  const pageSearchResults = useMemo(() => {
    if (!isSearchMode || !canonicalSearchQuery) {
      return [];
    }

    const results = searchTasks(allTasks, canonicalSearchQuery, projectsMap, {
      includeCompleted: true,
    });

    return filterResultsByProject(results, selectedProjectId);
  }, [isSearchMode, canonicalSearchQuery, allTasks, projectsMap, selectedProjectId]);

  // In search mode, filter tasks based on search results
  const finalDisplayedTasks = useMemo(() => {
    if (isSearchMode && canonicalSearchQuery) {
      // If in search mode but no results, return empty array
      if (pageSearchResults.length === 0) {
        return [];
      }

      const orderedTaskIds: number[] = [];
      const seenIds = new Set<number>();
      pageSearchResults.forEach((result) => {
        if (!seenIds.has(result.taskId)) {
          seenIds.add(result.taskId);
          orderedTaskIds.push(result.taskId);
        }
      });

      const displayedTaskMap = new Map(displayedTasks.map((task) => [task.id, task]));
      const orderedTasks = orderedTaskIds
        .map((taskId) => displayedTaskMap.get(taskId) || enrichedTaskMap.get(taskId))
        .filter((task): task is TaskWithFreshValues => Boolean(task));

      return orderedTasks;
    }

    return displayedTasks;
  }, [isSearchMode, canonicalSearchQuery, pageSearchResults, displayedTasks, enrichedTaskMap]);

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

  const handleNavigateToSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleOpenTaskDetail = useCallback((taskId: number) => {
    router.push(`/tasks/${taskId}`);
  }, [router]);

  const isLoading = isLoadingTasks;

  return (
    <>
      <MobileNavDrawer
        open={isMobileNavOpen}
        onOpenChange={setIsMobileNavOpen}
        projects={projects}
        selectedProjectId={selectedProjectId}
        taskCounts={taskCounts}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onNavigateSettings={handleNavigateToSettings}
      />

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSearch={handleSearchFromModal}
        initialQuery={searchInputValue}
        returnFocusRef={searchButtonRef}
      />

      <div className="flex h-screen">
        {/* Projects Sidebar */}
        {isMounted && !isClientMobile && (
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {isClientMobile && (
            <MobileHeader
              onOpenProjects={() => setIsMobileNavOpen(true)}
              onOpenSearch={handleOpenSearchModal}
              optionsTrigger={(
                <MobileOptionsMenu
                  sortMode={sortMode}
                  sortDirection={sortDirection}
                  density={taskDensity}
                  showCompleted={showCompleted}
                  onSortModeChange={handleSortModeChange}
                  onToggleSortDirection={handleToggleSortDirection}
                  onDensityChange={handleDensityChange}
                  onToggleCompleted={handleToggleCompleted}
                  open={isMobileOptionsOpen}
                  onOpenChange={setIsMobileOptionsOpen}
                />
              )}
              searchButtonRef={searchButtonRef}
            />
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="w-full min-w-0 p-0 m-0">
              {!isClientMobile && (
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
                          <span className="logo-word-toasty">Toasty</span>
                          <span className="logo-word-task">Task</span>
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
                        results={dropdownSearchResults}
                        isOpen={isSearchDropdownOpen}
                        onClose={() => setIsSearchDropdownOpen(false)}
                        onSelectResult={handleSelectSearchResult}
                      />
                    </div>
                    <ThemeToggle />
                    <UserAccountDropdown />
                  </div>
                </div>
              )}

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
                  {isSearchMode && canonicalSearchQuery && (
                    <div className="mb-4 text-sm text-muted-foreground">
                      {finalDisplayedTasks.length} {finalDisplayedTasks.length === 1 ? 'result' : 'results'} for &ldquo;{committedSearchQuery || searchQuery}&rdquo;
                    </div>
                  )}
                  <TaskList
                    tasks={finalDisplayedTasks}
                    projects={projects}
                    showCompleted={showCompleted}
                    onToggleCompleted={handleToggleCompleted}
                    sortMode={sortMode}
                    sortDirection={sortDirection}
                    onSortModeChange={handleSortModeChange}
                    onToggleSortDirection={handleToggleSortDirection}
                    onRefreshOrder={handleRefreshOrder}
                    isRefreshingOrder={isRefreshingOrder}
                    density={taskDensity}
                    onDensityChange={handleDensityChange}
                    onUpdate={handleUpdateTask}
                    onStar={handleStarTask}
                    onDelete={handleDeleteTask}
                    onComplete={handleCompleteTask}
                    onUncomplete={handleUncompleteTask}
                    onHeat={handleHeatRequest}
                    onCool={handleCoolRequest}
                    onTouch={handleTouchTask}
                    highlightedTask={highlightedTask}
                    recurringCompletionSignals={recurringCompletionSignals}
                    isMobile={isClientMobile}
                    enableSwipeGestures={isClientMobile && isTouchDevice}
                    onTaskPress={handleOpenTaskDetail}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={isRefreshModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelRefreshPrompt();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refresh task order</DialogTitle>
            <DialogDescription>
              Task positions have shifted due to other edits. Refresh the list so heat and cool adjustments
              use the latest context.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingHeatAction?.type === "cool" ? "Cool" : "Heat"} will continue automatically once the refresh
            completes successfully.
          </p>
          <DialogFooter className="mt-6 flex flex-row justify-end gap-3 sm:flex-row">
            <Button variant="ghost" onClick={handleCancelRefreshPrompt} disabled={isRefreshingOrder}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRefreshPrompt} disabled={isRefreshingOrder}>
              {isRefreshingOrder ? "Refreshing..." : "Refresh order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
