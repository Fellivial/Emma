-- Add chunk_count to ingested_documents.
-- The column existed in schema.sql but was absent from the live table because the
-- initial table was created before this column was added to the CREATE TABLE statement.

ALTER TABLE public.ingested_documents
  ADD COLUMN IF NOT EXISTS chunk_count integer NOT NULL DEFAULT 0;
