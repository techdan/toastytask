/**
 * NotesEditor Component
 *
 * Multiline text input for task notes.
 * Auto-saves on blur.
 */

import { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { spacing, borderRadius } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

interface NotesEditorProps {
  /** Current notes value */
  value: string | null;
  /** Callback when notes change (on blur) */
  onChange: (notes: string) => void;
  /** Whether editing is disabled */
  disabled?: boolean;
  /** Minimum height of the text area */
  minHeight?: number;
}

export function NotesEditor({
  value,
  onChange,
  disabled = false,
  minHeight = 150,
}: NotesEditorProps) {
  const themeColors = useThemeColors();
  const [localValue, setLocalValue] = useState(value || "");

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  const handleBlur = () => {
    // Only trigger onChange if value actually changed
    if (localValue !== (value || "")) {
      onChange(localValue);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: themeColors.textSecondary }]}>
        Notes
      </Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: themeColors.muted,
            color: themeColors.text,
            borderColor: themeColors.border,
            minHeight,
          },
          disabled && styles.disabled,
        ]}
        placeholder="Add notes..."
        placeholderTextColor={themeColors.textMuted}
        value={localValue}
        onChangeText={setLocalValue}
        onBlur={handleBlur}
        multiline
        textAlignVertical="top"
        editable={!disabled}
        scrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  label: {
    ...textStyles.label,
    marginBottom: spacing.sm,
  },
  input: {
    ...textStyles.body,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
