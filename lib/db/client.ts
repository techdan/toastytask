import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";

// Database connection singleton
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  // Get database path from environment or use default
  const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), "data", "toodle.db");

  // Create SQLite connection
  const sqlite = new Database(dbPath);

  // Enable foreign keys
  sqlite.pragma("foreign_keys = ON");

  // Create Drizzle instance
  dbInstance = drizzle(sqlite, { schema });

  return dbInstance;
}

// Export type for use in repositories
export type Database = ReturnType<typeof getDatabase>;
