import { createApiClient } from "@toasty/api-client";
import { tokenCache } from "./auth/token-cache";

// Get auth token from Clerk session
let clerkGetToken: (() => Promise<string | null>) | null = null;

export function setClerkGetToken(getToken: () => Promise<string | null>) {
  clerkGetToken = getToken;
}

// Try to load from config.local.js, fallback to localhost
let baseUrl = "http://localhost:3000";
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const localConfig = require("../config.local.js");
  baseUrl = localConfig.API_BASE_URL || baseUrl;
} catch {
  // config.local.js doesn't exist, use default
}

console.log("[API] Base URL:", baseUrl);

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
