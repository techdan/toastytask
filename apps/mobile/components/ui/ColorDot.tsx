/**
 * ColorDot Component
 *
 * A small colored circle used to indicate project colors.
 */

import { View, StyleSheet } from "react-native";
import { componentSize } from "@/constants/spacing";

interface ColorDotProps {
  /** Hex color for the dot */
  color: string;
  /** Size of the dot (default: 10) */
  size?: number;
}

export function ColorDot({
  color,
  size = componentSize.colorDotSize,
}: ColorDotProps) {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    // Base styles - dimensions set inline
  },
});

// Default project color when none is set
export const DEFAULT_PROJECT_COLOR = "#9ca3af";
