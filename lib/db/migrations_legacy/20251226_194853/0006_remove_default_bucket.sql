-- Remove default_bucket column from settings table
-- New tasks will always default to "todo" bucket
ALTER TABLE settings
  DROP COLUMN IF EXISTS default_bucket;
