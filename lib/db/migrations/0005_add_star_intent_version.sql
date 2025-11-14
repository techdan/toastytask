-- Add star_intent_version column to track the latest client intent applied server-side
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS star_intent_version BIGINT NOT NULL DEFAULT 0;

-- Seed existing rows with a reasonable baseline (use last_touched_at if present, otherwise updated_at/created_at)
UPDATE tasks
SET star_intent_version = (
  EXTRACT(EPOCH FROM COALESCE(last_touched_at, updated_at, created_at)) * 1000
)::BIGINT
WHERE star_intent_version = 0;
