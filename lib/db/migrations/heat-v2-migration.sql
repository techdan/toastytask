-- Heat Model v2 Migration
-- This migration adds:
-- 1. Sort mode toggle (toodle-170)
-- 2. Heat v2 data model (toodle-39)
--
-- Safe to run multiple times (idempotent)

-- ============================================================================
-- PART 1: toodle-170 - Sort Mode Toggle
-- ============================================================================

-- Add sort_mode column to settings table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'sort_mode'
  ) THEN
    ALTER TABLE settings ADD COLUMN sort_mode TEXT NOT NULL DEFAULT 'importance';
    ALTER TABLE settings ADD CONSTRAINT settings_sort_mode_check
      CHECK (sort_mode IN ('importance', 'heat'));
    RAISE NOTICE 'Added sort_mode column to settings table';
  ELSE
    RAISE NOTICE 'sort_mode column already exists in settings table';
  END IF;
END $$;

-- ============================================================================
-- PART 2: toodle-39 - Heat v2 Data Model
-- ============================================================================

-- Update heat default from 0.0 to 0.5
DO $$
BEGIN
  ALTER TABLE tasks ALTER COLUMN heat SET DEFAULT 0.5;
  RAISE NOTICE 'Updated heat default to 0.5';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not update heat default (may already be set or column missing)';
END $$;

-- Add heat_calculated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'heat_calculated_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN heat_calculated_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE 'Added heat_calculated_at column';
  ELSE
    RAISE NOTICE 'heat_calculated_at column already exists';
  END IF;
END $$;

-- Add heat_touch_count column (REAL type to support fractional values from decay-on-touch)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'heat_touch_count'
  ) THEN
    ALTER TABLE tasks ADD COLUMN heat_touch_count REAL NOT NULL DEFAULT 0;
    COMMENT ON COLUMN tasks.heat_touch_count IS 'Heat v2: Number of heat touches (🔥 icon clicks). Can be fractional due to decay-on-touch mechanism. Counter represents "equivalent fresh touches".';
    RAISE NOTICE 'Added heat_touch_count column (REAL type)';
  ELSE
    -- Fix existing column if it's the wrong type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'heat_touch_count'
      AND data_type = 'integer'
    ) THEN
      ALTER TABLE tasks ALTER COLUMN heat_touch_count TYPE REAL USING heat_touch_count::REAL;
      COMMENT ON COLUMN tasks.heat_touch_count IS 'Heat v2: Number of heat touches (🔥 icon clicks). Can be fractional due to decay-on-touch mechanism. Counter represents "equivalent fresh touches".';
      RAISE NOTICE 'Fixed heat_touch_count column type from INTEGER to REAL';
    ELSE
      RAISE NOTICE 'heat_touch_count column already exists with correct type';
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
    RAISE NOTICE 'Added other_touch_count column';
  ELSE
    RAISE NOTICE 'other_touch_count column already exists';
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
    RAISE NOTICE 'Added last_heat_touched_at column';
  ELSE
    RAISE NOTICE 'last_heat_touched_at column already exists';
  END IF;
END $$;

-- Rename or add last_touched_at column (it should already exist from previous migrations)
-- This is just for clarity - the column should already be there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'last_touched_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN last_touched_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE 'Added last_touched_at column';
  ELSE
    RAISE NOTICE 'last_touched_at column already exists';
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
    RAISE NOTICE 'Added cold_storage_at column';
  ELSE
    RAISE NOTICE 'cold_storage_at column already exists';
  END IF;
END $$;

-- ============================================================================
-- PART 3: Mark Existing Tasks as Touched (toodle-163)
-- ============================================================================

-- Set other_touch_count = 1 for all existing tasks that have both counters at 0
-- This prevents existing tasks from appearing as "new" (green) after deployment
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Only update tasks that currently have both counters at 0
  -- This is idempotent - won't affect tasks that have already been touched
  UPDATE tasks
  SET other_touch_count = 1
  WHERE heat_touch_count = 0
    AND other_touch_count = 0
    AND deleted_at IS NULL;  -- Only update active tasks

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    RAISE NOTICE 'Marked % existing tasks as touched (other_touch_count = 1)', updated_count;
  ELSE
    RAISE NOTICE 'No existing tasks needed to be marked as touched';
  END IF;
END $$;

-- ============================================================================
-- PART 4: Heat v2 Indexes
-- ============================================================================

-- Index for heat sorting (active tasks, excluding cold storage)
CREATE INDEX IF NOT EXISTS tasks_heat_sort_idx
  ON tasks(heat, completed_at, cold_storage_at);

-- Index for cold storage queries
CREATE INDEX IF NOT EXISTS tasks_cold_storage_idx
  ON tasks(cold_storage_at, last_touched_at);

-- Index for resurfacing queries (snoozed tasks)
CREATE INDEX IF NOT EXISTS tasks_resurfacing_idx
  ON tasks(next_surface_at);

-- Index for new task queries (both counters = 0)
CREATE INDEX IF NOT EXISTS tasks_new_task_idx
  ON tasks(heat_touch_count, other_touch_count, completed_at);

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================

-- Verify columns
DO $$
DECLARE
  missing_columns TEXT[];
  col TEXT;
BEGIN
  SELECT ARRAY_AGG(column_name)
  INTO missing_columns
  FROM (VALUES
    ('sort_mode'),  -- settings table
    ('heat_calculated_at'),
    ('heat_touch_count'),
    ('other_touch_count'),
    ('last_heat_touched_at'),
    ('cold_storage_at')
  ) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE (
      (required.column_name = 'sort_mode' AND c.table_name = 'settings')
      OR (required.column_name != 'sort_mode' AND c.table_name = 'tasks')
    )
    AND c.column_name = required.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE WARNING 'Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE '✓ All required columns exist';
  END IF;
END $$;

-- Verify indexes
DO $$
DECLARE
  missing_indexes TEXT[];
BEGIN
  SELECT ARRAY_AGG(index_name)
  INTO missing_indexes
  FROM (VALUES
    ('tasks_heat_sort_idx'),
    ('tasks_cold_storage_idx'),
    ('tasks_resurfacing_idx'),
    ('tasks_new_task_idx')
  ) AS required(index_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'tasks'
    AND indexname = required.index_name
  );

  IF missing_indexes IS NOT NULL THEN
    RAISE WARNING 'Missing indexes: %', array_to_string(missing_indexes, ', ');
  ELSE
    RAISE NOTICE '✓ All required indexes exist';
  END IF;
END $$;

-- Final completion message
DO $$
BEGIN
  RAISE NOTICE '✓ Heat Model v2 migration completed successfully';
END $$;
