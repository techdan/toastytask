-- Add updated_at column to projects table
-- This column was missing but referenced by the update_projects_updated_at trigger

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC');
