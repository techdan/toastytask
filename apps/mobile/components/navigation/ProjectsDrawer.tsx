import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
  Modal,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ProjectDTO } from "@toasty/contracts";
import { useThemeColors, sharedColors } from "../../constants";
import { spacing, borderRadius } from "../../constants/spacing";
import { textStyles, fontWeight, fontSize } from "../../constants/typography";
import type { ProjectFilter } from "../../hooks/useTasks";

const DRAWER_WIDTH_PERCENT = 0.8;
const DRAWER_MAX_WIDTH = 320;

interface ProjectsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Array<ProjectDTO & { taskCount: number }>;
  selectedProjectId: ProjectFilter;
  onSelectProject: (id: ProjectFilter) => void;
  totalTaskCount: number;
  focusedTaskCount: number;
  noProjectTaskCount: number;
  onNavigateSettings: () => void;
}

export function ProjectsDrawer({
  isOpen,
  onClose,
  projects,
  selectedProjectId,
  onSelectProject,
  totalTaskCount,
  focusedTaskCount,
  noProjectTaskCount,
  onNavigateSettings,
}: ProjectsDrawerProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width;
  const drawerWidth = Math.min(screenWidth * DRAWER_WIDTH_PERCENT, DRAWER_MAX_WIDTH);

  // Animation value (0 = closed, 1 = open)
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, { duration: 250 });
  }, [isOpen, progress]);

  // Animated styles for drawer
  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [-drawerWidth, 0]),
      },
    ],
  }));

  // Animated styles for backdrop
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.5]),
  }));

  const handleSelectProject = (projectId: ProjectFilter) => {
    onSelectProject(projectId);
    onClose();
  };

  const handleSettingsPress = () => {
    onClose();
    onNavigateSettings();
  };

  const styles = createStyles(colors, drawerWidth, insets);

  const isSelected = (id: ProjectFilter) => selectedProjectId === id;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropOverlay, backdropAnimatedStyle]} />
      </Pressable>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, drawerAnimatedStyle]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Projects</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close drawer"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* All Tasks */}
          <TouchableOpacity
            style={[styles.projectRow, isSelected("all") && styles.projectRowSelected]}
            onPress={() => handleSelectProject("all")}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected("all") }}
          >
            <View style={styles.projectRowLeft}>
              <Ionicons
                name="list"
                size={18}
                color={isSelected("all") ? sharedColors.brand.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.projectName,
                  isSelected("all") && styles.projectNameSelected,
                ]}
              >
                All Tasks
              </Text>
            </View>
            <Text style={styles.taskCount}>({totalTaskCount})</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Focused */}
          <TouchableOpacity
            style={[styles.projectRow, isSelected("focus") && styles.projectRowSelected]}
            onPress={() => handleSelectProject("focus")}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected("focus") }}
          >
            <View style={styles.projectRowLeft}>
              <Ionicons
                name="eye"
                size={18}
                color={isSelected("focus") ? sharedColors.brand.primary : sharedColors.semantic.success}
              />
              <Text
                style={[
                  styles.projectName,
                  isSelected("focus") && styles.projectNameSelected,
                ]}
              >
                Focused
              </Text>
            </View>
            <Text style={styles.taskCount}>({focusedTaskCount})</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Projects List */}
          {projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={[
                styles.projectRow,
                isSelected(project.id) && styles.projectRowSelected,
              ]}
              onPress={() => handleSelectProject(project.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected(project.id) }}
            >
              <View style={styles.projectRowLeft}>
                <View
                  style={[styles.colorDot, { backgroundColor: project.colorHex }]}
                />
                <Text
                  style={[
                    styles.projectName,
                    isSelected(project.id) && styles.projectNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {project.name}
                </Text>
              </View>
              <Text style={styles.taskCount}>({project.taskCount})</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.divider} />

          {/* No Project */}
          <TouchableOpacity
            style={[styles.projectRow, isSelected(null) && styles.projectRowSelected]}
            onPress={() => handleSelectProject(null)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected(null) }}
          >
            <View style={styles.projectRowLeft}>
              <Ionicons
                name="folder-outline"
                size={18}
                color={isSelected(null) ? sharedColors.brand.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.projectName,
                  styles.noProjectText,
                  isSelected(null) && styles.projectNameSelected,
                ]}
              >
                No Project
              </Text>
            </View>
            <Text style={styles.taskCount}>({noProjectTaskCount})</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={handleSettingsPress}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.footerButtonText}>Settings</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

function createStyles(
  colors: ReturnType<typeof useThemeColors>,
  drawerWidth: number,
  insets: { top: number; bottom: number }
) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    backdropOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#000",
    },
    drawer: {
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: drawerWidth,
      backgroundColor: colors.card,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...textStyles.screenTitle,
      color: colors.text,
      fontSize: fontSize.xl,
    },
    closeButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    content: {
      flex: 1,
    },
    projectRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    projectRowSelected: {
      backgroundColor: `${sharedColors.brand.primary}10`,
    },
    projectRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: spacing.md,
    },
    projectName: {
      ...textStyles.body,
      color: colors.text,
      marginLeft: spacing.md,
      flex: 1,
    },
    projectNameSelected: {
      color: sharedColors.brand.primary,
      fontWeight: fontWeight.semibold,
    },
    noProjectText: {
      fontStyle: "italic",
      color: colors.textMuted,
    },
    taskCount: {
      ...textStyles.small,
      color: colors.textMuted,
      marginLeft: spacing.sm,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.lg,
      marginVertical: spacing.xs,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    footerButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    footerButtonText: {
      ...textStyles.body,
      color: colors.textSecondary,
      marginLeft: spacing.md,
    },
  });
}
