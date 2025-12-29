import { useDatabaseContext } from "../lib/storage/DatabaseContext";

/**
 * Hook for accessing the local database and outbox
 * Must be used within a DatabaseProvider
 */
export function useLocalDatabase() {
  return useDatabaseContext();
}
