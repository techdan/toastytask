import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
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

const COLOR_OPTIONS = [
  "#f87171", "#fb923c", "#fbbf24", "#facc15",
  "#a3e635", "#4ade80", "#34d399", "#2dd4bf",
  "#22d3ee", "#38bdf8", "#60a5fa", "#818cf8",
  "#a78bfa", "#c084fc", "#e879f9", "#f472b6",
  "#9ca3af",
];

const DEFAULT_COLOR = "#9ca3af";

interface ProjectWithCount extends ProjectDTO {
  taskCount: number;
}

interface ProjectsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Array<ProjectWithCount>;
  selectedProjectId: ProjectFilter;
  onSelectProject: (id: ProjectFilter) => void;
  totalTaskCount: number;
  focusedTaskCount: number;
  noProjectTaskCount: number;
  onNavigateSettings: () => void;
  onCreateProject: (name: string, colorHex: string) => void;
  onUpdateProject: (id: number, data: Partial<{ name: string; colorHex: string; archived: boolean }>) => void;
  onDeleteProject: (id: number) => void;
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
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}: ProjectsDrawerProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width;
  const drawerWidth = Math.min(screenWidth * DRAWER_WIDTH_PERCENT, DRAWER_MAX_WIDTH);

  // Animation
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, { duration: 250 });
  }, [isOpen, progress]);

  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(DEFAULT_COLOR);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<TextInput>(null);

  // Color picker state
  const [colorPickerForId, setColorPickerForId] = useState<number | null>(null);

  // Archived section state
  const [showArchived, setShowArchived] = useState(false);

  const activeProjects = projects.filter((p) => !p.archived);
  const archivedProjects = projects.filter((p) => p.archived);

  // Animated styles
  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-drawerWidth, 0]) }],
  }));
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

  const handleCreateSubmit = () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    onCreateProject(trimmed, newProjectColor);
    setNewProjectName("");
    setNewProjectColor(DEFAULT_COLOR);
    setIsCreating(false);
  };

  const handleCreateCancel = () => {
    setNewProjectName("");
    setNewProjectColor(DEFAULT_COLOR);
    setIsCreating(false);
  };

  const handleEditSubmit = (id: number) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onUpdateProject(id, { name: trimmed });
    }
    setEditingId(null);
  };

  const handleColorChange = (id: number, colorHex: string) => {
    onUpdateProject(id, { colorHex });
    setColorPickerForId(null);
  };

  const showProjectActions = (project: ProjectWithCount) => {
    Alert.alert(project.name, undefined, [
      {
        text: "Rename",
        onPress: () => {
          setEditingId(project.id);
          setEditingName(project.name);
          setColorPickerForId(null);
          setTimeout(() => editInputRef.current?.focus(), 100);
        },
      },
      {
        text: "Change Color",
        onPress: () => {
          setColorPickerForId(colorPickerForId === project.id ? null : project.id);
          setEditingId(null);
        },
      },
      {
        text: project.archived ? "Unarchive" : "Archive",
        onPress: () => onUpdateProject(project.id, { archived: !project.archived }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "Delete Project",
            `Delete "${project.name}"? Tasks in this project will not be deleted.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => onDeleteProject(project.id),
              },
            ]
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const styles = createStyles(colors, drawerWidth, insets);
  const isSelected = (id: ProjectFilter) => selectedProjectId === id;

  const renderProjectRow = (project: ProjectWithCount) => {
    const isEditing = editingId === project.id;
    const isColorPickerOpen = colorPickerForId === project.id;

    return (
      <View key={project.id}>
        <View
          style={[
            styles.projectRow,
            isSelected(project.id) && styles.projectRowSelected,
          ]}
        >
          <TouchableOpacity
            style={styles.projectRowLeft}
            onPress={() => handleSelectProject(project.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected(project.id) }}
          >
            <View style={[styles.colorDot, { backgroundColor: project.colorHex }]} />
            {isEditing ? (
              <TextInput
                ref={editInputRef}
                style={[styles.editInput, { color: colors.text, borderColor: sharedColors.brand.primary }]}
                value={editingName}
                onChangeText={setEditingName}
                onBlur={() => handleEditSubmit(project.id)}
                onSubmitEditing={() => handleEditSubmit(project.id)}
                returnKeyType="done"
                autoFocus
              />
            ) : (
              <Text
                style={[
                  styles.projectName,
                  isSelected(project.id) && styles.projectNameSelected,
                  project.archived && styles.archivedText,
                ]}
                numberOfLines={1}
              >
                {project.name}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.projectRowRight}>
            <Text style={styles.taskCount}>({project.taskCount})</Text>
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => showProjectActions(project)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`More options for ${project.name}`}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Inline color picker */}
        {isColorPickerOpen && (
          <View style={styles.colorGrid}>
            {COLOR_OPTIONS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  color === project.colorHex && styles.colorSwatchSelected,
                ]}
                onPress={() => handleColorChange(project.id, color)}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

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
          {/* Tasks section label */}
          <Text style={styles.sectionLabel}>Tasks</Text>

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
              <Text style={[styles.projectName, isSelected("all") && styles.projectNameSelected]}>
                All Projects
              </Text>
            </View>
            <Text style={styles.taskCount}>({totalTaskCount})</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.projectRow, isSelected(null) && styles.projectRowSelected]}
            onPress={() => handleSelectProject(null)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected(null) }}
          >
            <View style={styles.projectRowLeft}>
              <View style={styles.noProjectIcon}>
                <View style={styles.noProjectIconDot} />
              </View>
              <Text style={[styles.projectName, isSelected(null) && styles.projectNameSelected]}>
                No Project
              </Text>
            </View>
            <Text style={styles.taskCount}>({noProjectTaskCount})</Text>
          </TouchableOpacity>

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
              <Text style={[styles.projectName, isSelected("focus") && styles.projectNameSelected]}>
                Focus
              </Text>
            </View>
            {focusedTaskCount > 0 && (
              <Text style={styles.taskCount}>({focusedTaskCount})</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Projects section label + count */}
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>Projects</Text>
            <Text style={styles.sectionCount}>{activeProjects.length}</Text>
          </View>

          {/* Active projects */}
          {activeProjects.map(renderProjectRow)}

          {/* New project form / button */}
          {isCreating ? (
            <View style={styles.createForm}>
              <View style={styles.createFormRow}>
                <View style={[styles.colorDot, { backgroundColor: newProjectColor }]} />
                <TextInput
                  style={[styles.createInput, { color: colors.text, borderColor: sharedColors.brand.primary }]}
                  value={newProjectName}
                  onChangeText={setNewProjectName}
                  placeholder="Project name"
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={handleCreateSubmit}
                  returnKeyType="done"
                  autoFocus
                />
              </View>
              {/* Color picker for new project */}
              <View style={styles.colorGrid}>
                {COLOR_OPTIONS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      color === newProjectColor && styles.colorSwatchSelected,
                    ]}
                    onPress={() => setNewProjectColor(color)}
                  />
                ))}
              </View>
              <View style={styles.createFormActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCreateCancel}>
                  <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createButton, { backgroundColor: sharedColors.brand.primary }]}
                  onPress={handleCreateSubmit}
                >
                  <Text style={styles.createButtonText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.newProjectButton}
              onPress={() => setIsCreating(true)}
            >
              <Ionicons name="add" size={18} color={colors.textMuted} />
              <Text style={[styles.newProjectText, { color: colors.textMuted }]}>New Project</Text>
            </TouchableOpacity>
          )}

          {/* Archived projects */}
          {archivedProjects.length > 0 && (
            <View style={styles.archivedSection}>
              <TouchableOpacity
                style={styles.archivedHeader}
                onPress={() => setShowArchived((prev) => !prev)}
              >
                <View style={styles.archivedHeaderLeft}>
                  <Ionicons
                    name={showArchived ? "chevron-down" : "chevron-forward"}
                    size={14}
                    color={colors.textMuted}
                  />
                  <Text style={[styles.archivedHeaderText, { color: colors.textMuted }]}>
                    Archived
                  </Text>
                </View>
                <Text style={styles.sectionCount}>{archivedProjects.length}</Text>
              </TouchableOpacity>
              {showArchived && archivedProjects.map(renderProjectRow)}
            </View>
          )}

          <View style={styles.listFooter} />
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
    sectionLabel: {
      ...textStyles.caption,
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    sectionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingRight: spacing.lg,
    },
    sectionCount: {
      ...textStyles.caption,
      color: colors.textMuted,
      backgroundColor: colors.muted,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.sm,
    },
    projectRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
    },
    projectRowSelected: {
      backgroundColor: `${sharedColors.brand.primary}10`,
    },
    projectRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      marginRight: spacing.sm,
    },
    projectRowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: spacing.md,
      flexShrink: 0,
    },
    noProjectIcon: {
      width: 18,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    noProjectIconDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.textMuted,
    },
    projectName: {
      ...textStyles.body,
      color: colors.text,
      flex: 1,
    },
    projectNameSelected: {
      color: sharedColors.brand.primary,
      fontWeight: fontWeight.semibold,
    },
    archivedText: {
      color: colors.textMuted,
    },
    taskCount: {
      ...textStyles.small,
      color: colors.textMuted,
    },
    moreButton: {
      width: 28,
      height: 28,
      justifyContent: "center",
      alignItems: "center",
    },
    editInput: {
      flex: 1,
      ...textStyles.body,
      borderBottomWidth: 1,
      paddingVertical: 2,
    },
    colorGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    colorSwatch: {
      width: 28,
      height: 28,
      borderRadius: borderRadius.sm,
    },
    colorSwatchSelected: {
      borderWidth: 2,
      borderColor: colors.text,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.lg,
      marginVertical: spacing.sm,
    },
    newProjectButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
    },
    newProjectText: {
      ...textStyles.body,
    },
    createForm: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    createFormRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: spacing.sm,
    },
    createInput: {
      flex: 1,
      ...textStyles.body,
      borderBottomWidth: 1,
      paddingVertical: spacing.xs,
    },
    createFormActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    cancelButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cancelButtonText: {
      ...textStyles.body,
    },
    createButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.sm,
    },
    createButtonText: {
      ...textStyles.body,
      color: "#fff",
      fontWeight: fontWeight.semibold,
    },
    archivedSection: {
      marginTop: spacing.sm,
      marginHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.muted + "40",
      overflow: "hidden",
    },
    archivedHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    archivedHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    archivedHeaderText: {
      ...textStyles.small,
      fontWeight: fontWeight.medium,
    },
    listFooter: {
      height: spacing.lg,
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
