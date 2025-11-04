-- ============================================================================
-- Heat Model Production Migration
-- Consolidated migration to bring production from V1 to V4
-- ============================================================================
--
-- This migration consolidates Heat V2, V3, and V4 migrations into a single
-- script for deploying the complete heat system to production.
--
-- Changes:
-- - Heat V2: Add heat tracking columns, indexes, and sort mode
-- - Heat V3: Add star levels (0-3) and direct heat adjustment
-- - Heat V4: Normalize heat scale from 0-1 to 0-145 points
--
-- Safe to run multiple times (idempotent)
-- Migration ID: heat-production-migration
-- Epic: toodle-91bf - Consolidate heat migrations for production
--
-- ============================================================================
-- PART 1: Heat V2 - Data Model and Indexes
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Heat Production Migration - Starting';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'PART 1: Heat V2 - Data Model and Indexes';
  RAISE NOTICE '----------------------------------------------------------------------';
END $$;

-- Add sort_mode column to settings table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'sort_mode'
  ) THEN
    ALTER TABLE settings ADD COLUMN sort_mode TEXT NOT NULL DEFAULT 'importance';
    ALTER TABLE settings ADD CONSTRAINT settings_sort_mode_check
      CHECK (sort_mode IN ('importance', 'heat'));
    RAISE NOTICE '✓ Added sort_mode column to settings table';
  ELSE
    RAISE NOTICE '✓ sort_mode column already exists in settings table';
  END IF;
END $$;

-- Update heat default from 0.0 to 0.5
DO $$
BEGIN
  ALTER TABLE tasks ALTER COLUMN heat SET DEFAULT 0.5;
  RAISE NOTICE '✓ Updated heat default to 0.5';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '✓ Heat default already set or column missing';
END $$;

-- Add heat_calculated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'heat_calculated_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN heat_calculated_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE '✓ Added heat_calculated_at column';
  ELSE
    RAISE NOTICE '✓ heat_calculated_at column already exists';
  END IF;
END $$;

-- Add heat_touch_count column (REAL type for fractional values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'heat_touch_count'
  ) THEN
    ALTER TABLE tasks ADD COLUMN heat_touch_count REAL NOT NULL DEFAULT 0;
    COMMENT ON COLUMN tasks.heat_touch_count IS 'Heat v2: Number of heat touches (🔥 icon clicks). Can be fractional due to decay-on-touch mechanism.';
    RAISE NOTICE '✓ Added heat_touch_count column (REAL type)';
  ELSE
    -- Fix existing column if it's the wrong type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'heat_touch_count'
      AND data_type = 'integer'
    ) THEN
      ALTER TABLE tasks ALTER COLUMN heat_touch_count TYPE REAL USING heat_touch_count::REAL;
      COMMENT ON COLUMN tasks.heat_touch_count IS 'Heat v2: Number of heat touches (🔥 icon clicks). Can be fractional due to decay-on-touch mechanism.';
      RAISE NOTICE '✓ Fixed heat_touch_count column type from INTEGER to REAL';
    ELSE
      RAISE NOTICE '✓ heat_touch_count column already exists with correct type';
    END IF;
  END IF;
END $$;

-- Add other_touch_count column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'other_touch_count'
  ) THEN
    ALTER TABLE tasks ADD COLUMN other_touch_count INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE '✓ Added other_touch_count column';
  ELSE
    RAISE NOTICE '✓ other_touch_count column already exists';
  END IF;
END $$;

-- Add last_heat_touched_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'last_heat_touched_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN last_heat_touched_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE '✓ Added last_heat_touched_at column';
  ELSE
    RAISE NOTICE '✓ last_heat_touched_at column already exists';
  END IF;
END $$;

-- Add cold_storage_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'cold_storage_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN cold_storage_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE '✓ Added cold_storage_at column';
  ELSE
    RAISE NOTICE '✓ cold_storage_at column already exists';
  END IF;
END $$;

-- Mark existing tasks as touched (prevents them from appearing as "new")
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE tasks
  SET other_touch_count = 1
  WHERE heat_touch_count = 0
    AND other_touch_count = 0
    AND deleted_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    RAISE NOTICE '✓ Marked % existing tasks as touched (other_touch_count = 1)', updated_count;
  ELSE
    RAISE NOTICE '✓ No existing tasks needed to be marked as touched';
  END IF;
END $$;

-- Create Heat V2 indexes
CREATE INDEX IF NOT EXISTS tasks_heat_sort_idx
  ON tasks(heat, completed_at, cold_storage_at);

CREATE INDEX IF NOT EXISTS tasks_cold_storage_idx
  ON tasks(cold_storage_at, last_touched_at);

CREATE INDEX IF NOT EXISTS tasks_resurfacing_idx
  ON tasks(next_surface_at);

CREATE INDEX IF NOT EXISTS tasks_new_task_idx
  ON tasks(heat_touch_count, other_touch_count, completed_at);

DO $$
BEGIN
  RAISE NOTICE '✓ Created Heat V2 indexes';
END $$;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'PART 2: Heat V3 - Star Levels and Direct Adjustment';
  RAISE NOTICE '----------------------------------------------------------------------';
END $$;

-- ============================================================================
-- PART 2: Heat V3 - Star Levels and Direct Adjustment
-- ============================================================================

-- Add star_level column (0=none, 1=blue, 2=yellow, 3=orange)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'star_level'
  ) THEN
    ALTER TABLE tasks ADD COLUMN star_level INTEGER NOT NULL DEFAULT 0;
    COMMENT ON COLUMN tasks.star_level IS 'Heat v3: Star level (0=none, 1=blue, 2=yellow, 3=orange). Provides +0/+1/+2/+3 to base importance.';
    RAISE NOTICE '✓ Added star_level column';
  ELSE
    RAISE NOTICE '✓ star_level column already exists';
  END IF;
END $$;

-- Migrate existing star boolean to star_level
-- star = true → star_level = 2 (yellow)
-- star = false → star_level = 0 (none)
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  UPDATE tasks
  SET star_level = 2
  WHERE star = true
    AND star_level = 0;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;

  IF migrated_count > 0 THEN
    RAISE NOTICE '✓ Migrated % starred tasks to star_level = 2 (yellow)', migrated_count;
  ELSE
    RAISE NOTICE '✓ No tasks needed star migration';
  END IF;
END $$;

-- Add heat_adjustment column (-0.45 to +0.45 range, will be scaled to ±45 in V4)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'heat_adjustment'
  ) THEN
    ALTER TABLE tasks ADD COLUMN heat_adjustment REAL NOT NULL DEFAULT 0;
    COMMENT ON COLUMN tasks.heat_adjustment IS 'Heat v3: Direct heat adjustment (-0.45 to +0.45). Replaces heat_touch_count click counting.';
    RAISE NOTICE '✓ Added heat_adjustment column';
  ELSE
    RAISE NOTICE '✓ heat_adjustment column already exists';
  END IF;
END $$;

-- Migrate existing heat_touch_count to heat_adjustment
-- Formula: heat_adjustment = (heat_touch_count / 20) * 0.45
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  UPDATE tasks
  SET heat_adjustment = (heat_touch_count / 20.0) * 0.45
  WHERE heat_touch_count != 0
    AND heat_adjustment = 0;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;

  IF migrated_count > 0 THEN
    RAISE NOTICE '✓ Migrated heat_touch_count to heat_adjustment for % tasks', migrated_count;
  ELSE
    RAISE NOTICE '✓ No tasks needed heat_touch_count migration';
  END IF;
END $$;

-- Add check constraint for star_level (0-3 range)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'tasks_star_level_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_star_level_check
      CHECK (star_level >= 0 AND star_level <= 3);
    RAISE NOTICE '✓ Added star_level check constraint';
  ELSE
    RAISE NOTICE '✓ star_level check constraint already exists';
  END IF;
END $$;

-- Add check constraint for heat_adjustment (will be updated to ±45 in V4)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'tasks_heat_adjustment_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_heat_adjustment_check
      CHECK (heat_adjustment >= -0.45 AND heat_adjustment <= 0.45);
    RAISE NOTICE '✓ Added heat_adjustment check constraint (±0.45)';
  ELSE
    RAISE NOTICE '✓ heat_adjustment check constraint already exists';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'PART 3: Heat V4 - Normalize to Point Scale (0-145)';
  RAISE NOTICE '----------------------------------------------------------------------';
END $$;

-- ============================================================================
-- PART 3: Heat V4 - Normalize Heat to Point Scale
-- ============================================================================

DO $$
DECLARE
  max_heat REAL;
  min_heat REAL;
  avg_heat REAL;
  task_count INTEGER;
BEGIN
  -- Get current heat statistics
  SELECT
    MAX(heat),
    MIN(heat),
    AVG(heat),
    COUNT(*)
  INTO max_heat, min_heat, avg_heat, task_count
  FROM tasks
  WHERE deleted_at IS NULL AND heat IS NOT NULL;

  RAISE NOTICE 'Pre-V4 heat stats:';
  RAISE NOTICE '  Tasks: %, Range: % to %, Average: %', task_count, min_heat, max_heat, avg_heat;

  -- Check if already migrated (heat values > 1.0 indicate v4 scale)
  IF max_heat > 1.0 THEN
    RAISE NOTICE '  ⚠ Heat values already in V4 scale (max > 1.0), skipping normalization';
  END IF;
END $$;

-- Normalize heat values from 0-1 to 0-145
DO $$
DECLARE
  updated_count INTEGER;
  max_heat REAL;
BEGIN
  SELECT MAX(heat)
  INTO max_heat
  FROM tasks
  WHERE deleted_at IS NULL AND heat IS NOT NULL;

  -- Only migrate if heat values are in old scale (0-1)
  IF max_heat <= 1.0 THEN
    UPDATE tasks
    SET heat = heat * 145
    WHERE heat IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RAISE NOTICE '✓ Normalized heat values for % tasks (x145)', updated_count;
  ELSE
    RAISE NOTICE '✓ Heat values already in V4 scale - no normalization needed';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'PART 4: Heat V4 - Scale Adjustment to Points (±45)';
  RAISE NOTICE '----------------------------------------------------------------------';
END $$;

-- ============================================================================
-- PART 4: Heat V4 - Scale Adjustment to Point Scale
-- ============================================================================

-- Scale heat_adjustment from ±0.45 to ±45
DO $$
DECLARE
  max_abs_adjustment REAL;
  updated_count INTEGER;
BEGIN
  SELECT MAX(ABS(heat_adjustment))
  INTO max_abs_adjustment
  FROM tasks
  WHERE deleted_at IS NULL;

  IF max_abs_adjustment IS NOT NULL AND max_abs_adjustment <= 0.45 THEN
    UPDATE tasks
    SET heat_adjustment = heat_adjustment * 100
    WHERE deleted_at IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '✓ Scaled heat_adjustment values for % tasks (x100)', updated_count;
  ELSE
    RAISE NOTICE '✓ Heat adjustments already in point scale (max abs > 0.45), skipping scaling';
  END IF;
END $$;

-- Update constraint to allow ±45 range
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_adjustment_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_heat_adjustment_check
  CHECK (heat_adjustment >= -45 AND heat_adjustment <= 45);

-- Add constraint for heat range
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_heat_check
  CHECK (heat >= 0 AND heat <= 145);

-- Update column comment
COMMENT ON COLUMN tasks.heat_adjustment IS 'Heat v4: Direct heat adjustment in points (-45 to +45).';

DO $$
BEGIN
  RAISE NOTICE '✓ Updated heat_adjustment constraint to ±45';
  RAISE NOTICE '✓ Added heat constraint (0-145)';
  RAISE NOTICE '✓ Updated heat_adjustment column comment';
END $$;

-- ============================================================================
-- PART 5: Verification and Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Verification';
  RAISE NOTICE '======================================================================';
END $$;

-- Verify all columns exist
DO $$
DECLARE
  missing_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(column_name)
  INTO missing_columns
  FROM (VALUES
    ('heat_calculated_at'),
    ('heat_touch_count'),
    ('other_touch_count'),
    ('last_heat_touched_at'),
    ('cold_storage_at'),
    ('star_level'),
    ('heat_adjustment')
  ) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_name = 'tasks'
    AND c.column_name = required.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE WARNING '⚠ Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE '✓ All required columns exist';
  END IF;
END $$;

-- Verify data migration
DO $$
DECLARE
  max_heat REAL;
  min_heat REAL;
  avg_heat REAL;
  max_adjustment REAL;
  min_adjustment REAL;
  task_count INTEGER;
  out_of_range_heat INTEGER;
  out_of_range_adjustment INTEGER;
BEGIN
  -- Heat statistics
  SELECT
    MAX(heat),
    MIN(heat),
    AVG(heat),
    COUNT(*)
  INTO max_heat, min_heat, avg_heat, task_count
  FROM tasks
  WHERE deleted_at IS NULL AND heat IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE 'Post-migration heat stats:';
  RAISE NOTICE '  Tasks: %', task_count;
  RAISE NOTICE '  Heat range: % to %', min_heat, max_heat;
  RAISE NOTICE '  Average heat: %', avg_heat;

  -- Adjustment statistics
  SELECT
    MAX(heat_adjustment),
    MIN(heat_adjustment)
  INTO max_adjustment, min_adjustment
  FROM tasks
  WHERE deleted_at IS NULL;

  RAISE NOTICE '  Adjustment range: % to %', min_adjustment, max_adjustment;

  -- Verify ranges
  SELECT COUNT(*)
  INTO out_of_range_heat
  FROM tasks
  WHERE deleted_at IS NULL AND (heat < 0 OR heat > 145);

  SELECT COUNT(*)
  INTO out_of_range_adjustment
  FROM tasks
  WHERE deleted_at IS NULL AND (heat_adjustment < -45 OR heat_adjustment > 45);

  IF out_of_range_heat > 0 THEN
    RAISE WARNING '⚠ Found % tasks with heat outside 0-145 range', out_of_range_heat;
  ELSE
    RAISE NOTICE '✓ All heat values in valid range (0-145)';
  END IF;

  IF out_of_range_adjustment > 0 THEN
    RAISE WARNING '⚠ Found % tasks with adjustment outside ±45 range', out_of_range_adjustment;
  ELSE
    RAISE NOTICE '✓ All adjustment values in valid range (±45)';
  END IF;
END $$;

-- Final summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '✓ Heat Production Migration Completed Successfully!';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Applied migrations:';
  RAISE NOTICE '  ✓ Heat V2: Data model, indexes, sort mode';
  RAISE NOTICE '  ✓ Heat V3: Star levels (0-3), direct adjustment tracking';
  RAISE NOTICE '  ✓ Heat V4: Point-based scale (0-145 heat, ±45 adjustment)';
  RAISE NOTICE '';
  RAISE NOTICE 'Key changes:';
  RAISE NOTICE '  • star (boolean) → star_level (0-3 levels)';
  RAISE NOTICE '  • heat_touch_count (clicks) → heat_adjustment (points)';
  RAISE NOTICE '  • heat scale: 0-1 normalized → 0-145 points';
  RAISE NOTICE '  • adjustment scale: ±0.45 → ±45 points';
  RAISE NOTICE '';
  RAISE NOTICE 'Old columns kept for rollback safety:';
  RAISE NOTICE '  • star (boolean) - use star_level instead';
  RAISE NOTICE '  • heat_touch_count - use heat_adjustment instead';
  RAISE NOTICE '  • other_touch_count - deprecated in V3';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Deploy updated application code';
  RAISE NOTICE '  2. Verify UI displays heat as 0-145 points';
  RAISE NOTICE '  3. Test heat/cool/star interactions';
  RAISE NOTICE '  4. Monitor heat calculations and color bands';
  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
END $$;
