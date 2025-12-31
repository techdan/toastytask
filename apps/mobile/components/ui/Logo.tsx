/**
 * Logo Component
 *
 * Simple logo component for the Toasty Task mobile app.
 * Displays the fire emoji and app name.
 */

import { View, Text, StyleSheet } from "react-native";
import { brand } from "@/constants/colors";
import { fontWeight } from "@/constants/typography";
import { spacing } from "@/constants/spacing";
import { useThemeColors } from "@/constants/theme";

interface LogoProps {
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Whether to show the text */
  showText?: boolean;
}

const SIZES = {
  small: {
    emoji: 16,
    text: 14,
    gap: spacing.xs,
  },
  medium: {
    emoji: 20,
    text: 18,
    gap: spacing.xs,
  },
  large: {
    emoji: 28,
    text: 24,
    gap: spacing.sm,
  },
} as const;

export function Logo({ size = "medium", showText = true }: LogoProps) {
  const colors = useThemeColors();
  const sizeConfig = SIZES[size];

  return (
    <View style={styles.container}>
      <Text style={[styles.emoji, { fontSize: sizeConfig.emoji }]}>🔥</Text>
      {showText && (
        <Text
          style={[
            styles.text,
            {
              fontSize: sizeConfig.text,
              color: colors.text,
              marginLeft: sizeConfig.gap,
            },
          ]}
        >
          Toasty Task
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  emoji: {
    // Fire emoji
  },
  text: {
    fontWeight: fontWeight.semibold,
  },
});
