-- Migration: Add additional indexes for task queries
-- Created: 2025-10-22

-- Index for sorting by due date (common in task views)
CREATE INDEX IF NOT EXISTS "tasks_due_at_idx" ON "tasks" USING btree ("due_at");

-- Index for filtering completed tasks
CREATE INDEX IF NOT EXISTS "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");

-- Composite index for active tasks sorted by importance
CREATE INDEX IF NOT EXISTS "tasks_active_importance_idx" ON "tasks" USING btree ("deleted_at","importance_v1");
