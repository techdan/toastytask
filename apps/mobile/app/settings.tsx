/**
 * Settings Screen (v2)
 *
 * Standalone settings screen accessible from the projects drawer.
 * Features:
 * - Account section with user email and sign out
 * - Display preferences (theme, density, default sort, badge display)
 * - Sync status with last sync time and pending changes
 * - Force sync button
 * - App version info
 */

import { View, StyleSheet, ScrollView, TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter, Stack } from "expo-router";
import { RefreshCw, ChevronLeft } from "lucide-react-native";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingRow } from "@/components/settings/SettingRow";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useSync } from "@/hooks/useSync";
import { useProjects } from "@/hooks/useProjects";
import { useThemeColors } from "@/constants/theme";
import { spacing, borderRadius } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { semantic, brand } from "@/constants/colors";
import {
  useAppSettings,
  useAppSettingsUpdaters,
} from "@/contexts/AppSettingsContext";
import type { MobileSortMode } from "@/lib/sorting";
import type { Priority, DefaultDueDate } from "@toasty/contracts";

function formatLastSync(isoDate: string | null): string {
  if (!isoDate) return "Never";

  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatSortMode(sortMode: MobileSortMode): string {
  switch (sortMode) {
    case "importance":
      return "Importance";
    case "heat":
      return "Heat";
    case "createdAt":
      return "Created";
    case "updatedAt":
      return "Modified";
    default:
      return sortMode;
  }
}

function formatTheme(theme: "light" | "dark" | "system"): string {
  switch (theme) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    case "system":
      return "System";
    default:
      return theme;
  }
}

function formatDensity(density: "comfortable" | "compact"): string {
  switch (density) {
    case "comfortable":
      return "Comfortable";
    case "compact":
      return "Compact";
    default:
      return density;
  }
}

function formatBadgeMode(badgeMode: "heat" | "importance"): string {
  switch (badgeMode) {
    case "heat":
      return "Heat";
    case "importance":
      return "Importance";
    default:
      return badgeMode;
  }
}

function formatPriority(priority: Priority): string {
  switch (priority) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "top":
      return "Top";
    default:
      return priority;
  }
}

function formatDefaultDueDate(dueDate: DefaultDueDate): string {
  switch (dueDate) {
    case "none":
      return "None";
    case "today":
      return "Today";
    case "tomorrow":
      return "Tomorrow";
    case "next_week":
      return "Next Week";
    default:
      return dueDate;
  }
}

export default function SettingsScreen() {
  const { signOut, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const themeColors = useThemeColors();
  const syncStatus = useSyncStatus();
  const { sync, isSyncing, isOffline, error: syncError } = useSync();
  const { projects } = useProjects();

  // App settings from context
  const appSettings = useAppSettings();
  const {
    setSortMode,
    setTheme,
    setDensity,
    setBadgeMode,
    setDefaultPriority,
    setDefaultDueDate,
    setDefaultProjectId,
  } = useAppSettingsUpdaters();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const handleSync = async () => {
    await sync();
    syncStatus.refresh();
  };

  // Cycle through sort modes
  const cycleSortMode = () => {
    const modes: MobileSortMode[] = ["importance", "heat", "createdAt", "updatedAt"];
    const currentIndex = modes.indexOf(appSettings.sortMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setSortMode(modes[nextIndex]);
  };

  // Cycle through themes
  const cycleTheme = () => {
    const themes: Array<"light" | "dark" | "system"> = ["system", "light", "dark"];
    const currentIndex = themes.indexOf(appSettings.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  // Toggle density
  const toggleDensity = () => {
    setDensity(appSettings.density === "comfortable" ? "compact" : "comfortable");
  };

  // Toggle badge mode
  const toggleBadgeMode = () => {
    setBadgeMode(appSettings.badgeMode === "heat" ? "importance" : "heat");
  };

  // Cycle through priorities
  const cyclePriority = () => {
    const priorities: Priority[] = ["low", "medium", "high", "top"];
    const currentIndex = priorities.indexOf(appSettings.defaultPriority);
    const nextIndex = (currentIndex + 1) % priorities.length;
    setDefaultPriority(priorities[nextIndex]);
  };

  // Cycle through default due dates
  const cycleDueDate = () => {
    const dueDates: DefaultDueDate[] = ["none", "today", "tomorrow", "next_week"];
    const currentIndex = dueDates.indexOf(appSettings.defaultDueDate);
    const nextIndex = (currentIndex + 1) % dueDates.length;
    setDefaultDueDate(dueDates[nextIndex]);
  };

  // Cycle through projects (including "None")
  const cycleProject = () => {
    const projectIds: (number | null)[] = [null, ...projects.map((p) => p.id)];
    const currentIndex = projectIds.indexOf(appSettings.defaultProjectId);
    const nextIndex = (currentIndex + 1) % projectIds.length;
    setDefaultProjectId(projectIds[nextIndex]);
  };

  // Get project name for display
  const getProjectName = (projectId: number | null): string => {
    if (projectId === null) return "None";
    const project = projects.find((p) => p.id === projectId);
    return project?.name ?? "Unknown";
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Settings",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeft size={24} color={themeColors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: themeColors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* Account Section */}
        <SettingsSection title="Account">
          {isSignedIn && user ? (
            <>
              <SettingRow
                label="Email"
                value={user.emailAddresses[0]?.emailAddress}
                showChevron={false}
              />
              <SettingRow
                label="Sign Out"
                onPress={handleSignOut}
                valueColor={semantic.error}
                isLast
              />
            </>
          ) : (
            <SettingRow
              label="Sign In"
              onPress={() => router.push("/(auth)/sign-in")}
              isLast
            />
          )}
        </SettingsSection>

        {/* Display Section (v2 additions) */}
        <SettingsSection title="Display">
          <SettingRow
            label="Theme"
            value={formatTheme(appSettings.theme)}
            onPress={cycleTheme}
          />
          <SettingRow
            label="Density"
            value={formatDensity(appSettings.density)}
            onPress={toggleDensity}
          />
          <SettingRow
            label="Default Sort"
            value={formatSortMode(appSettings.sortMode)}
            onPress={cycleSortMode}
          />
          <SettingRow
            label="Badge Display"
            value={formatBadgeMode(appSettings.badgeMode)}
            onPress={toggleBadgeMode}
            isLast
          />
        </SettingsSection>

        {/* Default Settings Section */}
        <SettingsSection title="New Task Defaults">
          <SettingRow
            label="Priority"
            value={formatPriority(appSettings.defaultPriority)}
            onPress={cyclePriority}
          />
          <SettingRow
            label="Due Date"
            value={formatDefaultDueDate(appSettings.defaultDueDate)}
            onPress={cycleDueDate}
          />
          <SettingRow
            label="Project"
            value={getProjectName(appSettings.defaultProjectId)}
            onPress={cycleProject}
            isLast
          />
        </SettingsSection>

        {/* Sync Section */}
        <SettingsSection title="Sync">
          <SettingRow
            label="Last synced"
            value={formatLastSync(syncStatus.lastPullAt)}
            showChevron={false}
          />
          <SettingRow
            label="Pending changes"
            value={String(syncStatus.pendingCount)}
            showChevron={false}
          />
          <SettingRow
            label="Status"
            value={syncError ? "Error" : isOffline ? "Offline" : "Online"}
            valueColor={syncError ? semantic.error : isOffline ? semantic.warning : semantic.success}
            showChevron={false}
          />
          <View style={styles.syncButtonContainer}>
            <TouchableOpacity
              style={[
                styles.syncButton,
                { backgroundColor: themeColors.muted },
                isSyncing && styles.syncButtonDisabled,
              ]}
              onPress={handleSync}
              disabled={isSyncing || isOffline}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={themeColors.text} />
              ) : (
                <>
                  <RefreshCw size={18} color={themeColors.text} />
                  <Text style={[styles.syncButtonText, { color: themeColors.text }]}>
                    Sync Now
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SettingsSection>

        {/* About Section */}
        <SettingsSection title="About">
          <SettingRow
            label="Version"
            value="2.0.0"
            showChevron={false}
            isLast
          />
        </SettingsSection>

        {/* Sync Error */}
        {syncError && (
          <View style={[styles.errorCard, { backgroundColor: "#fee2e2" }]}>
            <Text style={styles.errorText}>
              Sync failed: {syncError.message || "Unable to connect to server"}
            </Text>
            <Text style={[styles.errorHint, { color: themeColors.textMuted }]}>
              Check that the dev server is running and API_BASE_URL is configured correctly in .env
            </Text>
          </View>
        )}

        {/* Sync Warning */}
        {syncStatus.isVeryStale && !syncError && (
          <View style={[styles.warningCard, { backgroundColor: "#fef3c7" }]}>
            <Text style={styles.warningText}>
              Your data hasn't synced in over 24 hours. Connect to the internet and sync to avoid losing changes.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  syncButtonContainer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    ...textStyles.body,
    fontWeight: "600",
  },
  warningCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  warningText: {
    ...textStyles.body,
    color: "#92400e",
  },
  errorCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  errorText: {
    ...textStyles.body,
    color: "#dc2626",
    fontWeight: "600",
  },
  errorHint: {
    ...textStyles.caption,
    marginTop: spacing.sm,
  },
});
