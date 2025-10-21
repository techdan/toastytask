# Toodle Database Layer

This directory contains the database abstraction layer (DAL) for Toodle, built with Drizzle ORM and designed for easy database swapping (SQLite → PostgreSQL).

## Architecture

### Repository Pattern
All database operations are abstracted behind repository interfaces:
- `ITaskRepository` - Task CRUD and domain operations
- `IProjectRepository` - Project management
- `ISettingsRepository` - User preferences (single row)

### Directory Structure
```
lib/db/
├── drizzle.config.ts      # Drizzle Kit configuration
├── schema.ts              # Drizzle schema definitions
├── client.ts              # Database connection singleton
├── seed.ts                # Database seeding script
├── repositories/
│   ├── interfaces.ts      # Repository interfaces
│   ├── task-repository.ts # SQLite task implementation
│   ├── project-repository.ts
│   ├── settings-repository.ts
│   └── index.ts           # Repository factory
└── migrations/            # Generated SQL migrations
```

## Database Scripts

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Push schema directly (dev only)
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio

# Seed database with initial data
npm run db:seed
```

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

## Future: PostgreSQL Migration

The repository pattern allows zero-code-change database swapping:

1. Install PostgreSQL adapter: `npm install drizzle-orm/postgres-js postgres`
2. Create `PostgresTaskRepository` implementing `ITaskRepository`
3. Update `lib/db/drizzle.config.ts` dialect to `postgres`
4. Update `.env.local` with `DATABASE_TYPE=postgres`
5. Run migration script to transfer data

The factory functions in `repositories/index.ts` will automatically return the correct implementation based on `DATABASE_TYPE`.

## Type Safety

All types are automatically inferred from the Drizzle schema:
```typescript
import type { Task, NewTask, Project, Settings } from "@/lib/db/schema";
```

Enums are defined in `types/index.ts` for consistency across the app.
