-- Add content_hash to ingested_documents for deduplication.
-- Prevents duplicate chunks from bloating the vector store when the same
-- file is uploaded more than once. Hash is SHA-256 of the raw file bytes
-- (hex string), computed server-side before processing.

alter table public.ingested_documents
  add column if not exists content_hash text;

-- Unique per-user constraint: same hash from the same user is a duplicate.
-- Allows the same document to be uploaded by different users (normal case).
create unique index if not exists ingested_documents_user_hash_idx
  on public.ingested_documents (user_id, content_hash)
  where content_hash is not null;
