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
import { AlertCircle, WifiOff, RefreshCw, Clock, Upload } from "lucide-react-native";

// Hooks
import { useTasks, useHeatTask, useCoolTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useCreateProject, useUpdateProject, useDeleteProject } from "@/hooks/useProjectMutations";
import { useFilterState } from "@/hooks/useFilterState";
import { useSync } from "@/hooks/useSync";
import { useFailedOps } from "@/hooks/useSyncStatus";
import { FailedOpsModal } from "@/components/sync/FailedOpsModal";
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
  const { isSyncing, isOffline, error: syncError, progressMessage, pendingCount, lastPullAt, sync } = useSync();
  const { failedOps, retry: retryOp, discard: discardOp } = useFailedOps();

  // Mutations
  const heatTask = useHeatTask();
  const coolTask = useCoolTask();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // UI state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isFailedOpsVisible, setIsFailedOpsVisible] = useState(false);

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

  const handleCreateProject = useCallback(
    (name: string, colorHex: string) => {
      createProject.mutate({ name, colorHex });
    },
    [createProject]
  );

  const handleUpdateProject = useCallback(
    (id: number, data: Partial<{ name: string; colorHex: string; archived: boolean }>) => {
      updateProject.mutate({ id, data });
    },
    [updateProject]
  );

  const handleDeleteProject = useCallback(
    (id: number) => {
      deleteProject.mutate(id);
    },
    [deleteProject]
  );

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

  // Format last-synced time as a human-readable string
  const lastSyncedLabel = useMemo(() => {
    if (!lastPullAt) return "Never synced";
    const diffMs = Date.now() - new Date(lastPullAt).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }, [lastPullAt]);

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
        <View style={[styles.syncBannerColumn, styles.syncBannerError]}>
          <TouchableOpacity style={styles.syncBannerRow} onPress={sync}>
            <AlertCircle size={16} color="#dc2626" />
            <Text style={[styles.syncBannerTextError, { flex: 1 }]}>
              Sync failed: {syncError.message || "Connection error"}
            </Text>
            <RefreshCw size={14} color="#dc2626" />
          </TouchableOpacity>
          {failedOps.length > 0 && (
            <TouchableOpacity onPress={() => setIsFailedOpsVisible(true)}>
              <Text style={styles.failedOpsLink}>
                {failedOps.length} operation{failedOps.length !== 1 ? "s" : ""} permanently failed — tap to review
              </Text>
            </TouchableOpacity>
          )}
        </View>
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

    // Idle state: show pending count badge or last-synced time
    if (pendingCount > 0) {
      return (
        <TouchableOpacity
          style={[styles.syncBanner, styles.syncBannerIdle]}
          onPress={sync}
        >
          <Upload size={14} color="#6b7280" />
          <Text style={styles.syncBannerTextIdle}>
            {pendingCount} change{pendingCount !== 1 ? "s" : ""} pending sync
          </Text>
        </TouchableOpacity>
      );
    }

    if (!lastPullAt || Date.now() - new Date(lastPullAt).getTime() > 60 * 60 * 1000) {
      return (
        <View style={[styles.syncBanner, styles.syncBannerIdle]}>
          <Clock size={14} color="#6b7280" />
          <Text style={styles.syncBannerTextIdle}>Last synced: {lastSyncedLabel}</Text>
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
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
      />

      {/* Failed Ops Modal */}
      <FailedOpsModal
        visible={isFailedOpsVisible}
        ops={failedOps}
        onClose={() => setIsFailedOpsVisible(false)}
        onRetry={(key) => { retryOp(key); sync(); }}
        onDiscard={discardOp}
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
  syncBannerIdle: {
    backgroundColor: "#f3f4f6",
  },
  syncBannerTextIdle: {
    ...textStyles.caption,
    color: "#6b7280",
    flex: 1,
  },
  syncBannerColumn: {
    flexDirection: "column",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  syncBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  failedOpsLink: {
    ...textStyles.caption,
    color: "#dc2626",
    textDecorationLine: "underline",
    marginTop: spacing.xs,
  },
});
