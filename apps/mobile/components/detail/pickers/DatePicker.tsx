/**
 * DatePicker Component
 *
 * Modal for selecting due date using platform date picker.
 */

import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Platform } from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, layout, borderRadius } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";
import { brand, semantic } from "@/constants/colors";

interface DatePickerProps {
  /** Whether the picker is visible */
  visible: boolean;
  /** Currently selected date (null for no date) */
  value: Date | null;
  /** Callback when a date is selected */
  onSelect: (date: Date | null) => void;
  /** Callback to close the picker */
  onClose: () => void;
}

export function DatePicker({
  visible,
  value,
  onSelect,
  onClose,
}: DatePickerProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();

  // Local state for the picker (defaults to today if no value)
  const [selectedDate, setSelectedDate] = useState<Date>(value || new Date());

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      // Android: picker dismisses automatically
      if (event.type === "set" && date) {
        onSelect(date);
      }
      onClose();
    } else {
      // iOS: update local state
      if (date) {
        setSelectedDate(date);
      }
    }
  };

  const handleConfirm = () => {
    onSelect(selectedDate);
    onClose();
  };

  const handleClear = () => {
    onSelect(null);
    onClose();
  };

  const handleCancel = () => {
    setSelectedDate(value || new Date());
    onClose();
  };

  // Android uses inline picker that auto-dismisses
  if (Platform.OS === "android") {
    if (!visible) return null;

    return (
      <DateTimePicker
        value={value || new Date()}
        mode="date"
        display="default"
        onChange={handleChange}
      />
    );
  }

  // iOS uses modal with confirm/cancel
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.backdrop} onPress={handleCancel} />

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
          Select Due Date
        </Text>

        {/* Date Picker */}
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="spinner"
            onChange={handleChange}
            style={styles.picker}
            textColor={themeColors.text}
          />
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.clearButton]}
            onPress={handleClear}
          >
            <Text style={[styles.buttonText, { color: semantic.error }]}>
              Clear Date
            </Text>
          </Pressable>

          <View style={styles.rightButtons}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={[styles.buttonText, { color: themeColors.textSecondary }]}>
                Cancel
              </Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.confirmButton]}
              onPress={handleConfirm}
            >
              <Text style={[styles.buttonText, { color: "#fff" }]}>
                Confirm
              </Text>
            </Pressable>
          </View>
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
    marginBottom: spacing.md,
  },
  pickerContainer: {
    alignItems: "center",
  },
  picker: {
    width: "100%",
    height: 200,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  rightButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  clearButton: {
    // Transparent background
  },
  cancelButton: {
    // Transparent background
  },
  confirmButton: {
    backgroundColor: brand.primary,
  },
  buttonText: {
    ...textStyles.button,
  },
});
