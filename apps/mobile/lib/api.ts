import { createApiClient } from "@toasty/api-client";
import Constants from "expo-constants";
import { tokenCache } from "./auth/token-cache";

// Get auth token from Clerk session
let clerkGetToken: (() => Promise<string | null>) | null = null;

export function setClerkGetToken(getToken: () => Promise<string | null>) {
  clerkGetToken = getToken;
}

const baseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl || "http://localhost:3000";

export const api = createApiClient({
  baseUrl,
  getAuthToken: async () => {
    if (clerkGetToken) {
      return clerkGetToken();
    }
    // Fallback to cached token
    return tokenCache.getToken("__clerk_session_token");
  },
});

export type { ToastyApiClient } from "@toasty/api-client";
