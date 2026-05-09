-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: task-documents storage bucket
-- Created: 2025-05-09
-- Safe to run multiple times — all statements are idempotent
--
-- Adds the "task-documents" private Storage bucket used by the docgen tool
-- (src/core/integrations/docgen.ts) to store DOCX and PDF outputs per user.
-- Files are scoped under {userId}/{taskId}_{filename} paths.
-- Service role writes are unrestricted (bypasses RLS).
-- Authenticated users can only read files in their own folder.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Storage bucket ───────────────────────────────────────────────────────
--
-- public = false  → files require a signed URL; never publicly accessible
-- file_size_limit = 50 MB  → generous cap for generated documents
-- allowed_mime_types: only DOCX + PDF accepted

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-documents',
  'task-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;


-- ─── 2. RLS — storage.objects ────────────────────────────────────────────────
--
-- Users can only read documents stored in their own folder ({user_id}/...).
-- Server-side writes use the service role, which bypasses RLS — no insert
-- policy needed for the authenticated role.

drop policy if exists "Users read own documents" on storage.objects;
create policy "Users read own documents"
  on storage.objects
  for select
  using (
    bucket_id = 'task-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
