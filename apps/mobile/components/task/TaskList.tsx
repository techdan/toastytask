/**
 * TaskList Component
 *
 * Unified task list for the v2 mobile UI.
 * Features:
 * - Single FlatList with all tasks (filtered by project/focus)
 * - User-selectable sorting (importance, heat, created, modified)
 * - Pull-to-refresh triggers sync
 * - Swipeable rows for heat/cool actions
 * - Optional completed tasks section
 * - Empty states for various scenarios
 */

import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  type ListRenderItemInfo,
} from "react-native";
import type { TaskWithFreshValuesDTO, ProjectDTO } from "@toasty/contracts";
import { SwipeableTaskRow } from "./SwipeableTaskRow";
import { CompletedTasksSection } from "./CompletedTasksSection";
import { SearchEmptyState } from "../navigation/SearchResults";
import { useThemeColors, sharedColors } from "../../constants";
import { spacing } from "../../constants/spacing";
import { textStyles } from "../../constants/typography";
import type { DensityMode } from "../TaskListItem";
import type { BadgeMode } from "../ui/HeatBadge";

interface TaskListProps {
  /** Active (uncompleted) tasks to display */
  tasks: TaskWithFreshValuesDTO[];
  /** Completed tasks (optional, shown in collapsible section) */
  completedTasks?: TaskWithFreshValuesDTO[];
  /** All projects for looking up project info */
  projects: ProjectDTO[];
  /** Display density mode */
  density: DensityMode;
  /** Badge display mode (heat or importance) */
  badgeMode: BadgeMode;
  /** Whether to show the completed tasks section */
  showCompleted: boolean;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Whether a refresh is in progress */
  isRefreshing: boolean;
  /** Callback for pull-to-refresh */
  onRefresh: () => void;
  /** Callback when a task row is pressed */
  onTaskPress: (taskId: number) => void;
  /** Callback when a task is heated (swipe right) */
  onHeat: (taskId: number) => void;
  /** Callback when a task is cooled (swipe left) */
  onCool: (taskId: number) => void;
  /** Callback when badge mode is toggled */
  onBadgeModeToggle: () => void;
  /** Current search query (for empty state) */
  searchQuery?: string;
  /** Current filter label (for empty state) */
  filterLabel?: string;
}

export function TaskList({
  tasks,
  completedTasks = [],
  projects,
  density,
  badgeMode,
  showCompleted,
  isLoading,
  isRefreshing,
  onRefresh,
  onTaskPress,
  onHeat,
  onCool,
  onBadgeModeToggle,
  searchQuery = "",
  filterLabel = "All Tasks",
}: TaskListProps) {
  const colors = useThemeColors();

  // Create a lookup map for projects
  const projectsMap = useMemo(() => {
    const map = new Map<number, ProjectDTO>();
    for (const project of projects) {
      map.set(project.id, project);
    }
    return map;
  }, [projects]);

  // Get project for a task
  const getProject = useCallback(
    (projectId: number | null) => {
      if (projectId === null) return null;
      return projectsMap.get(projectId) ?? null;
    },
    [projectsMap]
  );

  // Render a single task item
  const renderTask = useCallback(
    ({ item: task }: ListRenderItemInfo<TaskWithFreshValuesDTO>) => {
      const isCompleted = !!task.completedAt;

      return (
        <SwipeableTaskRow
          task={task}
          onPress={() => onTaskPress(task.id)}
          onHeat={() => onHeat(task.id)}
          onCool={() => onCool(task.id)}
          project={getProject(task.projectId)}
          badgeMode={badgeMode}
          onBadgeModeToggle={onBadgeModeToggle}
          density={density}
          isFocused={task.isFocused}
          enableSwipe={!isCompleted}
        />
      );
    },
    [onTaskPress, onHeat, onCool, getProject, badgeMode, onBadgeModeToggle, density]
  );

  // Key extractor
  const keyExtractor = useCallback(
    (task: TaskWithFreshValuesDTO) => `task-${task.id}`,
    []
  );

  // List header (for spacing)
  const ListHeader = useMemo(() => <View style={styles.listHeader} />, []);

  // List footer (completed tasks section if showing)
  const ListFooter = useMemo(() => {
    if (!showCompleted || completedTasks.length === 0) {
      return <View style={styles.listFooter} />;
    }

    return (
      <View style={styles.completedSection}>
        <CompletedTasksSection
          tasks={completedTasks}
          projects={projects}
          density={density}
          badgeMode={badgeMode}
          onTaskPress={onTaskPress}
          onBadgeModeToggle={onBadgeModeToggle}
        />
        <View style={styles.listFooter} />
      </View>
    );
  }, [
    showCompleted,
    completedTasks,
    projects,
    density,
    badgeMode,
    onTaskPress,
    onBadgeModeToggle,
  ]);

  // Empty state component
  const EmptyComponent = useMemo(() => {
    // Show search empty state if searching
    if (searchQuery.trim()) {
      return <SearchEmptyState query={searchQuery} />;
    }

    // Show loading state
    if (isLoading) {
      return null; // Don't show empty state while loading
    }

    // Show empty state based on filter
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyIcon]}>📋</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          {filterLabel === "Focused" ? "No focused tasks" : "No tasks yet"}
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
          {filterLabel === "Focused"
            ? "Use the eye icon to focus on important tasks"
            : filterLabel === "All Tasks"
            ? "Tap + to add your first task"
            : `No tasks in ${filterLabel}`}
        </Text>
      </View>
    );
  }, [searchQuery, isLoading, filterLabel, colors]);

  return (
    <FlatList
      data={tasks}
      renderItem={renderTask}
      keyExtractor={keyExtractor}
      ListHeaderComponent={ListHeader}
      ListFooterComponent={ListFooter}
      ListEmptyComponent={EmptyComponent}
      contentContainerStyle={[
        styles.listContent,
        tasks.length === 0 && styles.listContentEmpty,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={sharedColors.brand.primary}
          colors={[sharedColors.brand.primary]}
        />
      }
      showsVerticalScrollIndicator={false}
      // Performance optimizations
      removeClippedSubviews
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={15}
      getItemLayout={
        density === "compact"
          ? (_, index) => ({
              length: COMPACT_ITEM_HEIGHT,
              offset: COMPACT_ITEM_HEIGHT * index,
              index,
            })
          : undefined
      }
    />
  );
}

// Approximate item height for compact mode (for getItemLayout optimization)
const COMPACT_ITEM_HEIGHT = 52;

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 0,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listHeader: {
    height: spacing.sm,
  },
  listFooter: {
    height: spacing.xxl * 3, // Extra space at bottom for FAB
  },
  completedSection: {
    marginTop: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...textStyles.label,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...textStyles.small,
    textAlign: "center",
  },
});
