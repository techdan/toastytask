/**
 * Watch Tab Screen
 *
 * Task list screen showing tasks in the "watch" bucket.
 * These are tasks to keep an eye on but not actively work on.
 * Features:
 * - SwipeableTaskRow with heat/cool gestures
 * - QuickAddFAB for adding new tasks
 * - Pull-to-refresh
 * - Empty state with helpful message
 * - Badge mode toggle (heat/importance)
 */

import { useState, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Eye } from "lucide-react-native";
import { useTasks, useHeatTask, useCoolTask } from "@/hooks/useTasks";
import { SwipeableTaskRow } from "@/components/task/SwipeableTaskRow";
import { QuickAddFAB } from "@/components/add/QuickAddFAB";
import { QuickAddModal } from "@/components/add/QuickAddModal";
import { useThemeColors } from "@/constants/theme";
import { spacing, borderRadius } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { brand } from "@/constants/colors";
import type { BadgeMode } from "@/components/ui/HeatBadge";
import type { DensityMode } from "@/components/TaskListItem";

export default function WatchScreen() {
  const router = useRouter();
  const themeColors = useThemeColors();
  const { tasks, isLoading, error, refetch } = useTasks({ bucket: "watch" });
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

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
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
            <Eye
              size={64}
              color={themeColors.textMuted}
              strokeWidth={1.5}
            />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
              {isLoading ? "Loading..." : "No tasks to watch"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              {!isLoading && "Tasks you're keeping an eye on will appear here"}
            </Text>
          </View>
        }
      />

      <QuickAddFAB onPress={() => setIsAddModalVisible(true)} />

      <QuickAddModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        bucket="watch"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
