/**
 * Main Task Screen (v2)
 *
 * The primary screen of the v2 mobile app, combining:
 * - MobileHeader with hamburger menu, search, and options
 * - ProjectsDrawer for filtering by project/focus
 * - TaskList with user-selectable sorting
 * - QuickAddFAB and QuickAddModal for task creation
 * - OptionsMenu for display preferences
 * - SearchResults banner when searching
 */

import { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { AlertCircle, WifiOff, RefreshCw } from "lucide-react-native";

// Hooks
import { useTasks, useHeatTask, useCoolTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useFilterState } from "@/hooks/useFilterState";
import { useSync } from "@/hooks/useSync";
import {
  useAppSettings,
  useAppSettingsUpdaters,
  useToggleBadgeMode,
} from "@/contexts/AppSettingsContext";

// Components
import {
  MobileHeader,
  ProjectsDrawer,
  OptionsMenu,
  SearchResults,
} from "@/components/navigation";
import { TaskList } from "@/components/task/TaskList";
import { QuickAddFAB } from "@/components/add/QuickAddFAB";
import { QuickAddModal } from "@/components/add/QuickAddModal";

// Constants
import { useThemeColors } from "@/constants/theme";
import { spacing } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";

function MainScreenContent() {
  const router = useRouter();
  const themeColors = useThemeColors();

  // App settings from context
  const appSettings = useAppSettings();
  const {
    setSortMode,
    setSortDirection,
    setDensity,
    setShowCompleted,
  } = useAppSettingsUpdaters();
  const toggleBadgeMode = useToggleBadgeMode();

  // Filter state
  const {
    projectId,
    searchQuery,
    setProjectId,
    setSearchQuery,
    clearSearch,
    getFilterLabel,
  } = useFilterState();

  // Projects for drawer
  const {
    projects,
    totalTaskCount,
    focusedTaskCount,
    noProjectTaskCount,
    isLoading: projectsLoading,
  } = useProjects();

  // Tasks with filtering and sorting
  const {
    tasks,
    uncompletedTasks,
    completedTasks,
    isLoading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useTasks({
    projectId,
    sortMode: appSettings.sortMode,
    sortDirection: appSettings.sortDirection,
    includeCompleted: appSettings.showCompleted,
    searchQuery,
  });

  // Sync
  const { isSyncing, isOffline, error: syncError, progressMessage, sync } = useSync();

  // Mutations
  const heatTask = useHeatTask();
  const coolTask = useCoolTask();

  // UI state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);

  // Get the project name for the current filter (for QuickAddModal)
  const currentFilterLabel = useMemo(
    () => getFilterLabel(projects),
    [getFilterLabel, projects]
  );

  // Get project name if filtering by a specific project
  const currentProjectName = useMemo(() => {
    if (typeof projectId === "number") {
      const project = projects.find((p) => p.id === projectId);
      return project?.name ?? undefined;
    }
    return undefined;
  }, [projectId, projects]);

  // Handlers
  const handleOpenDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const handleOpenOptions = useCallback(() => {
    setIsOptionsOpen(true);
  }, []);

  const handleCloseOptions = useCallback(() => {
    setIsOptionsOpen(false);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setSearchInputValue(searchQuery);
    setIsSearchActive(true);
  }, [searchQuery]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInputValue(value);
  }, []);

  const handleSearchSubmit = useCallback(
    (value: string) => {
      setSearchQuery(value);
      setIsSearchActive(false);
    },
    [setSearchQuery]
  );

  const handleSearchCancel = useCallback(() => {
    setSearchInputValue("");
    setIsSearchActive(false);
  }, []);

  const handleClearSearch = useCallback(() => {
    clearSearch();
    setSearchInputValue("");
  }, [clearSearch]);

  const handleSelectProject = useCallback(
    (id: typeof projectId) => {
      setProjectId(id);
    },
    [setProjectId]
  );

  const handleNavigateSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleTaskPress = useCallback(
    (taskId: number) => {
      router.push(`/task/${taskId}`);
    },
    [router]
  );

  const handleHeat = useCallback(
    (taskId: number) => {
      const visibleTasks = uncompletedTasks.map((t) => ({
        id: t.id,
        heat: t._freshHeat,
      }));
      heatTask.mutate({ id: taskId, visibleTasks });
    },
    [uncompletedTasks, heatTask]
  );

  const handleCool = useCallback(
    (taskId: number) => {
      const visibleTasks = uncompletedTasks.map((t) => ({
        id: t.id,
        heat: t._freshHeat,
      }));
      coolTask.mutate({ id: taskId, visibleTasks });
    },
    [uncompletedTasks, coolTask]
  );

  const handleRefresh = useCallback(async () => {
    await sync();
    refetchTasks();
  }, [sync, refetchTasks]);

  const handleOpenAddModal = useCallback(() => {
    setIsAddModalVisible(true);
  }, []);

  const handleCloseAddModal = useCallback(() => {
    setIsAddModalVisible(false);
  }, []);

  // Sync status banner
  const renderSyncBanner = () => {
    if (isSyncing && progressMessage) {
      return (
        <View style={[styles.syncBanner, styles.syncBannerProgress]}>
          <ActivityIndicator size="small" color="#1d4ed8" />
          <Text style={styles.syncBannerTextProgress}>{progressMessage}</Text>
        </View>
      );
    }

    if (syncError) {
      return (
        <TouchableOpacity
          style={[styles.syncBanner, styles.syncBannerError]}
          onPress={sync}
        >
          <AlertCircle size={16} color="#dc2626" />
          <Text style={styles.syncBannerTextError}>
            Sync failed: {syncError.message || "Connection error"}
          </Text>
          <RefreshCw size={14} color="#dc2626" />
        </TouchableOpacity>
      );
    }

    if (isOffline) {
      return (
        <View style={[styles.syncBanner, styles.syncBannerOffline]}>
          <WifiOff size={16} color="#92400e" />
          <Text style={styles.syncBannerTextOffline}>
            Offline - changes will sync when connected
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <MobileHeader
        onOpenDrawer={handleOpenDrawer}
        onOpenSearch={handleOpenSearch}
        onOpenOptions={handleOpenOptions}
        isSearchActive={isSearchActive}
        searchValue={searchInputValue}
        onSearchChange={handleSearchChange}
        onSearchSubmit={handleSearchSubmit}
        onSearchCancel={handleSearchCancel}
      />

      {/* Sync Banner */}
      {renderSyncBanner()}

      {/* Search Results Banner */}
      {searchQuery.trim() && !isSearchActive && (
        <SearchResults
          query={searchQuery}
          resultCount={uncompletedTasks.length}
          onClear={handleClearSearch}
        />
      )}

      {/* Task List */}
      <TaskList
        tasks={uncompletedTasks}
        completedTasks={completedTasks}
        projects={projects}
        density={appSettings.density}
        badgeMode={appSettings.badgeMode}
        showCompleted={appSettings.showCompleted}
        isLoading={tasksLoading || projectsLoading}
        isRefreshing={isSyncing}
        onRefresh={handleRefresh}
        onTaskPress={handleTaskPress}
        onHeat={handleHeat}
        onCool={handleCool}
        onBadgeModeToggle={toggleBadgeMode}
        searchQuery={searchQuery}
        filterLabel={currentFilterLabel}
      />

      {/* FAB */}
      <QuickAddFAB onPress={handleOpenAddModal} />

      {/* QuickAdd Modal */}
      <QuickAddModal
        visible={isAddModalVisible}
        onClose={handleCloseAddModal}
        projectId={typeof projectId === "number" ? projectId : undefined}
        projectName={currentProjectName}
      />

      {/* Projects Drawer */}
      <ProjectsDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        projects={projects}
        selectedProjectId={projectId}
        onSelectProject={handleSelectProject}
        totalTaskCount={totalTaskCount}
        focusedTaskCount={focusedTaskCount}
        noProjectTaskCount={noProjectTaskCount}
        onNavigateSettings={handleNavigateSettings}
      />

      {/* Options Menu */}
      <OptionsMenu
        isOpen={isOptionsOpen}
        onClose={handleCloseOptions}
        sortMode={appSettings.sortMode}
        onSortModeChange={setSortMode}
        sortDirection={appSettings.sortDirection}
        onSortDirectionChange={setSortDirection}
        density={appSettings.density}
        onDensityChange={setDensity}
        showCompleted={appSettings.showCompleted}
        onShowCompletedChange={setShowCompleted}
      />
    </View>
  );
}

/**
 * Main screen - uses AppSettingsProvider from root layout
 */
export default function MainScreen() {
  return <MainScreenContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  syncBannerProgress: {
    backgroundColor: "#dbeafe",
  },
  syncBannerError: {
    backgroundColor: "#fee2e2",
  },
  syncBannerOffline: {
    backgroundColor: "#fef3c7",
  },
  syncBannerTextProgress: {
    ...textStyles.caption,
    color: "#1d4ed8",
    flex: 1,
  },
  syncBannerTextError: {
    ...textStyles.caption,
    color: "#dc2626",
    flex: 1,
  },
  syncBannerTextOffline: {
    ...textStyles.caption,
    color: "#92400e",
    flex: 1,
  },
});
