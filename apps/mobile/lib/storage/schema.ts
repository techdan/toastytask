import * as SQLite from "expo-sqlite";

export interface Migration {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          project_id INTEGER,
          user_id TEXT,
          priority TEXT NOT NULL DEFAULT 'medium',
          bucket TEXT NOT NULL DEFAULT 'todo',
          star_level INTEGER NOT NULL DEFAULT 0,
          star_intent_version INTEGER NOT NULL DEFAULT 0,
          due_at TEXT,
          repeat_type TEXT NOT NULL DEFAULT 'none',
          repeat_rule TEXT,
          heat REAL NOT NULL DEFAULT 0,
          heat_calculated_at TEXT,
          heat_adjustment REAL NOT NULL DEFAULT 0,
          last_heat_touched_at TEXT,
          last_touched_at TEXT,
          touch_count INTEGER NOT NULL DEFAULT 0,
          importance_v1 INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          archived_at TEXT,
          deleted_at TEXT,
          is_focused INTEGER NOT NULL DEFAULT 0,
          focus_snooze_until TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          -- Sync metadata
          sync_status TEXT NOT NULL DEFAULT 'synced',
          local_updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          color_hex TEXT NOT NULL DEFAULT '#6b7280',
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          user_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          sync_status TEXT NOT NULL DEFAULT 'synced',
          local_updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY,
          task_id INTEGER NOT NULL,
          ordinal INTEGER NOT NULL,
          current_text TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          user_id TEXT,
          default_priority TEXT NOT NULL DEFAULT 'medium',
          default_bucket TEXT NOT NULL DEFAULT 'todo',
          default_due_date TEXT NOT NULL DEFAULT 'today',
          grouping_mode TEXT NOT NULL DEFAULT 'ungrouped',
          sort_mode TEXT NOT NULL DEFAULT 'heat',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          idempotency_key TEXT NOT NULL UNIQUE,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          body TEXT,
          client_id TEXT,
          state TEXT NOT NULL DEFAULT 'pending',
          error_code TEXT,
          error_message TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          last_attempt_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_state (
          id INTEGER PRIMARY KEY DEFAULT 1,
          pull_cursor TEXT NOT NULL DEFAULT '',
          last_pull_at TEXT,
          last_push_at TEXT
        );

        -- Initialize sync_state if empty
        INSERT OR IGNORE INTO sync_state (id, pull_cursor) VALUES (1, '');

        -- Indexes
        CREATE INDEX IF NOT EXISTS tasks_bucket_heat ON tasks(bucket, heat);
        CREATE INDEX IF NOT EXISTS tasks_sync_status ON tasks(sync_status);
        CREATE INDEX IF NOT EXISTS tasks_user_id ON tasks(user_id);
        CREATE INDEX IF NOT EXISTS projects_user_id ON projects(user_id);
        CREATE INDEX IF NOT EXISTS notes_task_id ON notes(task_id, ordinal);
        CREATE INDEX IF NOT EXISTS outbox_state ON outbox(state);
      `);
    },
  },
  {
    version: 2,
    up: (db) => {
      // Add soft-delete support to notes
      db.execSync(`ALTER TABLE notes ADD COLUMN deleted_at TEXT;`);
    },
  },
];

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Ensure schema_version table exists
  db.execSync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  // Get current version
  const result = db.getFirstSync<{ version: number }>(
    "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
  );
  const currentVersion = result?.version ?? 0;

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration ${migration.version}...`);
      migration.up(db);
      db.runSync("INSERT INTO schema_version (version) VALUES (?)", [
        migration.version,
      ]);
    }
  }

  console.log(`Database at version ${migrations[migrations.length - 1]?.version ?? 0}`);
}
