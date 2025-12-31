import { useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Filter state for the task list
 */
export interface FilterState {
  /**
   * Current project filter
   * - number: specific project ID
   * - null: "No Project" filter (tasks without a project)
   * - 'all': show all tasks
   * - 'focus': show only focused tasks
   */
  projectId: number | null | "all" | "focus";

  /**
   * Current search query
   */
  searchQuery: string;
}

const STORAGE_KEY = "toasty:filter-state";

const DEFAULT_FILTER_STATE: FilterState = {
  projectId: "all",
  searchQuery: "",
};

/**
 * Hook for managing filter state (project selection and search)
 * Persists selected project to AsyncStorage
 */
export function useFilterState() {
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load filter state from AsyncStorage on mount
  useEffect(() => {
    async function loadFilterState() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<FilterState>;
          // Only restore projectId, not searchQuery (always start fresh)
          if (parsed.projectId !== undefined) {
            setFilterState((prev) => ({
              ...prev,
              projectId: parsed.projectId as FilterState["projectId"],
            }));
          }
        }
      } catch (error) {
        console.warn("Failed to load filter state:", error);
      } finally {
        setIsLoaded(true);
      }
    }

    loadFilterState();
  }, []);

  // Persist projectId to AsyncStorage whenever it changes
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    async function saveFilterState() {
      try {
        // Only persist projectId, not searchQuery
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ projectId: filterState.projectId })
        );
      } catch (error) {
        console.warn("Failed to save filter state:", error);
      }
    }

    saveFilterState();
  }, [filterState.projectId, isLoaded]);

  /**
   * Set the project filter
   */
  const setProjectId = useCallback(
    (projectId: number | null | "all" | "focus") => {
      setFilterState((prev) => ({ ...prev, projectId }));
    },
    []
  );

  /**
   * Set the search query
   */
  const setSearchQuery = useCallback((searchQuery: string) => {
    setFilterState((prev) => ({ ...prev, searchQuery }));
  }, []);

  /**
   * Clear the search query
   */
  const clearSearch = useCallback(() => {
    setFilterState((prev) => ({ ...prev, searchQuery: "" }));
  }, []);

  /**
   * Reset filter to show all tasks
   */
  const resetFilter = useCallback(() => {
    setFilterState(DEFAULT_FILTER_STATE);
  }, []);

  /**
   * Check if a filter is active (not showing "all" tasks)
   */
  const isFiltered = filterState.projectId !== "all" || filterState.searchQuery !== "";

  /**
   * Get a display label for the current filter
   */
  const getFilterLabel = useCallback(
    (projects: Array<{ id: number; name: string }>) => {
      if (filterState.projectId === "all") {
        return "All Tasks";
      }
      if (filterState.projectId === "focus") {
        return "Focused";
      }
      if (filterState.projectId === null) {
        return "No Project";
      }
      const project = projects.find((p) => p.id === filterState.projectId);
      return project?.name ?? "Unknown Project";
    },
    [filterState.projectId]
  );

  return {
    filterState,
    projectId: filterState.projectId,
    searchQuery: filterState.searchQuery,
    isFiltered,
    isLoaded,
    setProjectId,
    setSearchQuery,
    clearSearch,
    resetFilter,
    getFilterLabel,
  };
}
