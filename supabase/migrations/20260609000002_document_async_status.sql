-- Add processing status to ingested_documents for the background ingestion queue.
-- Status values:
--   ready      — synchronous ingestion completed (default, existing rows)
--   pending    — file uploaded to Storage, Inngest job queued
--   processing — Inngest job is actively running
--   failed     — processing failed; error stored in processing_error

alter table public.ingested_documents
  add column if not exists status text not null default 'ready'
    check (status in ('ready', 'pending', 'processing', 'failed'));

alter table public.ingested_documents
  add column if not exists storage_path text;

alter table public.ingested_documents
  add column if not exists processing_error text;

-- ── Supabase Storage bucket for async document uploads ────────────────────────
-- Private bucket — users upload via presigned URL (generated server-side, 60 min TTL).
-- Inngest function downloads via the admin/service-role client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-ingestion',
  'document-ingestion',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/tiff',
    'text/plain'
  ]
)
on conflict (id) do nothing;
