import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase, LocalDatabase } from "./database";
import { OutboxQueue } from "../sync/outbox";

interface DatabaseContextValue {
  db: SQLiteDatabase | null;
  database: LocalDatabase | null;
  outbox: OutboxQueue | null;
  isReady: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  db: null,
  database: null,
  outbox: null,
  isReady: false,
  error: null,
});

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [outbox, setOutbox] = useState<OutboxQueue | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function initDatabase() {
      try {
        const sqliteDb = await getDatabase();
        const localDb = new LocalDatabase(sqliteDb);
        const outboxQueue = new OutboxQueue(sqliteDb);

        setDb(sqliteDb);
        setDatabase(localDb);
        setOutbox(outboxQueue);
        setIsReady(true);
      } catch (err) {
        console.error("Failed to initialize database:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }

    initDatabase();
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({ db, database, outbox, isReady, error }),
    [db, database, outbox, isReady, error]
  );

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabaseContext(): DatabaseContextValue {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error("useDatabaseContext must be used within a DatabaseProvider");
  }
  return context;
}
