import * as SecureStore from "expo-secure-store";

/**
 * Token cache for Clerk authentication
 * Uses expo-secure-store for secure token persistence
 */
export const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Silently fail on token save errors
    }
  },

  async deleteToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Silently fail on token delete errors
    }
  },
};
