/**
 * PriorityPicker Component
 *
 * Bottom sheet for selecting task priority.
 */

import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Check } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Priority } from "@toasty/contracts";
import { spacing, borderRadius, layout } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";
import { semantic } from "@/constants/colors";

interface PriorityPickerProps {
  /** Whether the picker is visible */
  visible: boolean;
  /** Currently selected priority */
  value: Priority;
  /** Callback when a priority is selected */
  onSelect: (priority: Priority) => void;
  /** Callback to close the picker */
  onClose: () => void;
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function PriorityPicker({
  visible,
  value,
  onSelect,
  onClose,
}: PriorityPickerProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();

  const handleSelect = (priority: Priority) => {
    onSelect(priority);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: themeColors.card,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: themeColors.border }]} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: themeColors.text }]}>
          Select Priority
        </Text>

        {/* Options */}
        <View style={styles.options}>
          {PRIORITY_OPTIONS.map((option, index) => (
            <Pressable
              key={option.value}
              style={[
                styles.option,
                index < PRIORITY_OPTIONS.length - 1 && {
                  borderBottomColor: themeColors.border,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
              onPress={() => handleSelect(option.value)}
            >
              <Text style={[styles.optionText, { color: themeColors.text }]}>
                {option.label}
              </Text>
              {value === option.value && (
                <Check size={20} color={semantic.success} />
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  sheet: {
    borderTopLeftRadius: layout.modalBorderRadius,
    borderTopRightRadius: layout.modalBorderRadius,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  handle: {
    width: layout.bottomSheetHandleWidth,
    height: layout.bottomSheetHandle,
    borderRadius: layout.bottomSheetHandle / 2,
  },
  title: {
    ...textStyles.screenTitle,
    fontSize: 18,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  options: {
    paddingHorizontal: spacing.lg,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.lg,
  },
  optionText: {
    ...textStyles.body,
  },
});
