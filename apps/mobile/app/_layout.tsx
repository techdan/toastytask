import { useEffect } from "react";
import { useColorScheme, ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";
import { tokenCache } from "@/lib/auth/token-cache";
import { setClerkGetToken } from "@/lib/api";
import { DatabaseProvider } from "@/lib/storage/DatabaseContext";
import { ThemeProvider, themes, type ColorScheme } from "@/constants/theme";

// Prevent auto-hide of splash screen
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    // Set the Clerk getToken function for API calls
    setClerkGetToken(getToken);
  }, [getToken]);

  return <>{children}</>;
}

/**
 * Auth guard that redirects based on authentication state.
 * - Unauthenticated users are redirected to sign-in
 * - Authenticated users are redirected away from auth screens
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isSignedIn && !inAuthGroup) {
      // User is not signed in and trying to access protected route
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      // User is signed in but still on auth screen - go to main screen (v2)
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, segments, router]);

  // Show loading while checking auth
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const publishableKey = Constants.expoConfig?.extra?.clerkPublishableKey;
  const systemColorScheme = useColorScheme();
  const colorScheme: ColorScheme = systemColorScheme ?? "light";
  const theme = themes[colorScheme];

  useEffect(() => {
    // Hide splash screen after layout is ready
    SplashScreen.hideAsync();
  }, []);

  if (!publishableKey) {
    // In development without Clerk, show a warning
    console.warn("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set");
  }

  // If no Clerk key, render without auth (for development)
  if (!publishableKey) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider value={theme}>
          <DatabaseProvider>
            <QueryClientProvider client={queryClient}>
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen
                  name="settings"
                  options={{ title: "Settings", presentation: "card" }}
                />
                <Stack.Screen
                  name="task/[id]"
                  options={{ title: "Task", presentation: "modal" }}
                />
              </Stack>
              <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            </QueryClientProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={theme}>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <ClerkLoaded>
            <DatabaseProvider>
              <QueryClientProvider client={queryClient}>
                <AuthProvider>
                  <AuthGuard>
                    <Stack>
                      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                      <Stack.Screen name="index" options={{ headerShown: false }} />
                      <Stack.Screen
                        name="settings"
                        options={{ title: "Settings", presentation: "card" }}
                      />
                      <Stack.Screen
                        name="task/[id]"
                        options={{ title: "Task", presentation: "modal" }}
                      />
                    </Stack>
                  </AuthGuard>
                </AuthProvider>
              </QueryClientProvider>
            </DatabaseProvider>
          </ClerkLoaded>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        </ClerkProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
