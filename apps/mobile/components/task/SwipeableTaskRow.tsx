/**
 * SwipeableTaskRow Component
 *
 * Wraps TaskListItem with swipe gestures for heat/cool actions.
 * - Swipe right (>60%): Heat task (orange background, flame icon)
 * - Swipe left (>60%): Cool task (blue background, snowflake icon)
 */

import { useRef, useCallback } from "react";
import { View, StyleSheet, Text, Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Flame, Snowflake } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { TaskListItem, type TaskWithFresh, type DensityMode } from "@/components/TaskListItem";
import type { BadgeMode } from "@/components/ui/HeatBadge";
import type { ProjectDTO } from "@toasty/contracts";
import { swipe as swipeColors } from "@/constants/colors";
import { spacing } from "@/constants/spacing";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.4; // 40% of width to trigger action
const MAX_SWIPE = SCREEN_WIDTH * 0.75; // Max swipe distance

interface SwipeableTaskRowProps {
  /** The task to display */
  task: TaskWithFresh;
  /** Callback when task row is pressed */
  onPress: () => void;
  /** Callback when task is heated (swiped right) */
  onHeat?: () => void;
  /** Callback when task is cooled (swiped left) */
  onCool?: () => void;
  /** Associated project */
  project?: ProjectDTO | null;
  /** Badge display mode */
  badgeMode?: BadgeMode;
  /** Badge mode toggle callback */
  onBadgeModeToggle?: () => void;
  /** Density mode */
  density?: DensityMode;
  /** Whether task is focused */
  isFocused?: boolean;
  /** Disable swipe gestures (e.g., for completed tasks) */
  enableSwipe?: boolean;
}

export function SwipeableTaskRow({
  task,
  onPress,
  onHeat,
  onCool,
  project,
  badgeMode = "heat",
  onBadgeModeToggle,
  density = "comfortable",
  isFocused = false,
  enableSwipe = true,
}: SwipeableTaskRowProps) {
  const translateX = useSharedValue(0);
  const hasTriggeredHapticRef = useRef(false);

  // Stable refs prevent stale closures in Reanimated worklets
  const onHeatRef = useRef(onHeat);
  onHeatRef.current = onHeat;
  const onCoolRef = useRef(onCool);
  onCoolRef.current = onCool;

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleHeat = useCallback(() => {
    onHeatRef.current?.();
  }, []);

  const handleCool = useCallback(() => {
    onCoolRef.current?.();
  }, []);

  const panGesture = Gesture.Pan()
    .enabled(enableSwipe)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart(() => {
      hasTriggeredHapticRef.current = false;
    })
    .onUpdate((event) => {
      const clampedX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, event.translationX));
      translateX.value = clampedX;

      // Trigger haptic when crossing threshold
      const thresholdDistance = SCREEN_WIDTH * SWIPE_THRESHOLD;
      const crossedThreshold = Math.abs(clampedX) >= thresholdDistance;

      if (crossedThreshold && !hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = true;
        runOnJS(triggerHaptic)();
      } else if (!crossedThreshold && hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = false;
      }
    })
    .onEnd((event, success) => {
      const thresholdDistance = SCREEN_WIDTH * SWIPE_THRESHOLD;
      const translationX = event.translationX;

      // Only trigger action on successful (non-cancelled) gesture that crossed threshold
      if (success) {
        if (translationX > thresholdDistance) {
          runOnJS(handleHeat)();
        } else if (translationX < -thresholdDistance) {
          runOnJS(handleCool)();
        }
      }

      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  // Animated style for the row
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Animated style for heat background (right side)
  const heatBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SCREEN_WIDTH * 0.3, SCREEN_WIDTH * SWIPE_THRESHOLD],
      [0, 0.3, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
    };
  });

  // Animated style for cool background (left side)
  const coolBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, -SCREEN_WIDTH * 0.3, -SCREEN_WIDTH * SWIPE_THRESHOLD],
      [0, 0.3, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
    };
  });

  // Animated style for heat icon
  const heatIconStyle = useAnimatedStyle(() => {
    const thresholdDistance = SCREEN_WIDTH * SWIPE_THRESHOLD;
    const scale = interpolate(
      translateX.value,
      [0, thresholdDistance * 0.5, thresholdDistance],
      [0.5, 0.8, 1.2],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity: translateX.value > 20 ? 1 : 0,
    };
  });

  // Animated style for cool icon
  const coolIconStyle = useAnimatedStyle(() => {
    const thresholdDistance = SCREEN_WIDTH * SWIPE_THRESHOLD;
    const scale = interpolate(
      translateX.value,
      [0, -thresholdDistance * 0.5, -thresholdDistance],
      [0.5, 0.8, 1.2],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity: translateX.value < -20 ? 1 : 0,
    };
  });

  // Threshold line style
  const thresholdLineStyle = useAnimatedStyle(() => {
    const thresholdDistance = SCREEN_WIDTH * SWIPE_THRESHOLD;
    const isNearThreshold = Math.abs(translateX.value) > thresholdDistance * 0.5;

    return {
      opacity: withTiming(isNearThreshold ? 0.5 : 0, { duration: 150 }),
    };
  });

  if (!enableSwipe) {
    // Render without swipe wrapper
    return (
      <TaskListItem
        task={task}
        onPress={onPress}
        project={project}
        badgeMode={badgeMode}
        onBadgeModeToggle={onBadgeModeToggle}
        density={density}
        isFocused={isFocused}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Heat background (revealed on right swipe) */}
      <Animated.View style={[styles.heatBackground, heatBackgroundStyle]}>
        <Animated.View style={[styles.iconContainer, heatIconStyle]}>
          <Flame size={32} color="#fff" />
          <Text style={styles.actionText}>Heat</Text>
        </Animated.View>
        {/* Threshold line */}
        <Animated.View
          style={[
            styles.thresholdLine,
            styles.thresholdLineRight,
            thresholdLineStyle,
          ]}
        />
      </Animated.View>

      {/* Cool background (revealed on left swipe) */}
      <Animated.View style={[styles.coolBackground, coolBackgroundStyle]}>
        <Animated.View style={[styles.iconContainer, styles.iconContainerRight, coolIconStyle]}>
          <Snowflake size={32} color="#fff" />
          <Text style={styles.actionText}>Cool</Text>
        </Animated.View>
        {/* Threshold line */}
        <Animated.View
          style={[
            styles.thresholdLine,
            styles.thresholdLineLeft,
            thresholdLineStyle,
          ]}
        />
      </Animated.View>

      {/* Swipeable row */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={rowStyle}>
          <TaskListItem
            task={task}
            onPress={onPress}
            project={project}
            badgeMode={badgeMode}
            onBadgeModeToggle={onBadgeModeToggle}
            density={density}
            isFocused={isFocused}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  heatBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: swipeColors.heat,
    justifyContent: "center",
    paddingLeft: spacing.xl,
  },
  coolBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: swipeColors.cool,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing.xl,
  },
  iconContainer: {
    alignItems: "center",
    gap: spacing.xs,
  },
  iconContainerRight: {
    alignItems: "center",
  },
  actionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  thresholdLine: {
    position: "absolute",
    width: 2,
    top: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  thresholdLineRight: {
    left: SCREEN_WIDTH * SWIPE_THRESHOLD,
  },
  thresholdLineLeft: {
    right: SCREEN_WIDTH * SWIPE_THRESHOLD,
  },
});
