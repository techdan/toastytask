-- Heat Model v3 Migration
-- This migration adds Heat V3 features:
-- 1. Enhanced star system (0-3 levels instead of boolean)
-- 2. Direct heat adjustment tracking (replaces click counting)
--
-- Migration strategy:
-- - Add new columns (star_level, heat_adjustment)
-- - Migrate data from old columns (star → star_level, heat_touch_count → heat_adjustment)
-- - Keep old columns for rollback safety (can drop later)
--
-- Safe to run multiple times (idempotent)

-- ============================================================================
-- PART 1: Add Star Level Column
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
    RAISE NOTICE 'Added star_level column';
  ELSE
    RAISE NOTICE 'star_level column already exists';
  END IF;
END $$;

-- Migrate existing star boolean to star_level
-- star = true → star_level = 2 (yellow)
-- star = false → star_level = 0 (none)
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  -- Only migrate tasks where star_level is 0 but star is true
  -- This is idempotent - won't overwrite manually set star_level values
  UPDATE tasks
  SET star_level = 2
  WHERE star = true
    AND star_level = 0;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;

  IF migrated_count > 0 THEN
    RAISE NOTICE 'Migrated % starred tasks to star_level = 2 (yellow)', migrated_count;
  ELSE
    RAISE NOTICE 'No tasks needed star migration (already migrated or no starred tasks)';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Add Heat Adjustment Column
-- ============================================================================

-- Add heat_adjustment column (-0.45 to +0.45 range)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'heat_adjustment'
  ) THEN
    ALTER TABLE tasks ADD COLUMN heat_adjustment REAL NOT NULL DEFAULT 0;
    COMMENT ON COLUMN tasks.heat_adjustment IS 'Heat v3: Direct heat adjustment (-0.45 to +0.45). Replaces heat_touch_count click counting with direct contribution to heat score.';
    RAISE NOTICE 'Added heat_adjustment column';
  ELSE
    RAISE NOTICE 'heat_adjustment column already exists';
  END IF;
END $$;

-- Migrate existing heat_touch_count to heat_adjustment
-- Formula: heat_adjustment = (heat_touch_count / 20) * 0.45
-- This converts the old click count (0-20 range) to the new direct adjustment (-0.45 to +0.45)
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  -- Only migrate tasks where heat_adjustment is 0 but heat_touch_count is non-zero
  -- This is idempotent - won't overwrite manually set heat_adjustment values
  UPDATE tasks
  SET heat_adjustment = (heat_touch_count / 20.0) * 0.45
  WHERE heat_touch_count != 0
    AND heat_adjustment = 0;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;

  IF migrated_count > 0 THEN
    RAISE NOTICE 'Migrated heat_touch_count to heat_adjustment for % tasks', migrated_count;
  ELSE
    RAISE NOTICE 'No tasks needed heat_touch_count migration';
  END IF;
END $$;

-- ============================================================================
-- PART 3: Add Constraints
-- ============================================================================

-- Add check constraint for star_level (0-3 range)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'tasks_star_level_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_star_level_check
      CHECK (star_level >= 0 AND star_level <= 3);
    RAISE NOTICE 'Added star_level check constraint';
  ELSE
    RAISE NOTICE 'star_level check constraint already exists';
  END IF;
END $$;

-- Add check constraint for heat_adjustment (-0.45 to +0.45 range)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'tasks_heat_adjustment_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_heat_adjustment_check
      CHECK (heat_adjustment >= -0.45 AND heat_adjustment <= 0.45);
    RAISE NOTICE 'Added heat_adjustment check constraint';
  ELSE
    RAISE NOTICE 'heat_adjustment check constraint already exists';
  END IF;
END $$;

-- ============================================================================
-- PART 4: Update Indexes
-- ============================================================================

-- No new indexes needed for Heat v3
-- Existing heat sorting indexes will work with the new heat calculation

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================

-- Verify columns
DO $$
DECLARE
  missing_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(column_name)
  INTO missing_columns
  FROM (VALUES
    ('star_level'),
    ('heat_adjustment')
  ) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_name = 'tasks'
    AND c.column_name = required.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE WARNING 'Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE '✓ All required columns exist';
  END IF;
END $$;

-- Verify data migration
DO $$
DECLARE
  star_migrated_count INTEGER;
  heat_migrated_count INTEGER;
BEGIN
  -- Check star migration (tasks with star=true should have star_level >= 1)
  SELECT COUNT(*)
  INTO star_migrated_count
  FROM tasks
  WHERE star = true AND star_level >= 1;

  -- Check heat migration (tasks with heat_touch_count != 0 should have heat_adjustment != 0)
  SELECT COUNT(*)
  INTO heat_migrated_count
  FROM tasks
  WHERE heat_touch_count != 0 AND heat_adjustment != 0;

  RAISE NOTICE '✓ Migrated % starred tasks', star_migrated_count;
  RAISE NOTICE '✓ Migrated % tasks with heat adjustments', heat_migrated_count;
END $$;

-- Verify constraints
DO $$
DECLARE
  missing_constraints TEXT[];
BEGIN
  SELECT ARRAY_AGG(constraint_name)
  INTO missing_constraints
  FROM (VALUES
    ('tasks_star_level_check'),
    ('tasks_heat_adjustment_check')
  ) AS required(constraint_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = required.constraint_name
  );

  IF missing_constraints IS NOT NULL THEN
    RAISE WARNING 'Missing constraints: %', array_to_string(missing_constraints, ', ');
  ELSE
    RAISE NOTICE '✓ All required constraints exist';
  END IF;
END $$;

-- Final completion message
DO $$
BEGIN
  RAISE NOTICE '✓ Heat Model v3 migration completed successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Key changes:';
  RAISE NOTICE '  • star (boolean) → star_level (0-3)';
  RAISE NOTICE '  • heat_touch_count (clicks) → heat_adjustment (direct)';
  RAISE NOTICE '';
  RAISE NOTICE 'Old columns (star, heat_touch_count) are kept for rollback safety';
  RAISE NOTICE 'They can be dropped in a future migration after V3 is stable';
END $$;
