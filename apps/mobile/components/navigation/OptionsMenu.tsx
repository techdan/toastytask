import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, sharedColors } from "../../constants";
import { spacing, borderRadius, shadows } from "../../constants/spacing";
import { textStyles, fontSize, fontWeight } from "../../constants/typography";
import type { MobileSortMode, SortDirection } from "../../lib/sorting";

interface OptionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  sortMode: MobileSortMode;
  onSortModeChange: (mode: MobileSortMode) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (direction: SortDirection) => void;
  density: "comfortable" | "compact";
  onDensityChange: (density: "comfortable" | "compact") => void;
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
}

const SORT_OPTIONS: Array<{ value: MobileSortMode; label: string }> = [
  { value: "heat", label: "Heat" },
  { value: "importance", label: "Importance" },
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Modified" },
];

const DENSITY_OPTIONS: Array<{ value: "comfortable" | "compact"; label: string }> = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export function OptionsMenu({
  isOpen,
  onClose,
  sortMode,
  onSortModeChange,
  sortDirection,
  onSortDirectionChange,
  density,
  onDensityChange,
  showCompleted,
  onShowCompletedChange,
}: OptionsMenuProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const toggleSortDirection = () => {
    onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc");
  };

  const styles = createStyles(colors);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.backdropInner} />
      </Pressable>

      <View style={[styles.menuContainer, { top: insets.top + 56 }]}>
        <View style={styles.menu}>
          {/* Sort By Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sort by</Text>
            <View style={styles.optionsList}>
              {SORT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.radioOption}
                  onPress={() => onSortModeChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sortMode === option.value }}
                >
                  <View style={styles.radioOuter}>
                    {sortMode === option.value && <View style={styles.radioInner} />}
                  </View>
                  <Text
                    style={[
                      styles.optionLabel,
                      sortMode === option.value && styles.optionLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Sort Direction */}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={toggleSortDirection}
            accessibilityRole="button"
            accessibilityLabel={`Sort direction: ${sortDirection === "asc" ? "Ascending" : "Descending"}`}
          >
            <Text style={styles.toggleLabel}>Direction</Text>
            <View style={styles.directionToggle}>
              <Text style={styles.directionValue}>
                {sortDirection === "asc" ? "Ascending" : "Descending"}
              </Text>
              <Ionicons
                name={sortDirection === "asc" ? "arrow-up" : "arrow-down"}
                size={16}
                color={colors.textSecondary}
              />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Density Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Density</Text>
            <View style={styles.optionsList}>
              {DENSITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.radioOption}
                  onPress={() => onDensityChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: density === option.value }}
                >
                  <View style={styles.radioOuter}>
                    {density === option.value && <View style={styles.radioInner} />}
                  </View>
                  <Text
                    style={[
                      styles.optionLabel,
                      density === option.value && styles.optionLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Show Completed Toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Show completed</Text>
            <Switch
              value={showCompleted}
              onValueChange={onShowCompletedChange}
              trackColor={{
                false: colors.muted,
                true: sharedColors.brand.primaryLight,
              }}
              thumbColor={showCompleted ? sharedColors.brand.primary : colors.textMuted}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    backdropInner: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.3)",
    },
    menuContainer: {
      position: "absolute",
      right: spacing.md,
      zIndex: 50,
    },
    menu: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      minWidth: 220,
      ...shadows.lg,
    },
    section: {
      paddingVertical: spacing.sm,
    },
    sectionTitle: {
      ...textStyles.sectionHeader,
      color: colors.textMuted,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xs,
    },
    optionsList: {
      paddingHorizontal: spacing.sm,
    },
    radioOption: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.sm,
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.textMuted,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: sharedColors.brand.primary,
    },
    optionLabel: {
      ...textStyles.body,
      color: colors.text,
    },
    optionLabelSelected: {
      fontWeight: fontWeight.medium,
      color: sharedColors.brand.primary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    toggleLabel: {
      ...textStyles.body,
      color: colors.text,
    },
    directionToggle: {
      flexDirection: "row",
      alignItems: "center",
    },
    directionValue: {
      ...textStyles.small,
      color: colors.textSecondary,
      marginRight: spacing.xs,
    },
  });
}
