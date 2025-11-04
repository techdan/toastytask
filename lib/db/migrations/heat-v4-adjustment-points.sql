-- Heat Model v4 Adjustment Migration
-- Converts heat_adjustment from ±0.45 scale to ±45 point scale
-- and updates constraint/comments to match.

DO $$
DECLARE
  max_adjustment REAL;
  min_adjustment REAL;
  avg_adjustment REAL;
  task_count INTEGER;
BEGIN
  SELECT
    MAX(heat_adjustment),
    MIN(heat_adjustment),
    AVG(heat_adjustment),
    COUNT(*)
  INTO max_adjustment, min_adjustment, avg_adjustment, task_count
  FROM tasks
  WHERE deleted_at IS NULL;

  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Heat Adjustment Migration - Pre-Migration Stats';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Total tasks: %', task_count;
  RAISE NOTICE 'Adjustment range: % to %', min_adjustment, max_adjustment;
  RAISE NOTICE 'Average adjustment: %', avg_adjustment;
  RAISE NOTICE '';
END $$;

-- Scale adjustments if still on legacy ±0.45 range
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
    RAISE NOTICE 'Scaled heat_adjustment values for % tasks (x100)', updated_count;
  ELSE
    RAISE NOTICE 'Heat adjustments already appear to be in point scale (max abs > 0.45), skipping scaling.';
  END IF;
END $$;

-- Update constraint to allow ±45 range
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_adjustment_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_heat_adjustment_check
  CHECK (heat_adjustment >= -45 AND heat_adjustment <= 45);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_heat_check
  CHECK (heat >= 0 AND heat <= 145);

-- Update column comment for clarity
COMMENT ON COLUMN tasks.heat_adjustment IS 'Heat v4: Direct heat adjustment in points (-45 to +45).';

DO $$
DECLARE
  max_adjustment REAL;
  min_adjustment REAL;
  avg_adjustment REAL;
  task_count INTEGER;
  out_of_range_count INTEGER;
BEGIN
  SELECT
    MAX(heat_adjustment),
    MIN(heat_adjustment),
    AVG(heat_adjustment),
    COUNT(*)
  INTO max_adjustment, min_adjustment, avg_adjustment, task_count
  FROM tasks
  WHERE deleted_at IS NULL;

  SELECT COUNT(*)
  INTO out_of_range_count
  FROM tasks
  WHERE deleted_at IS NULL
    AND (heat_adjustment < -45 OR heat_adjustment > 45);

  RAISE NOTICE '';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Heat Adjustment Migration - Post-Migration Stats';
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Total tasks: %', task_count;
  RAISE NOTICE 'Adjustment range: % to %', min_adjustment, max_adjustment;
  RAISE NOTICE 'Average adjustment: %', avg_adjustment;
  RAISE NOTICE 'Heat range: % to %',
    (SELECT MIN(heat) FROM tasks WHERE deleted_at IS NULL),
    (SELECT MAX(heat) FROM tasks WHERE deleted_at IS NULL);
  IF out_of_range_count > 0 THEN
    RAISE WARNING '⚠ Found % tasks outside ±45 adjustment range', out_of_range_count;
  ELSE
    RAISE NOTICE '✓ All adjustments within ±45 range';
  END IF;
END $$;

DO $$
DECLARE
  out_of_range_heat INTEGER;
BEGIN
  SELECT COUNT(*) INTO out_of_range_heat
  FROM tasks
  WHERE deleted_at IS NULL AND (heat < 0 OR heat > 145);

  IF out_of_range_heat > 0 THEN
    RAISE WARNING '⚠ Found % tasks with heat outside 0-145 range', out_of_range_heat;
  ELSE
    RAISE NOTICE '✓ All heat values within 0-145 range';
  END IF;
END $$;
