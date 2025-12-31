/**
 * Todo Tab Screen
 *
 * Main task list screen showing tasks in the "todo" bucket.
 * Features:
 * - SwipeableTaskRow with heat/cool gestures
 * - QuickAddFAB for adding new tasks
 * - Pull-to-refresh
 * - Empty state with helpful message
 * - Badge mode toggle (heat/importance)
 */

import { useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ClipboardList, AlertCircle, WifiOff, RefreshCw } from "lucide-react-native";
import { useTasks, useHeatTask, useCoolTask } from "@/hooks/useTasks";
import { useSync } from "@/hooks/useSync";
import { SwipeableTaskRow } from "@/components/task/SwipeableTaskRow";
import { QuickAddFAB } from "@/components/add/QuickAddFAB";
import { QuickAddModal } from "@/components/add/QuickAddModal";
import { useThemeColors } from "@/constants/theme";
import { spacing, borderRadius } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { brand, semantic } from "@/constants/colors";
import type { BadgeMode } from "@/components/ui/HeatBadge";
import type { DensityMode } from "@/components/TaskListItem";

export default function TodoScreen() {
  const router = useRouter();
  const themeColors = useThemeColors();
  const { tasks, isLoading, error, refetch } = useTasks({ bucket: "todo" });
  const { isSyncing, isOffline, error: syncError, progressMessage, sync } = useSync();
  const heatTask = useHeatTask();
  const coolTask = useCoolTask();

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [badgeMode, setBadgeMode] = useState<BadgeMode>("heat");
  const [density] = useState<DensityMode>("comfortable");

  const toggleBadgeMode = useCallback(() => {
    setBadgeMode((current) => (current === "heat" ? "importance" : "heat"));
  }, []);

  const handleHeat = useCallback(
    (taskId: number) => {
      const visibleTasks = tasks.map((t) => ({
        id: t.id,
        heat: t._freshHeat,
      }));
      heatTask.mutate({ id: taskId, visibleTasks });
    },
    [tasks, heatTask]
  );

  const handleCool = useCallback(
    (taskId: number) => {
      const visibleTasks = tasks.map((t) => ({
        id: t.id,
        heat: t._freshHeat,
      }));
      coolTask.mutate({ id: taskId, visibleTasks });
    },
    [tasks, coolTask]
  );

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background }]}>
        <Text style={[styles.errorText, { color: themeColors.text }]}>
          Failed to load tasks
        </Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Sync status banner component
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
        <TouchableOpacity style={[styles.syncBanner, styles.syncBannerError]} onPress={sync}>
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
          <Text style={styles.syncBannerTextOffline}>Offline - changes will sync when connected</Text>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {renderSyncBanner()}
      <FlatList
        data={tasks}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <SwipeableTaskRow
            task={item}
            onPress={() => router.push(`/task/${item.id}`)}
            onHeat={() => handleHeat(item.id)}
            onCool={() => handleCool(item.id)}
            badgeMode={badgeMode}
            onBadgeModeToggle={toggleBadgeMode}
            density={density}
            enableSwipe={!item.completedAt}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshing={isLoading}
        onRefresh={refetch}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ClipboardList
              size={64}
              color={themeColors.textMuted}
              strokeWidth={1.5}
            />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
              {isLoading ? "Loading..." : "No tasks yet"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              {!isLoading && "Tap the + button to add your first task"}
            </Text>
          </View>
        }
      />

      <QuickAddFAB onPress={() => setIsAddModalVisible(true)} />

      <QuickAddModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        bucket="todo"
      />
    </View>
  );
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
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  errorText: {
    ...textStyles.body,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: brand.primary,
    borderRadius: borderRadius.md,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...textStyles.screenTitle,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    ...textStyles.body,
    textAlign: "center",
  },
});
