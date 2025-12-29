import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const { signOut, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        {isSignedIn && user ? (
          <View style={styles.card}>
            <Text style={styles.email}>{user.emailAddresses[0]?.emailAddress}</Text>
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.notSignedIn}>Not signed in</Text>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/sign-in")}
              style={styles.signInButton}
            >
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync Status</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Last synced</Text>
            <Text style={styles.value}>Not synced</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pending changes</Text>
            <Text style={styles.value}>0</Text>
          </View>
          <TouchableOpacity style={styles.syncButton}>
            <Text style={styles.syncText}>Sync Now</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>1.0.0</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  email: {
    fontSize: 16,
    color: "#1f2937",
    marginBottom: 16,
  },
  notSignedIn: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 16,
  },
  signOutButton: {
    backgroundColor: "#fee2e2",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: {
    color: "#dc2626",
    fontWeight: "600",
  },
  signInButton: {
    backgroundColor: "#f24c05",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  signInText: {
    color: "#fff",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  label: {
    fontSize: 16,
    color: "#6b7280",
  },
  value: {
    fontSize: 16,
    color: "#1f2937",
  },
  syncButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  syncText: {
    color: "#1f2937",
    fontWeight: "600",
  },
});
