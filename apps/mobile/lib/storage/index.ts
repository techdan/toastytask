/**
 * Local storage module for offline-first data persistence
 */

export { getDatabase, LocalDatabase } from "./database";
export { DatabaseProvider, useDatabaseContext } from "./DatabaseContext";
export { runMigrations, migrations } from "./schema";
export type { Migration } from "./schema";
