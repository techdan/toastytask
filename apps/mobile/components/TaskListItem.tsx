/**
 * TaskListItem Component
 *
 * A task row component displaying:
 * - Left color strip (heat indicator)
 * - Checkbox for completion
 * - Heat/Importance badge
 * - Title with priority styling
 * - Meta row (due date, priority, project) in comfortable mode
 * - Star button
 * - Notes indicator
 */

import { View, Text, StyleSheet, Pressable } from "react-native";
import { StickyNote } from "lucide-react-native";
import type { TaskDTO, ProjectDTO } from "@toasty/contracts";
import {
  useCompleteTask,
  useUncompleteTask,
  useCycleStarTask,
} from "@/hooks/useTasks";
import { HeatBadge, type BadgeMode } from "@/components/ui/HeatBadge";
import { StarButton, type StarLevel } from "@/components/ui/StarButton";
import { DueDateDisplay } from "@/components/ui/DueDateDisplay";
import { PriorityText } from "@/components/ui/PriorityText";
import { Checkbox } from "@/components/ui/Checkbox";
import { ColorDot, DEFAULT_PROJECT_COLOR } from "@/components/ui/ColorDot";
import {
  getHeatColor,
} from "@/constants/colors";
import {
  spacing,
  componentSize,
  layout,
} from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

// Extended task type with fresh calculated values
export interface TaskWithFresh extends TaskDTO {
  _freshHeat?: number;
  _freshImportance?: number;
}

export type DensityMode = "compact" | "comfortable";

interface TaskListItemProps {
  /** The task to display */
  task: TaskWithFresh;
  /** Callback when the task row is pressed */
  onPress: () => void;
  /** Associated project (optional) */
  project?: ProjectDTO | null;
  /** Display mode for badge (heat or importance) */
  badgeMode?: BadgeMode;
  /** Callback when badge is tapped to toggle mode */
  onBadgeModeToggle?: () => void;
  /** Density mode affects padding and meta row visibility */
  density?: DensityMode;
  /** Whether the task is currently focused */
  isFocused?: boolean;
}

export function TaskListItem({
  task,
  onPress,
  project,
  badgeMode = "heat",
  onBadgeModeToggle,
  density = "comfortable",
  isFocused = false,
}: TaskListItemProps) {
  const themeColors = useThemeColors();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const cycleStarTask = useCycleStarTask();

  // Derived state
  const isCompleted = !!task.completedAt;
  const isUntouched = !task.lastTouchedAt && !task.lastHeatTouchedAt;
  const hasNotes = task.notes && task.notes.length > 0;

  // Use fresh calculated values or fall back to stored values
  const heat = task._freshHeat ?? task.heat ?? 0;
  const importance = task._freshImportance ?? task.importanceV1 ?? 5;
  const heatColor = getHeatColor(heat);

  // Handlers
  const handleComplete = () => {
    if (isCompleted) {
      uncompleteTask.mutate(task.id);
    } else {
      completeTask.mutate(task.id);
    }
  };

  const handleStar = () => {
    cycleStarTask.mutate(task.id);
  };

  // Density-based padding
  const containerPadding =
    density === "compact"
      ? layout.taskItemPaddingCompact
      : layout.taskItemPaddingComfortable;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: themeColors.card,
          paddingVertical: containerPadding,
          borderBottomColor: themeColors.borderMuted,
        },
        isFocused ? styles.focused : null,
        isCompleted && styles.completed,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      {/* Left color strip */}
      <View
        style={[
          styles.colorStrip,
          { backgroundColor: isCompleted ? themeColors.textMuted : heatColor },
        ]}
      />

      {/* Checkbox */}
      <View style={styles.checkboxContainer}>
        <Checkbox checked={isCompleted} onToggle={handleComplete} />
      </View>

      {/* Heat/Importance Badge */}
      <View style={styles.badgeContainer}>
        <HeatBadge
          heat={heat}
          importance={importance}
          mode={badgeMode}
          isCompleted={isCompleted}
          onPress={onBadgeModeToggle}
        />
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {/* Title */}
        <PriorityText
          priority={task.priority}
          isNew={isUntouched}
          isCompleted={isCompleted}
          numberOfLines={density === "compact" ? 1 : 2}
        >
          {task.title}
        </PriorityText>

        {/* Meta row (comfortable mode only) */}
        {density === "comfortable" && (
          <View style={styles.metaRow}>
            {/* Due Date */}
            <DueDateDisplay dueAt={task.dueAt} isCompleted={isCompleted} size="small" />

            {/* Priority label */}
            {task.priority !== "medium" && (
              <>
                <Text style={[styles.metaSeparator, { color: themeColors.textMuted }]}>
                  •
                </Text>
                <Text
                  style={[
                    styles.metaText,
                    { color: themeColors.textSecondary },
                  ]}
                >
                  {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </Text>
              </>
            )}

            {/* Project */}
            {project && (
              <>
                <Text style={[styles.metaSeparator, { color: themeColors.textMuted }]}>
                  •
                </Text>
                <View style={styles.projectMeta}>
                  <ColorDot
                    color={project.colorHex || DEFAULT_PROJECT_COLOR}
                    size={8}
                  />
                  <Text
                    style={[
                      styles.metaText,
                      { color: themeColors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {project.name}
                  </Text>
                </View>
              </>
            )}

            {/* Recurrence indicator */}
            {task.repeatType && task.repeatType !== "none" && (
              <>
                <Text style={[styles.metaSeparator, { color: themeColors.textMuted }]}>
                  •
                </Text>
                <Text
                  style={[
                    styles.metaText,
                    { color: themeColors.textSecondary },
                  ]}
                >
                  🔁
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Star Button */}
      <StarButton
        level={(task.starLevel || 0) as StarLevel}
        onPress={handleStar}
        disabled={isCompleted}
      />

      {/* Notes Indicator */}
      {hasNotes && (
        <View style={styles.notesIndicator}>
          <StickyNote
            size={componentSize.notesIconSize}
            color={themeColors.textMuted}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: layout.cardBorderRadius,
    paddingRight: spacing.md,
    marginBottom: layout.cardMarginBottom,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  completed: {
    opacity: 0.6,
  },
  focused: {
    borderLeftWidth: 2,
    borderLeftColor: "#4ADE80",
  },
  pressed: {
    opacity: 0.8,
  },
  colorStrip: {
    width: componentSize.colorStripWidth,
    alignSelf: "stretch",
  },
  checkboxContainer: {
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  badgeContainer: {
    paddingRight: spacing.sm,
  },
  content: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    flexWrap: "wrap",
  },
  metaSeparator: {
    marginHorizontal: spacing.xs,
    ...textStyles.caption,
  },
  metaText: {
    ...textStyles.caption,
  },
  projectMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  notesIndicator: {
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
  },
});
