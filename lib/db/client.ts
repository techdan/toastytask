import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Database connection singleton
let dbInstance: ReturnType<typeof drizzlePostgres<typeof schema>> | null = null;
let pgPool: Pool | null = null;

export function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  // PostgreSQL connection - use DATABASE_URL as primary connection string
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
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


  // Create Drizzle instance with PostgreSQL
  dbInstance = drizzlePostgres(pgPool, { schema });

  console.log(`✓ Connected to PostgreSQL database (${isProduction ? "production" : "development"} mode)`);

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
