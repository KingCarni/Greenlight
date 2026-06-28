-- Greenlight Team Chat
-- Run this in Supabase SQL Editor before testing the Team Chat tab.

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists team_messages_project_created_idx
  on public.team_messages(project_id, created_at);

create index if not exists team_messages_sender_idx
  on public.team_messages(sender_id);

alter table public.team_messages enable row level security;

-- Project owners and project members can read team messages for that production.
drop policy if exists "Project team can read team messages" on public.team_messages;
create policy "Project team can read team messages"
  on public.team_messages
  for select
  using (
    exists (
      select 1
      from public.projects p
      where p.id = team_messages.project_id
        and p.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = team_messages.project_id
        and pm.user_id = auth.uid()
    )
  );

-- Project owners and project members can send messages as themselves.
drop policy if exists "Project team can send team messages" on public.team_messages;
create policy "Project team can send team messages"
  on public.team_messages
  for insert
  with check (
    sender_id = auth.uid()
    and (
      exists (
        select 1
        from public.projects p
        where p.id = team_messages.project_id
          and p.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.project_members pm
        where pm.project_id = team_messages.project_id
          and pm.user_id = auth.uid()
      )
    )
  );