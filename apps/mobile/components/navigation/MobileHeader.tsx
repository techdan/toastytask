import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, sharedColors } from "../../constants";
import { spacing, shadows } from "../../constants/spacing";
import { textStyles } from "../../constants/typography";
import { Logo } from "../ui/Logo";

const HEADER_HEIGHT = 56;

interface MobileHeaderProps {
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onOpenOptions: () => void;
  isSearchActive: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onSearchCancel: () => void;
}

export function MobileHeader({
  onOpenDrawer,
  onOpenSearch,
  onOpenOptions,
  isSearchActive,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onSearchCancel,
}: MobileHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<TextInput>(null);

  // Animation for search mode transition
  const searchAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(searchAnimation, {
      toValue: isSearchActive ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();

    if (isSearchActive) {
      // Focus the search input when search becomes active
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 200);
    }
  }, [isSearchActive, searchAnimation]);

  // Interpolated values for animations
  const normalOpacity = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const searchOpacity = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const searchTranslateX = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0],
  });

  const handleSubmit = () => {
    onSearchSubmit(searchValue);
  };

  const styles = createStyles(colors, insets.top);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={colors.background === "#f9fafb" ? "dark-content" : "light-content"}
        backgroundColor={colors.card}
      />

      {/* Normal Header Mode */}
      <Animated.View
        style={[styles.normalHeader, { opacity: normalOpacity }]}
        pointerEvents={isSearchActive ? "none" : "auto"}
      >
        {/* Hamburger Menu Button */}
        <TouchableOpacity
          onPress={onOpenDrawer}
          style={styles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Ionicons name="menu" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Logo and Title */}
        <View style={styles.titleContainer}>
          <Logo size="medium" />
        </View>

        {/* Right Actions */}
        <View style={styles.rightActions}>
          <TouchableOpacity
            onPress={onOpenSearch}
            style={styles.iconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Search tasks"
            accessibilityRole="button"
          >
            <Ionicons name="search" size={22} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onOpenOptions}
            style={styles.iconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Options menu"
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Search Mode Header */}
      <Animated.View
        style={[
          styles.searchHeader,
          {
            opacity: searchOpacity,
            transform: [{ translateX: searchTranslateX }],
          },
        ]}
        pointerEvents={isSearchActive ? "auto" : "none"}
      >
        {/* Back/Cancel Button */}
        <TouchableOpacity
          onPress={onSearchCancel}
          style={styles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Cancel search"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Search Input */}
        <View style={[styles.searchInputContainer, { backgroundColor: colors.muted }]}>
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search tasks and notes..."
            placeholderTextColor={colors.textMuted}
            value={searchValue}
            onChangeText={onSearchChange}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleSubmit}
          style={styles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Submit search"
          accessibilityRole="button"
        >
          <Ionicons
            name="checkmark"
            size={24}
            color={searchValue.trim() ? sharedColors.brand.primary : colors.textMuted}
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>, topInset: number) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      paddingTop: topInset,
      ...shadows.sm,
      zIndex: 30,
    },
    normalHeader: {
      height: HEADER_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.sm,
      position: "absolute",
      top: topInset,
      left: 0,
      right: 0,
    },
    searchHeader: {
      height: HEADER_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.sm,
    },
    iconButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 20,
    },
    titleContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    rightActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    searchInputContainer: {
      flex: 1,
      height: 40,
      marginHorizontal: spacing.sm,
      borderRadius: 20,
      paddingHorizontal: spacing.md,
      justifyContent: "center",
    },
    searchInput: {
      ...textStyles.body,
      padding: 0,
    },
  });
}
