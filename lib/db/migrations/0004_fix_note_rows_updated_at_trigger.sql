-- Fix note_rows updated_at behavior: only update when active_version_id changes
-- Safely replace the generic updated_at trigger on note_rows with a content-aware one.

DO $$
BEGIN
  -- Drop existing trigger if present
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'note_rows' AND t.tgname = 'update_note_rows_updated_at'
  ) THEN
    DROP TRIGGER update_note_rows_updated_at ON public.note_rows;
  END IF;
END$$;

-- Create function specific to note_rows that only bumps updated_at on content change
CREATE OR REPLACE FUNCTION public.update_note_rows_updated_at_if_content_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active_version_id IS DISTINCT FROM OLD.active_version_id THEN
    NEW.updated_at := NOW() AT TIME ZONE 'UTC';
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger using the new function
CREATE TRIGGER update_note_rows_updated_at
BEFORE UPDATE ON public.note_rows
FOR EACH ROW
EXECUTE FUNCTION public.update_note_rows_updated_at_if_content_changed();

