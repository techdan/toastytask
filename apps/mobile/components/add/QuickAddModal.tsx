/**
 * QuickAddModal Component
 *
 * Modal for quickly adding new tasks.
 * Features:
 * - Auto-focus input on open
 * - Submit on keyboard "Done" or button press
 * - Uses default priority/due date from settings
 * - Shows loading state during creation
 * - Optionally assigns to a project (v2 UI)
 */

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { X, ArrowRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateTask } from "@/hooks/useTasks";
import { brand } from "@/constants/colors";
import { spacing, borderRadius, layout } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

interface QuickAddModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Project ID to assign to the new task (inherits from current filter) */
  projectId?: number | null;
  /** Project name for display (optional, shows which project task will be added to) */
  projectName?: string;
}

export function QuickAddModal({
  visible,
  onClose,
  projectId,
  projectName,
}: QuickAddModalProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const [title, setTitle] = useState("");
  const createTask = useCreateTask();

  // Auto-focus input when modal opens
  useEffect(() => {
    if (visible) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || createTask.isPending) return;

    try {
      await createTask.mutateAsync({
        title: trimmedTitle,
        // In v2, bucket is always "todo" - no longer used for navigation
        bucket: "todo",
        // Assign to project if filtering by a specific project
        projectId: typeof projectId === "number" ? projectId : undefined,
      });
      setTitle("");
      onClose();
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleClose = () => {
    setTitle("");
    onClose();
  };

  const canSubmit = title.trim().length > 0 && !createTask.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: themeColors.card,
              paddingBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>
              Add Task
            </Text>
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={8}
            >
              <X size={24} color={themeColors.textSecondary} />
            </Pressable>
          </View>

          {/* Input Row */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  backgroundColor: themeColors.muted,
                  color: themeColors.text,
                  borderColor: themeColors.border,
                },
              ]}
              placeholder="Add a new task..."
              placeholderTextColor={themeColors.textMuted}
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
              editable={!createTask.isPending}
              autoCapitalize="sentences"
              autoCorrect
            />

            <Pressable
              style={[
                styles.submitButton,
                !canSubmit && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {createTask.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ArrowRight size={24} color="#fff" />
              )}
            </Pressable>
          </View>

          {/* Project indicator (only show if adding to a specific project) */}
          {projectName && (
            <Text style={[styles.projectHint, { color: themeColors.textMuted }]}>
              Adding to: {projectName}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  modalContent: {
    borderTopLeftRadius: layout.modalBorderRadius,
    borderTopRightRadius: layout.modalBorderRadius,
    padding: layout.modalPadding,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...textStyles.screenTitle,
    fontSize: 20,
  },
  closeButton: {
    padding: spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    borderWidth: 1,
  },
  submitButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: brand.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: brand.primaryLight,
  },
  projectHint: {
    ...textStyles.caption,
    marginTop: spacing.sm,
  },
});
