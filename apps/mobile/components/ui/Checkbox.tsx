/**
 * Checkbox Component
 *
 * Custom circular checkbox with animated checkmark.
 * - Unchecked: border only (gray)
 * - Checked: filled green with white checkmark
 */

import { Pressable, View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolateColor,
  interpolate,
} from "react-native-reanimated";
import { Check } from "lucide-react-native";
import { checkbox as checkboxColors } from "@/constants/colors";
import { componentSize, borderRadius } from "@/constants/spacing";

interface CheckboxProps {
  /** Whether the checkbox is checked */
  checked: boolean;
  /** Callback when checkbox is toggled */
  onToggle?: () => void;
  /** Size of the checkbox (default: 24) */
  size?: number;
  /** Whether the checkbox is disabled */
  disabled?: boolean;
}

const AnimatedView = Animated.createAnimatedComponent(View);

export function Checkbox({
  checked,
  onToggle,
  size = componentSize.checkbox,
  disabled = false,
}: CheckboxProps) {
  // Animation for the checkbox fill
  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      checked ? 1 : 0,
      [0, 1],
      ["transparent", checkboxColors.checked]
    );
    const borderColor = interpolateColor(
      checked ? 1 : 0,
      [0, 1],
      [checkboxColors.unchecked, checkboxColors.checked]
    );
    const scale = withSpring(checked ? 1 : 0.95, {
      damping: 15,
      stiffness: 150,
    });

    return {
      backgroundColor,
      borderColor,
      transform: [{ scale }],
    };
  }, [checked]);

  // Animation for the checkmark
  const checkmarkStyle = useAnimatedStyle(() => {
    const opacity = withTiming(checked ? 1 : 0, { duration: 150 });
    const scale = withSpring(checked ? 1 : 0.5, {
      damping: 15,
      stiffness: 200,
    });

    return {
      opacity,
      transform: [{ scale }],
    };
  }, [checked]);

  const checkIconSize = size * 0.65;

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={8}
      style={[styles.pressable, disabled && styles.disabled]}
    >
      <AnimatedView
        style={[
          styles.checkbox,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          animatedStyle,
        ]}
      >
        <Animated.View style={checkmarkStyle}>
          <Check
            size={checkIconSize}
            color={checkboxColors.checkmark}
            strokeWidth={3}
          />
        </Animated.View>
      </AnimatedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  checkbox: {
    borderWidth: componentSize.checkboxBorder,
    justifyContent: "center",
    alignItems: "center",
  },
});
