/**
 * FailedOpsModal
 *
 * Shows permanently-failed sync operations (retry_count >= 5) with options
 * to retry or discard each one.
 */

import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "@/constants/theme";
import { spacing, borderRadius } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import type { OutboxEntry } from "@/lib/sync/outbox";

interface FailedOpsModalProps {
  visible: boolean;
  ops: OutboxEntry[];
  onClose: () => void;
  onRetry: (idempotencyKey: string) => void;
  onDiscard: (idempotencyKey: string) => void;
}

function opLabel(op: OutboxEntry): string {
  const match = op.path.match(/\/api\/tasks\/(\d+)(\/\w+)?$/);
  if (op.method === "POST" && op.path === "/api/tasks") return "Create task";
  if (op.method === "PATCH" && match) return `Update task #${match[1]}`;
  if (op.method === "DELETE" && match) return `Delete task #${match[1]}`;
  if (op.method === "POST" && match?.[2] === "/notes") return `Save notes on task #${match[1]}`;
  if (op.method === "POST" && match?.[2] === "/complete") return `Complete task #${match[1]}`;
  return `${op.method} ${op.path}`;
}

export function FailedOpsModal({
  visible,
  ops,
  onClose,
  onRetry,
  onDiscard,
}: FailedOpsModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Failed Sync Operations</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {ops.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No failed operations
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {ops.map((op) => (
              <View
                key={op.idempotencyKey}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.cardBody}>
                  <Text style={[styles.opLabel, { color: colors.text }]}>{opLabel(op)}</Text>
                  {op.errorMessage && (
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                      {op.errorCode}: {op.errorMessage}
                    </Text>
                  )}
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {op.retryCount} attempts · {new Date(op.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => onRetry(op.idempotencyKey)}
                    style={[styles.actionBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="refresh" size={16} color={colors.text} />
                    <Text style={[styles.actionBtnText, { color: colors.text }]}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onDiscard(op.idempotencyKey)}
                    style={[styles.actionBtn, { borderColor: "#dc2626" }]}
                  >
                    <Ionicons name="trash" size={16} color="#dc2626" />
                    <Text style={[styles.actionBtnText, { color: "#dc2626" }]}>Discard</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    ...textStyles.label,
    fontSize: 18,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardBody: {
    gap: spacing.xs,
  },
  opLabel: {
    ...textStyles.body,
    fontWeight: "600",
  },
  errorText: {
    ...textStyles.caption,
  },
  metaText: {
    ...textStyles.caption,
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  actionBtnText: {
    ...textStyles.caption,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  emptyText: {
    ...textStyles.body,
  },
});
