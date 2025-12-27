-- Add focus fields to tasks table
-- Migration: Add isFocused and focusSnoozeUntil columns for Focus Attention Boost feature

ALTER TABLE tasks
ADD COLUMN is_focused BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN focus_snooze_until TIMESTAMP WITH TIME ZONE;

-- Add index for filtering focused tasks
CREATE INDEX tasks_is_focused_idx ON tasks(is_focused);

-- Update metadata
COMMENT ON COLUMN tasks.is_focused IS 'Focus toggle - boosts task score to keep near top of list';
COMMENT ON COLUMN tasks.focus_snooze_until IS 'Snooze focus boost until this time (typically 4 AM next day)';
