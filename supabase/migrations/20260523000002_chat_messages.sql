create table if not exists public.chat_messages (
  id          uuid        primary key,
  user_id     uuid        not null references auth.users on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  display     text        not null,
  expression  text,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_user_created
  on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;

create policy "Users manage own messages"
  on public.chat_messages for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
