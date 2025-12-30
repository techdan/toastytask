/**
 * RecurrencePicker Component
 *
 * Bottom sheet for selecting task recurrence.
 */

import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Check } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RepeatType } from "@toasty/contracts";
import { spacing, layout } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";
import { semantic } from "@/constants/colors";

interface RecurrencePickerProps {
  /** Whether the picker is visible */
  visible: boolean;
  /** Currently selected recurrence */
  value: RepeatType;
  /** Callback when a recurrence is selected */
  onSelect: (recurrence: RepeatType) => void;
  /** Callback to close the picker */
  onClose: () => void;
}

const RECURRENCE_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 Weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "semiannual", label: "Every 6 Months" },
  { value: "annual", label: "Yearly" },
];

export function RecurrencePicker({
  visible,
  value,
  onSelect,
  onClose,
}: RecurrencePickerProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();

  const handleSelect = (recurrence: RepeatType) => {
    onSelect(recurrence);
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
          Select Recurrence
        </Text>

        {/* Options */}
        <View style={styles.options}>
          {RECURRENCE_OPTIONS.map((option, index) => (
            <Pressable
              key={option.value}
              style={[
                styles.option,
                index < RECURRENCE_OPTIONS.length - 1 && {
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
