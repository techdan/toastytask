import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useDatabaseContext } from "@/lib/storage/DatabaseContext";
import { SyncEngine, useNetworkState, type SyncEvent } from "@/lib/sync";

interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastPullAt: string | null;
  lastPushAt: string | null;
  isOffline: boolean;
  error: Error | null;
  progressMessage: string | null;
}

export function useSync() {
  const { getToken, isSignedIn } = useAuth();
  const isConnected = useNetworkState();
  const { database, outbox, isReady } = useDatabaseContext();

  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    lastPullAt: null,
    lastPushAt: null,
    isOffline: false,
    error: null,
    progressMessage: null,
  });

  const engineRef = useRef<SyncEngine | null>(null);
  // Track refs to avoid getToken/isSignedIn causing re-runs
  const getTokenRef = useRef(getToken);
  const isSignedInRef = useRef(isSignedIn);

  // Keep refs current without triggering effect re-runs
  useEffect(() => {
    getTokenRef.current = getToken;
    isSignedInRef.current = isSignedIn;
  }, [getToken, isSignedIn]);

  // Initialize sync engine only after database is ready
  useEffect(() => {
    // Don't initialize until database context is ready
    if (!isReady || !database || !outbox) {
      return;
    }

    // Only create engine once
    if (engineRef.current) {
      return;
    }

    let mounted = true;

    const engine = new SyncEngine({
      database,
      outbox,
      refreshAuthToken: async () => {
        if (!isSignedInRef.current) return false;
        try {
          const token = await getTokenRef.current();
          return token !== null;
        } catch {
          return false;
        }
      },
    });

    engineRef.current = engine;

    // Subscribe to sync events
    const unsubscribe = engine.events.subscribe((event: SyncEvent) => {
      if (!mounted) return;

      switch (event.type) {
        case "sync:started":
          setStatus((prev) => ({ ...prev, isSyncing: true, error: null, progressMessage: "Starting sync..." }));
          break;
        case "sync:progress":
          setStatus((prev) => ({ ...prev, progressMessage: event.message }));
          break;
        case "sync:completed":
          setStatus((prev) => ({
            ...prev,
            isSyncing: false,
            lastPullAt: new Date().toISOString(),
            progressMessage: null,
          }));
          break;
        case "sync:offline":
          setStatus((prev) => ({ ...prev, isOffline: true, progressMessage: null }));
          break;
        case "sync:error":
          setStatus((prev) => ({
            ...prev,
            isSyncing: false,
            error: event.error,
            progressMessage: null,
          }));
          break;
        case "sync:pending-count":
          setStatus((prev) => ({ ...prev, pendingCount: event.count }));
          break;
      }
    });

    // Update initial status - database is guaranteed ready now
    const engineStatus = engine.getStatus();
    setStatus((prev) => ({
      ...prev,
      pendingCount: engineStatus.pendingCount,
      lastPullAt: engineStatus.syncState.lastPullAt,
      lastPushAt: engineStatus.syncState.lastPushAt,
    }));

    return () => {
      mounted = false;
      unsubscribe();
      engineRef.current = null;
    };
  }, [isReady, database, outbox]);

  // Update offline status when network changes
  useEffect(() => {
    setStatus((prev) => ({ ...prev, isOffline: !isConnected }));
  }, [isConnected]);

  // Trigger sync
  const sync = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.sync();
    }
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (isConnected && isSignedIn && engineRef.current) {
      engineRef.current.sync();
    }
  }, [isConnected, isSignedIn]);

  return {
    ...status,
    sync,
  };
}
