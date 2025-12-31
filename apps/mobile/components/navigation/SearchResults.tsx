import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, sharedColors } from "../../constants";
import { spacing, borderRadius } from "../../constants/spacing";
import { textStyles, fontWeight } from "../../constants/typography";

interface SearchResultsProps {
  query: string;
  resultCount: number;
  onClear: () => void;
}

/**
 * Banner displayed when search is active, showing result count
 * and providing a way to clear the search
 */
export function SearchResults({ query, resultCount, onClear }: SearchResultsProps) {
  const colors = useThemeColors();
  const styles = createStyles(colors);

  if (!query.trim()) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="search" size={16} color={colors.textSecondary} />
        <Text style={styles.text} numberOfLines={1}>
          <Text style={styles.count}>{resultCount}</Text>
          {resultCount === 1 ? " result" : " results"} for{" "}
          <Text style={styles.query}>"{query}"</Text>
        </Text>
      </View>

      <TouchableOpacity
        onPress={onClear}
        style={styles.clearButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Clear search"
        accessibilityRole="button"
      >
        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * Empty state shown when search has no results
 */
export function SearchEmptyState({ query }: { query: string }) {
  const colors = useThemeColors();
  const styles = createStyles(colors);

  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={48} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No results found</Text>
      <Text style={styles.emptySubtitle}>
        No tasks match "{query}"
      </Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.muted,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      borderRadius: borderRadius.md,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    text: {
      ...textStyles.small,
      color: colors.textSecondary,
      marginLeft: spacing.sm,
      flex: 1,
    },
    count: {
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    query: {
      fontWeight: fontWeight.medium,
      color: sharedColors.brand.primary,
    },
    clearButton: {
      marginLeft: spacing.sm,
      padding: spacing.xs,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
    },
    emptyTitle: {
      ...textStyles.label,
      color: colors.text,
      marginTop: spacing.md,
    },
    emptySubtitle: {
      ...textStyles.small,
      color: colors.textMuted,
      marginTop: spacing.xs,
      textAlign: "center",
    },
  });
}
