/**
 * CompletedTasksSection Component
 *
 * Collapsible section showing completed tasks.
 * - Shows tasks completed in the last 7 days
 * - Collapsed by default
 * - Header shows count with expand/collapse chevron
 */

import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import type { TaskWithFreshValuesDTO, ProjectDTO } from "@toasty/contracts";
import { TaskListItem, type DensityMode } from "../TaskListItem";
import type { BadgeMode } from "../ui/HeatBadge";
import { useThemeColors } from "../../constants";
import { spacing, borderRadius } from "../../constants/spacing";
import { textStyles, fontWeight } from "../../constants/typography";

// Number of days to show completed tasks
const COMPLETED_TASKS_VISIBLE_DAYS = 7;

interface CompletedTasksSectionProps {
  /** Completed tasks to display */
  tasks: TaskWithFreshValuesDTO[];
  /** All projects for looking up project info */
  projects: ProjectDTO[];
  /** Display density mode */
  density: DensityMode;
  /** Badge display mode */
  badgeMode: BadgeMode;
  /** Callback when a task is pressed */
  onTaskPress: (taskId: number) => void;
  /** Callback when badge mode is toggled */
  onBadgeModeToggle: () => void;
}

export function CompletedTasksSection({
  tasks,
  projects,
  density,
  badgeMode,
  onTaskPress,
  onBadgeModeToggle,
}: CompletedTasksSectionProps) {
  const colors = useThemeColors();
  const [isExpanded, setIsExpanded] = useState(false);

  // Animation for expand/collapse
  const rotateValue = useSharedValue(0);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const newValue = !prev;
      rotateValue.value = withTiming(newValue ? 1 : 0, { duration: 200 });
      return newValue;
    });
  }, [rotateValue]);

  // Filter to only show recently completed tasks
  const recentlyCompleted = tasks.filter((task) => {
    if (!task.completedAt) return false;
    const completedDate = new Date(task.completedAt);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - COMPLETED_TASKS_VISIBLE_DAYS);
    return completedDate >= cutoffDate;
  });

  // Create project lookup map
  const projectsMap = new Map<number, ProjectDTO>();
  for (const project of projects) {
    projectsMap.set(project.id, project);
  }

  const getProject = (projectId: number | null) => {
    if (projectId === null) return null;
    return projectsMap.get(projectId) ?? null;
  };

  // Animated style for chevron rotation
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${rotateValue.value * 180}deg`,
      },
    ],
  }));

  if (recentlyCompleted.length === 0) {
    return null;
  }

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Completed tasks, ${recentlyCompleted.length} items. ${isExpanded ? "Collapse" : "Expand"}`}
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.headerText}>
          Completed ({recentlyCompleted.length})
        </Text>
        <Animated.View style={chevronStyle}>
          <Ionicons
            name="chevron-down"
            size={20}
            color={colors.textSecondary}
          />
        </Animated.View>
      </TouchableOpacity>

      {/* Content */}
      {isExpanded && (
        <View style={styles.content}>
          {recentlyCompleted.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              onPress={() => onTaskPress(task.id)}
              project={getProject(task.projectId)}
              badgeMode={badgeMode}
              onBadgeModeToggle={onBadgeModeToggle}
              density={density}
              isFocused={false}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    headerText: {
      ...textStyles.label,
      color: colors.textSecondary,
    },
    content: {
      marginTop: spacing.xs,
    },
  });
}
