-- Add soft-delete columns to memories table.
-- These columns existed in schema.sql but were absent from the live table because
-- the initial table was created before they were added to the CREATE TABLE statement.

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded'));

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS superseded_by text REFERENCES public.memories(id);

-- Partial unique index enforcing one active memory per (user_id, category, key).
-- Superseded memories are exempt so history is preserved.
DROP INDEX IF EXISTS public.memories_active_uq;

CREATE UNIQUE INDEX IF NOT EXISTS memories_active_uq
  ON public.memories (user_id, category, key)
  WHERE status = 'active';
