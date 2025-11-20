-- Migration: Cleanup Deprecated Heat & Importance Columns
-- Date: 2025-01-19
-- Description: Remove deprecated columns and indexes from Heat V2 and legacy systems
--
-- IMPORTANT: Back up your database before running this migration!
-- Run: pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
--
-- See: docs/heat-cleanup-plan.md for full context

-- ============================================================================
-- STEP 1: Drop Deprecated Indexes
-- ============================================================================

-- Drop index for cold storage queries (feature removed)
DROP INDEX IF EXISTS tasks_cold_storage_idx;

-- Drop index for resurfacing/snooze queries (feature removed)
DROP INDEX IF EXISTS tasks_resurfacing_idx;

-- Drop index for new task queries (V2 counters removed)
DROP INDEX IF EXISTS tasks_new_task_idx;

-- ============================================================================
-- STEP 2: Recreate Heat Sort Index (remove reference to coldStorageAt)
-- ============================================================================

-- Drop existing index that references coldStorageAt column
DROP INDEX IF EXISTS tasks_heat_sort_idx;

-- Recreate without coldStorageAt column reference
CREATE INDEX tasks_heat_sort_idx ON tasks(heat, completed_at);

-- ============================================================================
-- STEP 3: Drop Deprecated Columns from Tasks Table
-- ============================================================================

-- Drop V2 boolean star field (replaced by starLevel)
ALTER TABLE tasks DROP COLUMN IF EXISTS star;

-- Drop cold storage timestamp (auto-archival feature removed)
ALTER TABLE tasks DROP COLUMN IF EXISTS cold_storage_at;

-- Drop snooze/resurface timestamp (snooze feature removed)
ALTER TABLE tasks DROP COLUMN IF EXISTS next_surface_at;

-- Drop V2 heat touch counter (replaced by heatAdjustment in V3)
ALTER TABLE tasks DROP COLUMN IF EXISTS heat_touch_count;

-- Drop V2 activity counter (activity tracking removed in V3)
ALTER TABLE tasks DROP COLUMN IF EXISTS other_touch_count;

-- ============================================================================
-- STEP 4: Drop Snooze Settings from Settings Table
-- ============================================================================

-- Drop snooze preset columns (snooze feature removed)
ALTER TABLE settings DROP COLUMN IF EXISTS snooze_todo_days;
ALTER TABLE settings DROP COLUMN IF EXISTS snooze_watch_days;
ALTER TABLE settings DROP COLUMN IF EXISTS snooze_later_days;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify columns are removed from tasks table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'tasks'
  AND column_name IN ('star', 'cold_storage_at', 'next_surface_at', 'heat_touch_count', 'other_touch_count')
ORDER BY column_name;
-- Expected: No rows (all columns should be gone)

-- Verify columns are removed from settings table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'settings'
  AND column_name IN ('snooze_todo_days', 'snooze_watch_days', 'snooze_later_days')
ORDER BY column_name;
-- Expected: No rows (all columns should be gone)

-- Verify indexes are removed/updated
SELECT indexname
FROM pg_indexes
WHERE tablename = 'tasks'
  AND indexname IN ('tasks_cold_storage_idx', 'tasks_resurfacing_idx', 'tasks_new_task_idx')
ORDER BY indexname;
-- Expected: No rows (all indexes should be gone)

-- Verify heat_sort_idx exists and has correct definition
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'tasks'
  AND indexname = 'tasks_heat_sort_idx';
-- Expected: 1 row with definition that doesn't reference cold_storage_at

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================
--
-- If you need to rollback, restore from backup:
-- psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
--
-- Or manually recreate columns (data will be lost):
/*
ALTER TABLE tasks ADD COLUMN star boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN cold_storage_at timestamp with time zone;
ALTER TABLE tasks ADD COLUMN next_surface_at timestamp with time zone;
ALTER TABLE tasks ADD COLUMN heat_touch_count real NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN other_touch_count integer NOT NULL DEFAULT 0;

ALTER TABLE settings ADD COLUMN snooze_todo_days integer NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN snooze_watch_days integer NOT NULL DEFAULT 7;
ALTER TABLE settings ADD COLUMN snooze_later_days integer NOT NULL DEFAULT 30;

CREATE INDEX tasks_cold_storage_idx ON tasks(cold_storage_at, last_touched_at);
CREATE INDEX tasks_resurfacing_idx ON tasks(next_surface_at);
CREATE INDEX tasks_new_task_idx ON tasks(heat_touch_count, other_touch_count, completed_at);

DROP INDEX IF EXISTS tasks_heat_sort_idx;
CREATE INDEX tasks_heat_sort_idx ON tasks(heat, completed_at, cold_storage_at);
*/

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- Columns NOT removed (despite "DEPRECATED" comments):
-- - heat: Still used for database sorting and storage
-- - heatCalculatedAt: Still written on heat updates
-- - touchCount: Still incremented on touch operations
-- - importanceV1: Still calculated and stored
--
-- These columns have misleading "DEPRECATED" comments in the schema that
-- should be addressed separately. See docs/heat-cleanup-plan.md for details.
--
