-- ============================================================================
-- Heat V5 Cleanup Migration
-- Remove deprecated columns and indexes from Heat V2/V3/V4
-- ============================================================================
--
-- This migration removes deprecated database fields that were kept for
-- rollback safety during the Heat V2/V3/V4 migrations. Now that the heat
-- and importance systems are stable and working correctly, we can safely
-- remove these unused fields to clean up the schema.
--
-- Removed columns:
-- - star (boolean) → Use star_level (0-3) instead
-- - heat_touch_count (real) → Use heat_adjustment (±45 pts) instead
-- - other_touch_count (integer) → Activity tracking removed
-- - touch_count (integer) → Legacy counter, never used
-- - next_surface_at (timestamp) → Snooze feature removed
-- - cold_storage_at (timestamp) → Auto-archival feature removed
--
-- Removed indexes:
-- - tasks_cold_storage_idx → References removed cold_storage_at
-- - tasks_resurfacing_idx → References removed next_surface_at
-- - tasks_new_task_idx → References removed touch counters
--
-- Safe to run multiple times (idempotent)
-- Migration ID: heat-v5-cleanup
-- Related: toodle-xxxx - Heat V5 cleanup for production
--
-- ⚠️ WARNING: This migration is IRREVERSIBLE - drops columns permanently!
-- Ensure you have a database backup before running this migration.
--
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Heat V5 Cleanup Migration - Starting';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  WARNING: This migration will DROP columns permanently!';
  RAISE NOTICE '⚠️  Ensure you have a database backup before proceeding.';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- PART 1: Drop Deprecated Indexes
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'PART 1: Removing deprecated indexes';
  RAISE NOTICE '----------------------------------------------------------------------';
END $$;

-- Drop cold storage index (cold_storage_at column will be removed)
DROP INDEX IF EXISTS tasks_cold_storage_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'tasks_cold_storage_idx'
  ) THEN
    RAISE NOTICE '✓ Removed tasks_cold_storage_idx';
  ELSE
    RAISE NOTICE '✗ Failed to remove tasks_cold_storage_idx';
  END IF;
END $$;

-- Drop resurfacing index (next_surface_at column will be removed)
DROP INDEX IF EXISTS tasks_resurfacing_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'tasks_resurfacing_idx'
  ) THEN
    RAISE NOTICE '✓ Removed tasks_resurfacing_idx';
  ELSE
    RAISE NOTICE '✗ Failed to remove tasks_resurfacing_idx';
  END IF;
END $$;

-- Drop new task index (heat_touch_count and other_touch_count will be removed)
DROP INDEX IF EXISTS tasks_new_task_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'tasks_new_task_idx'
  ) THEN
    RAISE NOTICE '✓ Removed tasks_new_task_idx';
  ELSE
    RAISE NOTICE '✗ Failed to remove tasks_new_task_idx';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Drop Deprecated Columns
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'PART 2: Removing deprecated columns';
  RAISE NOTICE '----------------------------------------------------------------------';
END $$;

-- Remove star (boolean) - replaced by star_level (0-3)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'star'
  ) THEN
    ALTER TABLE tasks DROP COLUMN star;
    RAISE NOTICE '✓ Removed star column (replaced by star_level)';
  ELSE
    RAISE NOTICE '✓ star column already removed';
  END IF;
END $$;

-- Remove heat_touch_count (real) - replaced by heat_adjustment (±45 pts)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'heat_touch_count'
  ) THEN
    ALTER TABLE tasks DROP COLUMN heat_touch_count;
    RAISE NOTICE '✓ Removed heat_touch_count column (replaced by heat_adjustment)';
  ELSE
    RAISE NOTICE '✓ heat_touch_count column already removed';
  END IF;
END $$;

-- Remove other_touch_count (integer) - activity tracking removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'other_touch_count'
  ) THEN
    ALTER TABLE tasks DROP COLUMN other_touch_count;
    RAISE NOTICE '✓ Removed other_touch_count column (activity tracking removed)';
  ELSE
    RAISE NOTICE '✓ other_touch_count column already removed';
  END IF;
END $$;

-- Remove touch_count (integer) - legacy counter, never used
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'touch_count'
  ) THEN
    ALTER TABLE tasks DROP COLUMN touch_count;
    RAISE NOTICE '✓ Removed touch_count column (legacy, never used)';
  ELSE
    RAISE NOTICE '✓ touch_count column already removed';
  END IF;
END $$;

-- Remove next_surface_at (timestamp) - snooze feature removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'next_surface_at'
  ) THEN
    ALTER TABLE tasks DROP COLUMN next_surface_at;
    RAISE NOTICE '✓ Removed next_surface_at column (snooze feature removed)';
  ELSE
    RAISE NOTICE '✓ next_surface_at column already removed';
  END IF;
END $$;

-- Remove cold_storage_at (timestamp) - auto-archival feature removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'cold_storage_at'
  ) THEN
    ALTER TABLE tasks DROP COLUMN cold_storage_at;
    RAISE NOTICE '✓ Removed cold_storage_at column (auto-archival removed)';
  ELSE
    RAISE NOTICE '✓ cold_storage_at column already removed';
  END IF;
END $$;

-- ============================================================================
-- PART 3: Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Verification';
  RAISE NOTICE '======================================================================';
END $$;

-- Verify all deprecated columns are removed
DO $$
DECLARE
  remaining_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(column_name)
  INTO remaining_columns
  FROM information_schema.columns
  WHERE table_name = 'tasks'
    AND column_name IN (
      'star',
      'heat_touch_count',
      'other_touch_count',
      'touch_count',
      'next_surface_at',
      'cold_storage_at'
    );

  IF remaining_columns IS NOT NULL THEN
    RAISE WARNING '⚠ Some deprecated columns still exist: %', array_to_string(remaining_columns, ', ');
  ELSE
    RAISE NOTICE '✓ All deprecated columns successfully removed';
  END IF;
END $$;

-- Verify all deprecated indexes are removed
DO $$
DECLARE
  remaining_indexes TEXT[];
BEGIN
  SELECT ARRAY_AGG(indexname)
  INTO remaining_indexes
  FROM pg_indexes
  WHERE tablename = 'tasks'
    AND indexname IN (
      'tasks_cold_storage_idx',
      'tasks_resurfacing_idx',
      'tasks_new_task_idx'
    );

  IF remaining_indexes IS NOT NULL THEN
    RAISE WARNING '⚠ Some deprecated indexes still exist: %', array_to_string(remaining_indexes, ', ');
  ELSE
    RAISE NOTICE '✓ All deprecated indexes successfully removed';
  END IF;
END $$;

-- Show remaining task columns (for verification)
DO $$
DECLARE
  column_list TEXT;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
  INTO column_list
  FROM information_schema.columns
  WHERE table_name = 'tasks';

  RAISE NOTICE '';
  RAISE NOTICE 'Remaining columns in tasks table:';
  RAISE NOTICE '  %', column_list;
END $$;

-- ============================================================================
-- PART 4: Final Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '✓ Heat V5 Cleanup Migration Completed Successfully!';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Removed deprecated columns:';
  RAISE NOTICE '  • star (boolean) → Use star_level instead';
  RAISE NOTICE '  • heat_touch_count (real) → Use heat_adjustment instead';
  RAISE NOTICE '  • other_touch_count (integer) → Activity tracking removed';
  RAISE NOTICE '  • touch_count (integer) → Legacy counter removed';
  RAISE NOTICE '  • next_surface_at (timestamp) → Snooze feature removed';
  RAISE NOTICE '  • cold_storage_at (timestamp) → Auto-archival removed';
  RAISE NOTICE '';
  RAISE NOTICE 'Removed deprecated indexes:';
  RAISE NOTICE '  • tasks_cold_storage_idx';
  RAISE NOTICE '  • tasks_resurfacing_idx';
  RAISE NOTICE '  • tasks_new_task_idx';
  RAISE NOTICE '';
  RAISE NOTICE 'Current fields (still in use):';
  RAISE NOTICE '  • star_level (integer 0-3) → Enhanced star system';
  RAISE NOTICE '  • heat_adjustment (real ±45) → Direct heat adjustment';
  RAISE NOTICE '  • heat (real 0-145) → Cached heat score';
  RAISE NOTICE '  • heat_calculated_at (timestamp) → Staleness tracking';
  RAISE NOTICE '  • last_touched_at (timestamp) → Recency calculation';
  RAISE NOTICE '  • last_heat_touched_at (timestamp) → Decay calculation';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Update application schema files (schema.ts)';
  RAISE NOTICE '  2. Archive legacy heat-v2.ts to lib/scoring/archive/';
  RAISE NOTICE '  3. Test application functionality';
  RAISE NOTICE '  4. Monitor production logs for errors';
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
END $$;
