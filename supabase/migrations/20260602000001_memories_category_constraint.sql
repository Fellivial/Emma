-- Update memories category CHECK constraint to new 7-category taxonomy
alter table public.memories drop constraint if exists memories_category_check;
alter table public.memories add constraint memories_category_check
  check (category in ('preference', 'habit', 'personal', 'goal', 'relationship', 'context', 'constraint'));

-- Remap old categories to new equivalents for existing rows
update public.memories set category = 'habit' where category = 'routine';
update public.memories set category = 'context' where category = 'episodic';
-- 'environment' category rows are deprecated (device graph removed); archive them as 'context'
update public.memories set category = 'context' where category = 'environment';
