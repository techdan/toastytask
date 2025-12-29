import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTask } from "@/hooks/useTasks";
import { Star, ArrowUp, ArrowDown } from "lucide-react-native";

const STAR_COLORS = ["#9ca3af", "#3b82f6", "#eab308", "#f97316"];

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const taskId = parseInt(id || "0", 10);
  const { task, isLoading, error } = useTask(taskId);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Task not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const starColor = STAR_COLORS[task.starLevel] || STAR_COLORS[0];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{task.title}</Text>
          <TouchableOpacity style={styles.starButton}>
            <Star
              size={24}
              color={starColor}
              fill={task.starLevel > 0 ? starColor : "transparent"}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.badges}>
          <View style={[styles.badge, styles.heatBadge]}>
            <Text style={styles.badgeText}>Heat: {Math.round(task.heat)}</Text>
          </View>
          <View style={[styles.badge, styles.importanceBadge]}>
            <Text style={styles.badgeText}>Imp: {task.importanceV1}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Priority</Text>
            <Text style={styles.value}>{task.priority}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Bucket</Text>
            <Text style={styles.value}>{task.bucket}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Due Date</Text>
            <Text style={styles.value}>
              {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "None"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Repeat</Text>
            <Text style={styles.value}>{task.repeatType}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Heat Controls</Text>
        <View style={styles.heatControls}>
          <TouchableOpacity style={[styles.heatButton, styles.coolButton]}>
            <ArrowDown size={24} color="#3b82f6" />
            <Text style={styles.coolText}>Cool</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.heatButton, styles.heatUpButton]}>
            <ArrowUp size={24} color="#f97316" />
            <Text style={styles.heatUpText}>Heat</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <View style={styles.card}>
          <Text style={styles.notesText}>
            {task.notes && task.notes.length > 0
              ? task.notes.map((n) => n.currentText).join("\n")
              : "No notes"}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: "#dc2626",
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  backText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  header: {
    backgroundColor: "#fff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginRight: 16,
  },
  starButton: {
    padding: 8,
  },
  badges: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  heatBadge: {
    backgroundColor: "#fef3c7",
  },
  importanceBadge: {
    backgroundColor: "#dbeafe",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1f2937",
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  label: {
    fontSize: 16,
    color: "#6b7280",
  },
  value: {
    fontSize: 16,
    color: "#1f2937",
    textTransform: "capitalize",
  },
  heatControls: {
    flexDirection: "row",
    gap: 12,
  },
  heatButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  coolButton: {
    backgroundColor: "#dbeafe",
  },
  coolText: {
    color: "#3b82f6",
    fontWeight: "600",
    fontSize: 16,
  },
  heatUpButton: {
    backgroundColor: "#ffedd5",
  },
  heatUpText: {
    color: "#f97316",
    fontWeight: "600",
    fontSize: 16,
  },
  notesText: {
    fontSize: 16,
    color: "#1f2937",
    lineHeight: 24,
  },
});
