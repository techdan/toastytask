-- Add sort_order column so projects can be reordered manually

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order based on existing alphabetical ordering per user
WITH ranked_projects AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(user_id, '')
      ORDER BY name ASC, id ASC
    ) AS row_number
  FROM projects
)
UPDATE projects p
SET sort_order = r.row_number
FROM ranked_projects r
WHERE p.id = r.id;

-- Helpful index for retrieving projects ordered per user
CREATE INDEX IF NOT EXISTS projects_user_sort_order_idx
  ON projects (user_id, sort_order);
