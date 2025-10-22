# PostgreSQL Migrations

This directory contains the SQL migration files for the Toodle PostgreSQL database.

## Migration History

### 0000_init_postgresql.sql
**Status**: ✓ Applied
**Date**: 2025-10-22
**Description**: Initial PostgreSQL schema migration

Creates all core tables:
- `projects` - Project management
- `tasks` - Task tracking with heat model and importance scoring
- `settings` - User preferences (single row)
- `note_rows` - Per-task versioned notes
- `note_row_versions` - Note version history

Includes:
- Primary keys with SERIAL auto-increment
- Foreign key constraints with CASCADE delete
- Timestamp columns with UTC timezone
- CHECK constraints for enum-like fields
- Automatic `updated_at` triggers for all tables

### 0001_add_task_indexes.sql
**Status**: ✓ Applied
**Date**: 2025-10-22
**Description**: Additional task table indexes for query optimization

Adds three performance indexes:
- `tasks_due_at_idx` - For sorting by due date
- `tasks_completed_at_idx` - For filtering completed tasks
- `tasks_active_importance_idx` - For sorting active tasks by importance

## Migration Status

All migrations have been successfully applied to the PostgreSQL database.

| Migration | Status | Tables | Indexes | Triggers |
|-----------|--------|--------|---------|----------|
| 0000_init_postgresql | ✓ Applied | 5 | 3 | 4 |
| 0001_add_task_indexes | ✓ Applied | - | 3 | - |

## How to Apply Migrations

### Automated (Recommended)
```bash
# Complete setup from scratch
npm run pg:test      # Test connection
npm run pg:create    # Create database
npm run pg:migrate   # Apply schema
npm run pg:import    # Import data from SQLite
npm run pg:verify    # Verify schema
```

### Manual
```bash
# Apply individual migration files
psql -U postgres -d toodle -f lib/db/migrations/0000_init_postgresql.sql
psql -U postgres -d toodle -f lib/db/migrations/0001_add_task_indexes.sql
```

## Database Schema Summary

### Tables
- **projects** (5 columns) - Project metadata
- **tasks** (18 columns) - Core task data with 6 indexes
- **settings** (22 columns) - Application settings
- **note_rows** (6 columns) - Note row metadata
- **note_row_versions** (4 columns) - Note version history

### Indexes
1. Primary key indexes (auto-generated)
2. Foreign key indexes
3. Performance indexes:
   - tasks_project_id_deleted_at_idx
   - tasks_bucket_heat_idx
   - tasks_due_at_idx (new)
   - tasks_completed_at_idx (new)
   - tasks_active_importance_idx (new)
   - note_rows_task_id_ordinal_idx

### Triggers
All tables have automatic `updated_at` timestamp triggers that fire BEFORE UPDATE.

## Migration Validation

The following tests have been performed:

✓ Schema integrity - All tables and columns created correctly
✓ Data migration - All SQLite data migrated successfully (10 tasks, 3 projects, 21 note versions)
✓ Read operations - SELECT queries working correctly
✓ Write operations - INSERT queries working correctly
✓ Update operations - UPDATE queries and triggers working
✓ Delete operations - DELETE queries and cascades working
✓ Relationships - JOIN queries across tables working
✓ Indexes - All indexes created and utilized
✓ Timestamps - UTC timestamp handling working
✓ Application build - Next.js app compiles successfully with PostgreSQL

## Next Steps

The database is now fully migrated to PostgreSQL and ready for production use.

To use PostgreSQL in your application:
1. Set `DATABASE_TYPE=postgres` in `.env.local`
2. Restart your development server
3. Verify the application works correctly

## Rollback (if needed)

To switch back to SQLite:
1. Set `DATABASE_TYPE=sqlite` in `.env.local`
2. Restart your development server

Note: The SQLite data remains intact in `data/toodle.db` and can be used at any time
