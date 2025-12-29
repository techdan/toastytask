import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";
import { tokenCache } from "@/lib/auth/token-cache";
import { setClerkGetToken } from "@/lib/api";
import { DatabaseProvider } from "@/lib/storage/DatabaseContext";

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

export default function RootLayout() {
  const publishableKey = Constants.expoConfig?.extra?.clerkPublishableKey;

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
      <DatabaseProvider>
        <QueryClientProvider client={queryClient}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="task/[id]"
              options={{ title: "Task", presentation: "modal" }}
            />
          </Stack>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </DatabaseProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <DatabaseProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <Stack>
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="task/[id]"
                  options={{ title: "Task", presentation: "modal" }}
                />
              </Stack>
            </AuthProvider>
          </QueryClientProvider>
        </DatabaseProvider>
      </ClerkLoaded>
      <StatusBar style="auto" />
    </ClerkProvider>
  );
}
