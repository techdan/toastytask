/**
 * FieldRow Component
 *
 * A row displaying a label and tappable value for task detail fields.
 */

import { View, Text, StyleSheet, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { spacing } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

interface FieldRowProps {
  /** Label text */
  label: string;
  /** Current value display */
  value: React.ReactNode;
  /** Callback when row is pressed */
  onPress?: () => void;
  /** Whether the field is disabled */
  disabled?: boolean;
}

export function FieldRow({ label, value, onPress, disabled = false }: FieldRowProps) {
  const themeColors = useThemeColors();

  const content = (
    <View style={[styles.container, { borderBottomColor: themeColors.border }]}>
      <Text
        style={[
          styles.label,
          { color: themeColors.textSecondary },
          disabled && styles.disabled,
        ]}
      >
        {label}
      </Text>
      <View style={styles.valueContainer}>
        {typeof value === "string" ? (
          <Text
            style={[
              styles.value,
              { color: themeColors.text },
              disabled && styles.disabled,
            ]}
          >
            {value}
          </Text>
        ) : (
          value
        )}
        {onPress && !disabled && (
          <ChevronRight size={20} color={themeColors.textMuted} />
        )}
      </View>
    </View>
  );

  if (onPress && !disabled) {
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...textStyles.label,
    width: 100,
  },
  valueContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  value: {
    ...textStyles.body,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
