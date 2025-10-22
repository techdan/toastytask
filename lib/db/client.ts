import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import Database from "better-sqlite3";
import { Pool } from "pg";
import * as schema from "./schema";
import path from "path";

// Database connection singleton
let dbInstance: ReturnType<typeof drizzleSqlite<typeof schema>> | ReturnType<typeof drizzlePostgres<typeof schema>> | null = null;
let pgPool: Pool | null = null;

export function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseType = process.env.DATABASE_TYPE || "sqlite";

  if (databaseType === "postgres") {
    // PostgreSQL connection - use DATABASE_URL as primary connection string
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required when DATABASE_TYPE=postgres");
    }

    // Determine if we're in production
    const isProduction = process.env.NODE_ENV === "production";

    // Create PostgreSQL connection pool with production-ready settings
    pgPool = new Pool({
      connectionString,
      // Pool configuration
      max: isProduction ? 20 : 10, // More connections in production
      min: isProduction ? 2 : 0, // Keep minimum connections alive in production
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      // SSL configuration for production
      ssl: isProduction && !connectionString.includes("localhost")
        ? { rejectUnauthorized: false } // Enable SSL for production remote databases
        : false,
    });

    // Error handling for pool
    pgPool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client:", err);
    });

    // Connection event logging (development only)
    if (!isProduction) {
      pgPool.on("connect", () => {
        console.log("New PostgreSQL client connected to pool");
      });
      pgPool.on("remove", () => {
        console.log("PostgreSQL client removed from pool");
      });
    }

    // Create Drizzle instance with PostgreSQL
    dbInstance = drizzlePostgres(pgPool, { schema });

    console.log(`✓ Connected to PostgreSQL database (${isProduction ? "production" : "development"} mode)`);
  } else {
    // SQLite connection (default)
    const dbPath = process.env.SQLLITE_DATABASE_URL || process.env.DATABASE_URL || path.join(process.cwd(), "data", "toodle.db");

    // Create SQLite connection
    const sqlite = new Database(dbPath);

    // Enable foreign keys
    sqlite.pragma("foreign_keys = ON");

    // Create Drizzle instance with SQLite
    dbInstance = drizzleSqlite(sqlite, { schema });

    console.log("✓ Connected to SQLite database");
  }

  return dbInstance;
}

// Graceful shutdown helper
export async function closeDatabaseConnection() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  dbInstance = null;
}

// Export type for use in repositories
export type Database = ReturnType<typeof getDatabase>;
