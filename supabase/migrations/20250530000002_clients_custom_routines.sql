-- Add custom_routines JSONB column to the clients table.
-- Stores per-client Routine[] objects so they survive serverless cold starts.

alter table public.clients
  add column if not exists custom_routines jsonb default '[]'::jsonb;
