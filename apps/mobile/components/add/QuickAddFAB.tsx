/**
 * QuickAddFAB Component
 *
 * Floating Action Button for quickly adding new tasks.
 * Positioned at bottom-right with safe area insets.
 */

import { StyleSheet, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import { Plus } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand } from "@/constants/colors";
import { componentSize, layout, shadows, borderRadius } from "@/constants/spacing";

interface QuickAddFABProps {
  /** Callback when FAB is pressed */
  onPress: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function QuickAddFAB({ onPress }: QuickAddFABProps) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[
        styles.fab,
        animatedStyle,
        {
          bottom: layout.fabBottom + insets.bottom,
          right: layout.fabRight,
        },
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Plus size={componentSize.fabIconSize} color="#fff" strokeWidth={2.5} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: componentSize.fabSize,
    height: componentSize.fabSize,
    borderRadius: componentSize.fabSize / 2,
    backgroundColor: brand.primary,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.lg,
  },
});
