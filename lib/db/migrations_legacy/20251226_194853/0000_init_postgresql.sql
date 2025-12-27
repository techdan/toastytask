-- PostgreSQL Migration for Toodle
-- Consolidated from SQLite migrations 0000-0003
-- Created: 2025-10-22

-- Create projects table
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#6b7280',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Create settings table (single row for user preferences)
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  -- Default values for new tasks
  default_priority TEXT NOT NULL DEFAULT 'medium' CHECK (default_priority IN ('low', 'medium', 'high', 'top')),
  default_bucket TEXT NOT NULL DEFAULT 'todo' CHECK (default_bucket IN ('todo', 'watch', 'later')),
  default_due_date TEXT NOT NULL DEFAULT 'today' CHECK (default_due_date IN ('none', 'today', 'tomorrow', 'next_week')),

  -- Heat model settings (Phase 3)
  heat_decay_half_life_todo INTEGER NOT NULL DEFAULT 48,
  heat_decay_half_life_watch INTEGER NOT NULL DEFAULT 168,
  heat_decay_half_life_later INTEGER NOT NULL DEFAULT 720,
  activity_normalization_constant INTEGER NOT NULL DEFAULT 20,
  new_task_heat_boost REAL NOT NULL DEFAULT 0.7,
  new_task_heat_half_life INTEGER NOT NULL DEFAULT 24,

  -- Automation settings (Phase 4)
  escalation_threshold REAL NOT NULL DEFAULT 0.75,
  de_escalation_threshold_todo_watch REAL NOT NULL DEFAULT 0.25,
  de_escalation_threshold_watch_later REAL NOT NULL DEFAULT 0.15,
  retirement_threshold REAL NOT NULL DEFAULT 0.05,
  retirement_days INTEGER NOT NULL DEFAULT 90,
  review_cadence_watch INTEGER NOT NULL DEFAULT 7,
  review_cadence_later INTEGER NOT NULL DEFAULT 30,

  -- Snooze presets (Phase 3)
  snooze_todo_days INTEGER NOT NULL DEFAULT 1,
  snooze_watch_days INTEGER NOT NULL DEFAULT 7,
  snooze_later_days INTEGER NOT NULL DEFAULT 30,

  -- UI preferences
  grouping_mode TEXT NOT NULL DEFAULT 'ungrouped' CHECK (grouping_mode IN ('ungrouped', 'importance', 'heat')),

  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Create tasks table
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),

  -- Core fields for Phase 1
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'top')),
  star BOOLEAN NOT NULL DEFAULT false,
  due_at TIMESTAMP,

  -- Bucket (Phase 2)
  bucket TEXT NOT NULL DEFAULT 'todo' CHECK (bucket IN ('todo', 'watch', 'later')),

  -- Recurrence (Phase 7)
  repeat_type TEXT NOT NULL DEFAULT 'none' CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly')),

  -- Heat model fields (Phase 3)
  heat REAL NOT NULL DEFAULT 0.0,
  touch_count INTEGER NOT NULL DEFAULT 0,
  last_touched_at TIMESTAMP,
  next_surface_at TIMESTAMP,

  -- Calculated fields
  importance_v1 INTEGER NOT NULL DEFAULT 0,

  -- Status fields
  completed_at TIMESTAMP,
  archived_at TIMESTAMP,
  deleted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Create note_rows table
CREATE TABLE note_rows (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  active_version_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
  updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Create note_row_versions table
CREATE TABLE note_row_versions (
  id SERIAL PRIMARY KEY,
  note_row_id INTEGER NOT NULL REFERENCES note_rows(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- Create indexes
CREATE INDEX note_rows_task_id_ordinal_idx ON note_rows (task_id, ordinal);
CREATE INDEX tasks_project_id_deleted_at_idx ON tasks (project_id, deleted_at);
CREATE INDEX tasks_bucket_heat_idx ON tasks (bucket, heat);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW() AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for automatic updated_at updates
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_note_rows_updated_at BEFORE UPDATE ON note_rows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
