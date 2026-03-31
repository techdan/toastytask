/**
 * TaskDetailHeader Component
 *
 * Header for the task detail screen with:
 * - Back button
 * - Heat/Importance badge (tappable to toggle)
 * - Star button
 * - Heat/Cool action buttons
 * - Created/Modified timestamps
 */

import { View, Text, StyleSheet, Pressable } from "react-native";
import { ArrowLeft, Flame, Snowflake, Eye, EyeOff } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeatBadge, type BadgeMode } from "@/components/ui/HeatBadge";
import { StarButton, type StarLevel } from "@/components/ui/StarButton";
import { swipe as swipeColors, semantic } from "@/constants/colors";
import { spacing } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

interface TaskDetailHeaderProps {
  /** Heat value */
  heat: number;
  /** Importance value */
  importance: number;
  /** Current badge mode */
  badgeMode: BadgeMode;
  /** Toggle badge mode */
  onBadgeModeToggle: () => void;
  /** Star level */
  starLevel: StarLevel;
  /** Star press handler */
  onStarPress: () => void;
  /** Heat button press handler */
  onHeatPress: () => void;
  /** Cool button press handler */
  onCoolPress: () => void;
  /** Whether task is focused */
  isFocused?: boolean;
  /** Focus toggle handler */
  onFocusToggle: () => void;
  /** Back button press handler */
  onBackPress: () => void;
  /** Task creation date */
  createdAt: Date | string;
  /** Task modification date */
  updatedAt?: Date | string | null;
  /** Whether task is completed */
  isCompleted?: boolean;
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function TaskDetailHeader({
  heat,
  importance,
  badgeMode,
  onBadgeModeToggle,
  starLevel,
  onStarPress,
  onHeatPress,
  onCoolPress,
  isFocused = false,
  onFocusToggle,
  onBackPress,
  createdAt,
  updatedAt,
  isCompleted = false,
}: TaskDetailHeaderProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.sm,
          backgroundColor: themeColors.card,
          borderBottomColor: themeColors.border,
        },
      ]}
    >
      <View style={styles.row}>
        {/* Back Button */}
        <Pressable
          style={styles.backButton}
          onPress={onBackPress}
          hitSlop={8}
        >
          <ArrowLeft size={24} color={themeColors.text} />
        </Pressable>

        {/* Center Controls */}
        <View style={styles.centerControls}>
          {/* Badge */}
          <HeatBadge
            heat={heat}
            importance={importance}
            mode={badgeMode}
            isCompleted={isCompleted}
            onPress={onBadgeModeToggle}
          />

          {/* Star */}
          <StarButton
            level={starLevel}
            onPress={onStarPress}
            disabled={isCompleted}
          />

          {/* Heat Button */}
          <Pressable
            style={[styles.actionButton, isCompleted && styles.disabled]}
            onPress={onHeatPress}
            disabled={isCompleted}
            hitSlop={4}
          >
            <Flame size={20} color={swipeColors.heat} />
          </Pressable>

          {/* Cool Button */}
          <Pressable
            style={[styles.actionButton, isCompleted && styles.disabled]}
            onPress={onCoolPress}
            disabled={isCompleted}
            hitSlop={4}
          >
            <Snowflake size={20} color={swipeColors.cool} />
          </Pressable>

          {/* Focus Toggle */}
          <Pressable
            style={[styles.actionButton, isCompleted && styles.disabled]}
            onPress={onFocusToggle}
            disabled={isCompleted}
            hitSlop={4}
          >
            {isFocused
              ? <Eye size={20} color={semantic.success} />
              : <EyeOff size={20} color={themeColors.textMuted} />
            }
          </Pressable>
        </View>

        {/* Timestamps */}
        <View style={styles.timestamps}>
          <Text style={[styles.timestampText, { color: themeColors.textMuted }]}>
            Created: {formatDate(createdAt)}
          </Text>
          {updatedAt && (
            <Text style={[styles.timestampText, { color: themeColors.textMuted }]}>
              Modified: {formatDate(updatedAt)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  centerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  actionButton: {
    padding: spacing.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  timestamps: {
    alignItems: "flex-end",
  },
  timestampText: {
    ...textStyles.caption,
  },
});
