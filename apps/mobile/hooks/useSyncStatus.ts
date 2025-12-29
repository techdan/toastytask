import { useCallback, useEffect, useState } from "react";
import { useLocalDatabase } from "./useLocalDatabase";

interface SyncStatus {
  pendingCount: number;
  lastPullAt: string | null;
  lastPushAt: string | null;
  isStale: boolean;
  isVeryStale: boolean;
}

/**
 * Hook for getting sync status information
 * Useful for displaying sync indicators in the UI
 */
export function useSyncStatus(): SyncStatus & { refresh: () => void } {
  const { database, outbox, isReady } = useLocalDatabase();
  const [status, setStatus] = useState<SyncStatus>({
    pendingCount: 0,
    lastPullAt: null,
    lastPushAt: null,
    isStale: false,
    isVeryStale: false,
  });

  const refresh = useCallback(() => {
    if (!database || !outbox || !isReady) {
      return;
    }

    const syncState = database.getSyncState();
    const pendingCount = outbox.getPendingCount();

    // Calculate staleness
    const now = new Date();
    let isStale = false;
    let isVeryStale = false;

    if (syncState.lastPullAt) {
      const lastPull = new Date(syncState.lastPullAt);
      const hoursSinceLastPull = (now.getTime() - lastPull.getTime()) / (1000 * 60 * 60);
      isStale = hoursSinceLastPull > 1;
      isVeryStale = hoursSinceLastPull > 24;
    } else {
      // Never synced
      isVeryStale = true;
      isStale = true;
    }

    setStatus({
      pendingCount,
      lastPullAt: syncState.lastPullAt,
      lastPushAt: syncState.lastPushAt,
      isStale,
      isVeryStale,
    });
  }, [database, outbox, isReady]);

  // Refresh on mount and when database becomes ready
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh every minute to update staleness
  useEffect(() => {
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    ...status,
    refresh,
  };
}

interface DatabaseStats {
  taskCount: number;
  pendingTaskCount: number;
  conflictTaskCount: number;
  localOnlyTaskCount: number;
  projectCount: number;
  noteCount: number;
}

/**
 * Hook for getting database statistics
 * Useful for debugging and development
 */
export function useDatabaseStats() {
  const { database, isReady } = useLocalDatabase();
  const [stats, setStats] = useState<DatabaseStats | null>(null);

  const refresh = useCallback(() => {
    if (!database || !isReady) {
      return;
    }

    setStats(database.getStats());
  }, [database, isReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    stats,
    refresh,
    isReady,
  };
}
