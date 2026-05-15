-- Add configurable multi-step intake form schema to clients.
-- When form_steps is non-null, the intake page renders a structured form
-- instead of the AI chat UI.
--
-- Schema:
--   form_steps: FormStep[]
--   FormStep  { id: text, title: text, fields: FormField[] }
--   FormField { id: text, label: text, type: text, required: bool,
--               savesTo: "name"|"contact"|"notes"|text, options?: text[] }

alter table clients add column if not exists form_steps jsonb;
