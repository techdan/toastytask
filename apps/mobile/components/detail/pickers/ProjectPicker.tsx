/**
 * ProjectPicker Component
 *
 * Bottom sheet for selecting task project.
 */

import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Check } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProjectDTO } from "@toasty/contracts";
import { ColorDot, DEFAULT_PROJECT_COLOR } from "@/components/ui/ColorDot";
import { spacing, layout } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";
import { semantic } from "@/constants/colors";

interface ProjectPickerProps {
  /** Whether the picker is visible */
  visible: boolean;
  /** Currently selected project ID (null for no project) */
  value: number | null;
  /** Available projects */
  projects: ProjectDTO[];
  /** Callback when a project is selected */
  onSelect: (projectId: number | null) => void;
  /** Callback to close the picker */
  onClose: () => void;
}

export function ProjectPicker({
  visible,
  value,
  projects,
  onSelect,
  onClose,
}: ProjectPickerProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();

  const handleSelect = (projectId: number | null) => {
    onSelect(projectId);
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
            maxHeight: "70%",
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={[styles.handle, { backgroundColor: themeColors.border }]} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: themeColors.text }]}>
          Select Project
        </Text>

        {/* Options */}
        <ScrollView style={styles.scrollView}>
          <View style={styles.options}>
            {/* No Project option */}
            <Pressable
              style={[
                styles.option,
                { borderBottomColor: themeColors.border },
                styles.optionWithBorder,
              ]}
              onPress={() => handleSelect(null)}
            >
              <View style={styles.optionContent}>
                <ColorDot color={DEFAULT_PROJECT_COLOR} />
                <Text style={[styles.optionText, { color: themeColors.textSecondary }]}>
                  No Project
                </Text>
              </View>
              {value === null && <Check size={20} color={semantic.success} />}
            </Pressable>

            {/* Project options */}
            {projects.map((project, index) => (
              <Pressable
                key={project.id}
                style={[
                  styles.option,
                  index < projects.length - 1 && {
                    borderBottomColor: themeColors.border,
                  },
                  index < projects.length - 1 && styles.optionWithBorder,
                ]}
                onPress={() => handleSelect(project.id)}
              >
                <View style={styles.optionContent}>
                  <ColorDot color={project.colorHex || DEFAULT_PROJECT_COLOR} />
                  <Text style={[styles.optionText, { color: themeColors.text }]}>
                    {project.name}
                  </Text>
                </View>
                {value === project.id && (
                  <Check size={20} color={semantic.success} />
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
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
  scrollView: {
    flexGrow: 0,
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
  optionWithBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  optionText: {
    ...textStyles.body,
  },
});
