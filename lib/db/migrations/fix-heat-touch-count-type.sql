-- Migration: Fix heat_touch_count column type from integer to real
-- This allows fractional values like 11.3 touches as required by Heat v2 decay-on-touch

-- Change heat_touch_count from integer to real (PostgreSQL: double precision)
ALTER TABLE tasks
ALTER COLUMN heat_touch_count TYPE real
USING heat_touch_count::real;

-- Add comment explaining the column
COMMENT ON COLUMN tasks.heat_touch_count IS
'Heat v2: Number of heat touches (🔥 icon clicks). Can be fractional due to decay-on-touch mechanism. Counter represents "equivalent fresh touches".';
