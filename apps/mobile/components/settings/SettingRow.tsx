/**
 * SettingRow Component
 *
 * A single row in a settings section.
 * Can display a label with a value, chevron indicator, or custom right content.
 */

import { View, Text, StyleSheet, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { spacing, layout } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

interface SettingRowProps {
  /** Label text displayed on the left */
  label: string;
  /** Value text displayed on the right (optional) */
  value?: string;
  /** Callback when row is pressed (makes row tappable) */
  onPress?: () => void;
  /** Show chevron indicator (default: true if onPress is provided) */
  showChevron?: boolean;
  /** Custom right content (overrides value and chevron) */
  rightContent?: React.ReactNode;
  /** Whether this is the last row (no bottom border) */
  isLast?: boolean;
  /** Text color for the value (optional, for special styling like danger) */
  valueColor?: string;
}

export function SettingRow({
  label,
  value,
  onPress,
  showChevron,
  rightContent,
  isLast = false,
  valueColor,
}: SettingRowProps) {
  const themeColors = useThemeColors();

  // Default showChevron to true if onPress is provided and no rightContent
  const shouldShowChevron = showChevron ?? (!!onPress && !rightContent);

  const content = (
    <View
      style={[
        styles.container,
        !isLast && { borderBottomColor: themeColors.border },
        !isLast && styles.withBorder,
      ]}
    >
      <Text style={[styles.label, { color: themeColors.text }]}>{label}</Text>

      <View style={styles.rightSide}>
        {rightContent ? (
          rightContent
        ) : (
          <>
            {value && (
              <Text
                style={[
                  styles.value,
                  { color: valueColor || themeColors.textSecondary },
                ]}
              >
                {value}
              </Text>
            )}
            {shouldShowChevron && (
              <ChevronRight size={20} color={themeColors.textMuted} />
            )}
          </>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: layout.settingRowHeight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  withBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...textStyles.body,
    flex: 1,
  },
  rightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  value: {
    ...textStyles.body,
  },
});
