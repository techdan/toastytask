/**
 * StarButton Component
 *
 * A tappable star button that cycles through 4 levels (0-3).
 * Each level has a distinct color: gray (none), blue, yellow, orange.
 */

import { Pressable, StyleSheet } from "react-native";
import { Star } from "lucide-react-native";
import { getStarColor, star as starColors } from "@/constants/colors";
import { componentSize } from "@/constants/spacing";

export type StarLevel = 0 | 1 | 2 | 3;

interface StarButtonProps {
  /** Current star level (0-3) */
  level: StarLevel;
  /** Callback when star is tapped */
  onPress?: () => void;
  /** Size of the star icon (default: 20) */
  size?: number;
  /** Whether the button is disabled */
  disabled?: boolean;
}

export function StarButton({
  level,
  onPress,
  size = componentSize.starIcon,
  disabled = false,
}: StarButtonProps) {
  const color = getStarColor(level);
  const isFilled = level > 0;

  return (
    <Pressable
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
    >
      <Star
        size={size}
        color={color}
        fill={isFilled ? color : "transparent"}
        strokeWidth={isFilled ? 0 : 2}
        style={level === 0 ? styles.emptyStarStyle : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  emptyStarStyle: {
    opacity: 0.5,
  },
});

/**
 * Utility function to cycle star level
 * 0 → 1 → 2 → 3 → 0
 */
export function cycleStarLevel(currentLevel: StarLevel): StarLevel {
  return ((currentLevel + 1) % 4) as StarLevel;
}
