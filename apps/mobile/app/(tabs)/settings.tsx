/**
 * Settings Tab Screen
 *
 * User preferences and account settings.
 * Features:
 * - Account section with user email and sign out
 * - Sync status with last sync time and pending changes
 * - Force sync button
 * - App version info
 */

import { View, StyleSheet, ScrollView, TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { RefreshCw } from "lucide-react-native";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingRow } from "@/components/settings/SettingRow";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useSync } from "@/hooks/useSync";
import { useThemeColors } from "@/constants/theme";
import { spacing, borderRadius } from "@/constants/spacing";
import { textStyles } from "@/constants/typography";
import { semantic } from "@/constants/colors";

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

export default function SettingsScreen() {
  const { signOut, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const themeColors = useThemeColors();
  const syncStatus = useSyncStatus();
  const { sync, isSyncing, isOffline, error: syncError } = useSync();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const handleSync = async () => {
    await sync();
    syncStatus.refresh();
  };

  return (
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
          value="1.0.0"
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
          <Text style={[styles.errorHint, { color: themeColors.mutedForeground }]}>
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
