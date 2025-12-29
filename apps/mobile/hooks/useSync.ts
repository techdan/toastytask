import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { getDatabase, LocalDatabase } from "@/lib/storage/database";
import { SyncEngine, OutboxQueue, useNetworkState, type SyncEvent } from "@/lib/sync";
import * as SQLite from "expo-sqlite";

interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastPullAt: string | null;
  lastPushAt: string | null;
  isOffline: boolean;
  error: Error | null;
}

export function useSync() {
  const { getToken, isSignedIn } = useAuth();
  const isConnected = useNetworkState();

  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    lastPullAt: null,
    lastPushAt: null,
    isOffline: false,
    error: null,
  });

  const engineRef = useRef<SyncEngine | null>(null);
  const dbRef = useRef<SQLite.SQLiteDatabase | null>(null);

  // Initialize sync engine
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const db = await getDatabase();
        if (!mounted) return;

        dbRef.current = db;
        const localDb = new LocalDatabase(db);
        const outbox = new OutboxQueue(db);

        const engine = new SyncEngine({
          database: localDb,
          outbox,
          refreshAuthToken: async () => {
            if (!isSignedIn) return false;
            try {
              const token = await getToken();
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
              setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));
              break;
            case "sync:completed":
              setStatus((prev) => ({
                ...prev,
                isSyncing: false,
                lastPullAt: new Date().toISOString(),
              }));
              break;
            case "sync:offline":
              setStatus((prev) => ({ ...prev, isOffline: true }));
              break;
            case "sync:error":
              setStatus((prev) => ({
                ...prev,
                isSyncing: false,
                error: event.error,
              }));
              break;
            case "sync:pending-count":
              setStatus((prev) => ({ ...prev, pendingCount: event.count }));
              break;
          }
        });

        // Update initial status
        const engineStatus = engine.getStatus();
        setStatus((prev) => ({
          ...prev,
          pendingCount: engineStatus.pendingCount,
          lastPullAt: engineStatus.syncState.lastPullAt,
          lastPushAt: engineStatus.syncState.lastPushAt,
        }));

        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error("Failed to initialize sync:", error);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [getToken, isSignedIn]);

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
