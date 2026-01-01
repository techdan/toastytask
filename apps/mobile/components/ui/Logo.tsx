/**
 * Logo Component
 *
 * Toasty Task logo for the mobile app.
 * Uses the fire emoji as the icon which renders natively on mobile.
 * The text follows the theme colors.
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
  /** Use brand color for text (orange) */
  useBrandColor?: boolean;
}

const SIZES = {
  small: {
    icon: 16,
    text: 14,
    gap: spacing.xs,
  },
  medium: {
    icon: 22,
    text: 18,
    gap: spacing.xs,
  },
  large: {
    icon: 32,
    text: 24,
    gap: spacing.sm,
  },
} as const;

export function Logo({ size = "medium", showText = true, useBrandColor = false }: LogoProps) {
  const colors = useThemeColors();
  const sizeConfig = SIZES[size];
  const textColor = useBrandColor ? brand.primary : colors.text;

  return (
    <View style={styles.container}>
      <Text style={[styles.icon, { fontSize: sizeConfig.icon }]}>🔥</Text>
      {showText && (
        <Text
          style={[
            styles.text,
            {
              fontSize: sizeConfig.text,
              color: textColor,
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
  icon: {
    // Fire emoji renders natively on both iOS and Android
  },
  text: {
    fontWeight: fontWeight.semibold,
  },
});
