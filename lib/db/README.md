# Toodle Database Layer

This directory contains the database abstraction layer (DAL) for Toodle, built with Drizzle ORM and PostgreSQL.

## Architecture

### Repository Pattern
All database operations are abstracted behind repository interfaces:
- `ITaskRepository` - Task CRUD and domain operations
- `IProjectRepository` - Project management
- `ISettingsRepository` - User preferences (single row)
- `INotesRepository` - Per-task versioned notes

### Directory Structure
```
lib/db/
├── drizzle.config.ts      # PostgreSQL Drizzle Kit configuration
├── schema.ts              # PostgreSQL Drizzle schema definitions
├── client.ts              # Database connection singleton
├── seed.ts                # Database seeding script
├── repositories/
│   ├── interfaces.ts      # Repository interfaces
│   ├── task-repository.ts # Task repository implementation
│   ├── project-repository.ts
│   ├── settings-repository.ts
│   ├── notes-repository.ts
│   └── index.ts           # Repository factory
├── migrations/
│   ├── 0000_init_postgresql.sql  # Consolidated PostgreSQL migration
│   └── README.md          # Migration documentation
├── scripts/               # Database utility scripts
│   ├── test-postgres-connection.js
│   ├── create-postgres-database.js
│   ├── apply-postgres-migration.js
│   └── verify-postgres-schema.js
└── sqlite/                # Legacy SQLite files (reference only)
    ├── schema.ts          # Old SQLite schema
    ├── drizzle.config.ts  # Old SQLite config
    └── *.sql.sqlite       # Old SQLite migrations
```

## Database Scripts

### PostgreSQL Setup & Migration
```bash
# Test PostgreSQL connection
npm run pg:test

# Create the database (one-time setup)
npm run pg:create

# Apply the schema migration
npm run pg:migrate

# Verify schema structure
npm run pg:verify

# Import data from SQLite to PostgreSQL
npm run pg:import
```

Or using node directly:
```bash
node lib/db/scripts/test-postgres-connection.js
node lib/db/scripts/create-postgres-database.js
node lib/db/scripts/apply-postgres-migration.js
node lib/db/scripts/verify-postgres-schema.js
node lib/db/scripts/migrate-sqlite-to-postgres.js
```

### Drizzle Commands
```bash
# Generate migration from schema changes
npm run db:generate

# Push schema directly (dev only)
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio

# Seed database with initial data
npm run db:seed
```

### Environment Variables
Add to `.env.local`:
```bash
# Database type: sqlite | postgres
DATABASE_TYPE=sqlite

# Primary database connection (used based on DATABASE_TYPE)
DATABASE_URL=./data/toodle.db

# SQLite database path (optional, falls back to DATABASE_URL)
SQLLITE_DATABASE_URL=./data/toodle.db

# Production database (optional, for reference)
PROD_DATABASE_URL=postgresql://USER:PASSWORD@supabase.com:6543/postgres
```

**To switch from SQLite to PostgreSQL:**
1. Set `DATABASE_TYPE=postgres` in `.env.local`
2. Set `DATABASE_URL` to your PostgreSQL connection string
3. Run `npm run pg:test` to verify connection
4. Run `npm run pg:create` to create the database (local only)
5. Run `npm run pg:migrate` to apply schema
6. Run `npm run pg:import` to migrate data from SQLite
7. Restart your development server

**To use Supabase:**
1. Set `DATABASE_TYPE=postgres` in `.env.local`
2. Set `DATABASE_URL` to your Supabase connection string
3. Run `npm run supabase:setup` to create schema
4. Run `npm run supabase:import` to import data (optional)
5. Restart your development server
6. See [SUPABASE_SETUP.md](../../SUPABASE_SETUP.md) for details

## Usage Example

```typescript
import { createTaskRepository } from "@/lib/db/repositories";

const taskRepo = createTaskRepository();

// Create a task
const task = await taskRepo.create({
  title: "Buy groceries",
  priority: "high",
  bucket: "todo",
  star: false,
});

// Find all todo tasks
const todoTasks = await taskRepo.findByBucket("todo");

// Touch a task (increase heat)
const hotTask = await taskRepo.touch(task.id);

// Snooze a task
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
await taskRepo.snooze(task.id, tomorrow);
```

## Schema Overview

### Tasks Table
Core fields:
- `title`, `priority`, `star`, `dueAt`, `bucket`
- `heat`, `touchCount`, `lastTouchedAt`, `nextSurfaceAt`
- `importanceV1` (calculated score 2-12)
- `completedAt`, `archivedAt`, `deletedAt` (soft delete)

### Projects Table
- `name`, `colorHex`, `archived`

### Settings Table
Single row with user preferences:
- Default task values (priority, bucket, due date)
- Heat calculation parameters
- Automation thresholds
- Snooze presets

## PostgreSQL Features

This application uses PostgreSQL with the following features:

1. **SERIAL primary keys** - Auto-incrementing integer IDs
2. **BOOLEAN types** - Native boolean columns for flags
3. **TIMESTAMP WITH TIME ZONE** - UTC timestamp storage
4. **TEXT with CHECK constraints** - Type-safe enums (priority, bucket, etc.)
5. **Automatic triggers** - Updates `updated_at` timestamp on row changes
6. **CASCADE deletes** - Foreign key constraints with automatic cleanup

## Legacy SQLite Files

The `sqlite/` directory contains the original SQLite schema and migrations for reference only. These files are **not used** in the current PostgreSQL implementation but are preserved for historical context.

## Type Safety

All types are automatically inferred from the Drizzle schema:
```typescript
import type { Task, NewTask, Project, Settings } from "@/lib/db/schema";
```

Enums are defined in `types/index.ts` for consistency across the app.
