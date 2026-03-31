import "react-native-get-random-values";
import { useEffect, useMemo } from "react";
import { useColorScheme, ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { tokenCache } from "@/lib/auth/token-cache";
import { setClerkGetToken } from "@/lib/api";
import { DatabaseProvider } from "@/lib/storage/DatabaseContext";
import { ThemeProvider, themes, type ColorScheme } from "@/constants/theme";
import {
  AppSettingsProvider,
  useAppSettings,
} from "@/contexts/AppSettingsContext";

// Load Clerk key from config.local.js
let clerkPublishableKey: string | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const localConfig = require("../config.local.js");
  clerkPublishableKey = localConfig.CLERK_PUBLISHABLE_KEY;
} catch {
  // config.local.js doesn't exist
}

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
 * Resolves the theme based on user preference and system setting
 */
function useResolvedTheme() {
  const systemColorScheme = useColorScheme();
  const appSettings = useAppSettings();

  return useMemo(() => {
    let resolvedScheme: ColorScheme;

    if (appSettings.theme === "system") {
      resolvedScheme = systemColorScheme ?? "light";
    } else {
      resolvedScheme = appSettings.theme;
    }

    return {
      theme: themes[resolvedScheme],
      colorScheme: resolvedScheme,
    };
  }, [appSettings.theme, systemColorScheme]);
}

/**
 * App content with resolved theme
 */
function ThemedAppContent({
  children,
  publishableKey,
}: {
  children?: React.ReactNode;
  publishableKey?: string;
}) {
  const { theme, colorScheme } = useResolvedTheme();

  useEffect(() => {
    // Hide splash screen after layout is ready
    SplashScreen.hideAsync();
  }, []);

  if (!publishableKey) {
    return (
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
    );
  }

  return (
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
  );
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
  const publishableKey = clerkPublishableKey;

  if (!publishableKey) {
    // In development without Clerk, show a warning
    console.warn("Clerk publishable key not found. Add CLERK_PUBLISHABLE_KEY to apps/mobile/config.local.js");
  }

  // AppSettingsProvider must be at root level for theme to work
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppSettingsProvider>
        <ThemedAppContent publishableKey={publishableKey} />
      </AppSettingsProvider>
    </GestureHandlerRootView>
  );
}
