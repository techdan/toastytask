-- Heat Model v4 Normalization Migration
-- This migration converts heat values from 0-1 scale to 0-145 point scale
--
-- Changes:
-- - heat field: multiply all values by 145 (0.0-1.0 → 0-145)
-- - No schema changes, just data transformation
--
-- Migration strategy:
-- - Simple multiplication: heat = heat * 145
-- - Idempotent: safe to run multiple times (checks if already migrated)
--
-- Safe to run multiple times (idempotent)

-- ============================================================================
-- PART 1: Pre-Migration Verification
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

  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Heat Model v4 Normalization - Pre-Migration Stats';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Total tasks: %', task_count;
  RAISE NOTICE 'Heat range: % to %', min_heat, max_heat;
  RAISE NOTICE 'Average heat: %', avg_heat;
  RAISE NOTICE '';

  -- Check if already migrated (heat values > 1.0 indicate v4 scale)
  IF max_heat > 1.0 THEN
    RAISE NOTICE '⚠ Heat values already appear to be in v4 scale (max > 1.0)';
    RAISE NOTICE '⚠ Skipping migration to avoid double-conversion';
    RAISE NOTICE '';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Normalize Heat Values (0-1 → 0-145)
-- ============================================================================

DO $$
DECLARE
  updated_count INTEGER;
  max_heat REAL;
BEGIN
  -- Check if migration is needed (only if max heat <= 1.0)
  SELECT MAX(heat)
  INTO max_heat
  FROM tasks
  WHERE deleted_at IS NULL AND heat IS NOT NULL;

  -- Only migrate if heat values are in old scale (0-1)
  IF max_heat <= 1.0 THEN
    -- Convert heat from 0-1 scale to 0-145 point scale
    UPDATE tasks
    SET heat = heat * 145
    WHERE heat IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RAISE NOTICE 'Normalized heat values for % tasks', updated_count;
    RAISE NOTICE 'Formula: heat = heat * 145';
  ELSE
    RAISE NOTICE 'Heat values already in v4 scale - no migration needed';
    updated_count := 0;
  END IF;

  -- Store result for verification
  CREATE TEMP TABLE IF NOT EXISTS migration_stats (
    updated_count INTEGER
  );
  INSERT INTO migration_stats VALUES (updated_count);
END $$;

-- ============================================================================
-- PART 3: Post-Migration Verification
-- ============================================================================

DO $$
DECLARE
  max_heat REAL;
  min_heat REAL;
  avg_heat REAL;
  task_count INTEGER;
  updated_count INTEGER;
  out_of_range_count INTEGER;
BEGIN
  -- Get migrated heat statistics
  SELECT
    MAX(heat),
    MIN(heat),
    AVG(heat),
    COUNT(*)
  INTO max_heat, min_heat, avg_heat, task_count
  FROM tasks
  WHERE deleted_at IS NULL AND heat IS NOT NULL;

  -- Get migration count
  SELECT migration_stats.updated_count
  INTO updated_count
  FROM migration_stats;

  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Heat Model v4 Normalization - Post-Migration Stats';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Total tasks: %', task_count;
  RAISE NOTICE 'Heat range: % to %', min_heat, max_heat;
  RAISE NOTICE 'Average heat: %', avg_heat;
  RAISE NOTICE 'Tasks updated: %', updated_count;
  RAISE NOTICE '';

  -- Verify heat values are in expected range (0-145)
  SELECT COUNT(*)
  INTO out_of_range_count
  FROM tasks
  WHERE deleted_at IS NULL
    AND heat IS NOT NULL
    AND (heat < 0 OR heat > 145);

  IF out_of_range_count > 0 THEN
    RAISE WARNING '⚠ Found % tasks with heat outside 0-145 range!', out_of_range_count;
  ELSE
    RAISE NOTICE '✓ All heat values in valid range (0-145)';
  END IF;
END $$;

-- Clean up temp table
DROP TABLE IF EXISTS migration_stats;

-- ============================================================================
-- PART 4: Sample Data Verification
-- ============================================================================

DO $$
DECLARE
  sample_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Sample tasks with heat values:';
  RAISE NOTICE '----------------------------------------------------------------------';

  FOR sample_record IN
    SELECT
      id,
      LEFT(title, 40) as title,
      ROUND(heat::numeric, 1) as heat,
      importance_v1
    FROM tasks
    WHERE deleted_at IS NULL
      AND heat IS NOT NULL
    ORDER BY heat DESC
    LIMIT 5
  LOOP
    RAISE NOTICE 'ID % | Heat: % pts | Importance: % | "%"',
      sample_record.id,
      sample_record.heat,
      sample_record.importance_v1,
      sample_record.title;
  END LOOP;

  RAISE NOTICE '----------------------------------------------------------------------';
END $$;

-- ============================================================================
-- PART 5: Final Completion Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✓ Heat Model v4 normalization completed successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Key changes:';
  RAISE NOTICE '  • heat scale: 0.0-1.0 → 0-145 points';
  RAISE NOTICE '  • No schema changes (heat field remains REAL type)';
  RAISE NOTICE '  • Simple multiplication: heat = heat * 145';
  RAISE NOTICE '';
  RAISE NOTICE 'Benefits:';
  RAISE NOTICE '  • More intuitive point-based display';
  RAISE NOTICE '  • Heat colors automatically adapt to importance thresholds';
  RAISE NOTICE '  • Easier to understand contribution breakdown';
  RAISE NOTICE '';
  RAISE NOTICE 'Rollback (if needed):';
  RAISE NOTICE '  UPDATE tasks SET heat = heat / 145 WHERE heat IS NOT NULL;';
  RAISE NOTICE '';
END $$;
