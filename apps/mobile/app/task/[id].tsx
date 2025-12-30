/**
 * Task Detail Screen
 *
 * Full task editing screen with:
 * - Header with badge, star, heat/cool buttons
 * - Title input with auto-save
 * - Field rows for due date, priority, project, recurrence
 * - Notes editor
 * - All pickers for editing fields
 */

import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Priority, RepeatType } from "@toasty/contracts";
import {
  useTask,
  useUpdateTask,
  useCompleteTask,
  useUncompleteTask,
  useHeatTask,
  useCoolTask,
  useCycleStarTask,
} from "@/hooks/useTasks";
import { useLocalDatabase } from "@/hooks/useLocalDatabase";
import { TaskDetailHeader } from "@/components/detail/TaskDetailHeader";
import { FieldRow } from "@/components/detail/FieldRow";
import { NotesEditor } from "@/components/detail/NotesEditor";
import { PriorityPicker } from "@/components/detail/pickers/PriorityPicker";
import { ProjectPicker } from "@/components/detail/pickers/ProjectPicker";
import { DatePicker } from "@/components/detail/pickers/DatePicker";
import { RecurrencePicker } from "@/components/detail/pickers/RecurrencePicker";
import { Checkbox } from "@/components/ui/Checkbox";
import { DueDateDisplay } from "@/components/ui/DueDateDisplay";
import { ColorDot, DEFAULT_PROJECT_COLOR } from "@/components/ui/ColorDot";
import type { BadgeMode } from "@/components/ui/HeatBadge";
import type { StarLevel } from "@/components/ui/StarButton";
import { useThemeColors } from "@/constants/theme";
import { spacing, borderRadius, shadows } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";

type ActivePicker = "priority" | "project" | "date" | "recurrence" | null;

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const themeColors = useThemeColors();
  const taskId = parseInt(id || "0", 10);

  const { task, isLoading, error } = useTask(taskId);
  const { database } = useLocalDatabase();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const heatTask = useHeatTask();
  const coolTask = useCoolTask();
  const cycleStarTask = useCycleStarTask();

  const [badgeMode, setBadgeMode] = useState<BadgeMode>("heat");
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);

  // Get all projects for the picker
  const projects = useMemo(() => {
    return database?.getProjects() ?? [];
  }, [database]);

  // Find the current project
  const currentProject = useMemo(() => {
    if (!task?.projectId) return null;
    return projects.find((p) => p.id === task.projectId) ?? null;
  }, [task?.projectId, projects]);

  // Handlers
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const toggleBadgeMode = useCallback(() => {
    setBadgeMode((current) => (current === "heat" ? "importance" : "heat"));
  }, []);

  const handleComplete = useCallback(() => {
    if (!task) return;
    if (task.completedAt) {
      uncompleteTask.mutate(task.id);
    } else {
      completeTask.mutate(task.id);
    }
  }, [task, completeTask, uncompleteTask]);

  const handleStarPress = useCallback(() => {
    if (!task) return;
    cycleStarTask.mutate(task.id);
  }, [task, cycleStarTask]);

  const handleHeatPress = useCallback(() => {
    if (!task) return;
    heatTask.mutate({ id: task.id });
  }, [task, heatTask]);

  const handleCoolPress = useCallback(() => {
    if (!task) return;
    coolTask.mutate({ id: task.id });
  }, [task, coolTask]);

  const handleTitleBlur = useCallback(() => {
    if (!task || localTitle === null) return;
    const trimmedTitle = localTitle.trim();
    if (trimmedTitle && trimmedTitle !== task.title) {
      updateTask.mutate({ taskId: task.id, data: { title: trimmedTitle } });
    }
    setLocalTitle(null);
  }, [task, localTitle, updateTask]);

  const handlePrioritySelect = useCallback(
    (priority: Priority) => {
      if (!task) return;
      updateTask.mutate({ taskId: task.id, data: { priority } });
    },
    [task, updateTask]
  );

  const handleProjectSelect = useCallback(
    (projectId: number | null) => {
      if (!task) return;
      updateTask.mutate({ taskId: task.id, data: { projectId } });
    },
    [task, updateTask]
  );

  const handleDateSelect = useCallback(
    (date: Date | null) => {
      if (!task) return;
      updateTask.mutate({
        taskId: task.id,
        data: { dueAt: date?.toISOString() ?? null },
      });
    },
    [task, updateTask]
  );

  const handleRecurrenceSelect = useCallback(
    (repeatType: RepeatType) => {
      if (!task) return;
      updateTask.mutate({ taskId: task.id, data: { repeatType } });
    },
    [task, updateTask]
  );

  const handleNotesChange = useCallback(
    (notes: string) => {
      if (!task) return;
      // For now, update the first note or create one
      // This is a simplified implementation
      updateTask.mutate({
        taskId: task.id,
        data: { notes: notes || null },
      });
    },
    [task, updateTask]
  );

  // Format recurrence for display
  const formatRecurrence = (repeatType: RepeatType | null | undefined): string => {
    switch (repeatType) {
      case "daily":
        return "Daily";
      case "weekly":
        return "Weekly";
      case "biweekly":
        return "Every 2 Weeks";
      case "monthly":
        return "Monthly";
      case "semiannual":
        return "Every 6 Months";
      case "annual":
        return "Yearly";
      default:
        return "None";
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background }]}>
        <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
          Loading...
        </Text>
      </View>
    );
  }

  // Error state
  if (error || !task) {
    return (
      <View style={[styles.center, { backgroundColor: themeColors.background }]}>
        <Text style={[styles.errorText, { color: themeColors.text }]}>
          Task not found
        </Text>
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.backButton, { backgroundColor: themeColors.muted }]}
        >
          <Text style={[styles.backText, { color: themeColors.text }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCompleted = !!task.completedAt;
  const heat = task._freshHeat ?? task.heat ?? 0;
  const importance = task._freshImportance ?? task.importanceV1 ?? 5;
  const currentNotes =
    task.notes && task.notes.length > 0
      ? task.notes.map((n) => n.currentText).join("\n")
      : "";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {/* Header */}
        <TaskDetailHeader
          heat={heat}
          importance={importance}
          badgeMode={badgeMode}
          onBadgeModeToggle={toggleBadgeMode}
          starLevel={(task.starLevel || 0) as StarLevel}
          onStarPress={handleStarPress}
          onHeatPress={handleHeatPress}
          onCoolPress={handleCoolPress}
          onBackPress={handleBack}
          createdAt={task.createdAt}
          updatedAt={task.updatedAt}
          isCompleted={isCompleted}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title Section */}
          <View style={[styles.titleSection, { backgroundColor: themeColors.card }]}>
            <View style={styles.titleRow}>
              <Checkbox checked={isCompleted} onToggle={handleComplete} />
              <TextInput
                style={[
                  styles.titleInput,
                  { color: themeColors.text },
                  isCompleted && styles.titleCompleted,
                ]}
                value={localTitle ?? task.title}
                onChangeText={setLocalTitle}
                onBlur={handleTitleBlur}
                placeholder="Task title"
                placeholderTextColor={themeColors.textMuted}
                editable={!isCompleted}
                multiline
              />
            </View>
          </View>

          {/* Details Card */}
          <View style={[styles.card, { backgroundColor: themeColors.card }]}>
            <FieldRow
              label="Due Date"
              value={
                <DueDateDisplay
                  dueAt={task.dueAt}
                  isCompleted={isCompleted}
                  size="default"
                />
              }
              onPress={() => setActivePicker("date")}
              disabled={isCompleted}
            />
            <FieldRow
              label="Priority"
              value={task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              onPress={() => setActivePicker("priority")}
              disabled={isCompleted}
            />
            <FieldRow
              label="Project"
              value={
                currentProject ? (
                  <View style={styles.projectValue}>
                    <ColorDot color={currentProject.colorHex || DEFAULT_PROJECT_COLOR} />
                    <Text style={{ color: themeColors.text }}>{currentProject.name}</Text>
                  </View>
                ) : (
                  <Text style={{ color: themeColors.textSecondary }}>None</Text>
                )
              }
              onPress={() => setActivePicker("project")}
              disabled={isCompleted}
            />
            <FieldRow
              label="Repeat"
              value={formatRecurrence(task.repeatType)}
              onPress={() => setActivePicker("recurrence")}
              disabled={isCompleted}
            />
          </View>

          {/* Notes Section */}
          <View style={[styles.card, { backgroundColor: themeColors.card }]}>
            <NotesEditor
              value={currentNotes}
              onChange={handleNotesChange}
              disabled={isCompleted}
            />
          </View>
        </ScrollView>

        {/* Pickers */}
        <PriorityPicker
          visible={activePicker === "priority"}
          value={task.priority}
          onSelect={handlePrioritySelect}
          onClose={() => setActivePicker(null)}
        />

        <ProjectPicker
          visible={activePicker === "project"}
          value={task.projectId}
          projects={projects}
          onSelect={handleProjectSelect}
          onClose={() => setActivePicker(null)}
        />

        <DatePicker
          visible={activePicker === "date"}
          value={task.dueAt ? new Date(task.dueAt) : null}
          onSelect={handleDateSelect}
          onClose={() => setActivePicker(null)}
        />

        <RecurrencePicker
          visible={activePicker === "recurrence"}
          value={task.repeatType || "none"}
          onSelect={handleRecurrenceSelect}
          onClose={() => setActivePicker(null)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  loadingText: {
    ...textStyles.body,
  },
  errorText: {
    ...textStyles.body,
    marginBottom: spacing.lg,
  },
  backButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  backText: {
    ...textStyles.button,
  },
  titleSection: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  titleInput: {
    flex: 1,
    ...textStyles.screenTitle,
    padding: 0,
  },
  titleCompleted: {
    textDecorationLine: "line-through",
    opacity: 0.6,
  },
  card: {
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    ...shadows.sm,
  },
  projectValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
