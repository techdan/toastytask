/**
 * SettingsSection Component
 *
 * A card-style container for grouping related settings.
 * Features a title and contains SettingRow children.
 */

import { View, Text, StyleSheet } from "react-native";
import { spacing, borderRadius, shadows } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { useThemeColors } from "@/constants/theme";

interface SettingsSectionProps {
  /** Section title (displayed in uppercase) */
  title: string;
  /** Setting rows or other content */
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: themeColors.textSecondary }]}>
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: themeColors.card }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  title: {
    ...textStyles.sectionHeader,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    ...shadows.sm,
  },
});
