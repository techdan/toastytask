import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Star, Check } from "lucide-react-native";
import type { TaskDTO } from "@toasty/contracts";
import { useCompleteTask, useUncompleteTask, useCycleStarTask } from "@/hooks/useTasks";

interface TaskWithFresh extends TaskDTO {
  _freshHeat?: number;
  _freshImportance?: number;
}

interface TaskListItemProps {
  task: TaskWithFresh;
  onPress: () => void;
}

const STAR_COLORS = ["#9ca3af", "#3b82f6", "#eab308", "#f97316"];

const PRIORITY_STYLES = {
  top: { fontWeight: "700" as const, color: "#990000" },
  high: { fontWeight: "700" as const, color: "#344C63" },
  medium: { fontWeight: "400" as const, color: "#1f2937" },
  low: { fontWeight: "300" as const, color: "#6b7280" },
};

function getHeatColor(heat: number): string {
  if (heat <= 8) return "#60A5FA"; // Blue
  if (heat <= 24) return "#4ADE80"; // Green
  if (heat <= 48) return "#FACC15"; // Yellow
  if (heat <= 71) return "#FB923C"; // Orange
  return "#F87171"; // Red
}

export function TaskListItem({ task, onPress }: TaskListItemProps) {
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const cycleStarTask = useCycleStarTask();

  const isCompleted = !!task.completedAt;
  const isUntouched = !task.lastTouchedAt && !task.lastHeatTouchedAt;
  const starColor = STAR_COLORS[task.starLevel] || STAR_COLORS[0];
  const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
  const heat = task._freshHeat ?? task.heat;
  const heatColor = getHeatColor(heat);

  const handleComplete = () => {
    if (isCompleted) {
      uncompleteTask.mutate(task.id);
    } else {
      completeTask.mutate(task.id);
    }
  };

  const handleStar = () => {
    cycleStarTask.mutate(task.id);
  };

  return (
    <TouchableOpacity
      style={[styles.container, isCompleted && styles.completed]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
        onPress={handleComplete}
      >
        {isCompleted && <Check size={16} color="#fff" />}
      </TouchableOpacity>

      <View style={styles.content}>
        <Text
          style={[
            styles.title,
            priorityStyle,
            isUntouched && styles.untouchedTitle,
            isCompleted && styles.completedTitle,
          ]}
          numberOfLines={2}
        >
          {task.title}
        </Text>

        <View style={styles.meta}>
          <View style={[styles.heatBadge, { backgroundColor: heatColor }]}>
            <Text style={styles.heatText}>{Math.round(heat)}</Text>
          </View>

          {task.dueAt && (
            <Text style={styles.dueDate}>
              {new Date(task.dueAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </Text>
          )}
        </View>
      </View>

      <TouchableOpacity style={styles.starButton} onPress={handleStar}>
        <Star
          size={20}
          color={starColor}
          fill={task.starLevel > 0 ? starColor : "transparent"}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  completed: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
  },
  untouchedTitle: {
    fontWeight: "700",
    color: "#4ADE80",
  },
  completedTitle: {
    textDecorationLine: "line-through",
    color: "#9ca3af",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  heatText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  dueDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  starButton: {
    padding: 8,
    marginLeft: 8,
  },
});
