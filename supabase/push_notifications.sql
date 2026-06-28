-- Greenlight Push Notification Tokens
-- Run this in Supabase SQL Editor.
-- This stores Expo push tokens for signed-in users.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text null,
  device_name text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx
  on public.push_tokens(user_id);

create index if not exists push_tokens_active_user_idx
  on public.push_tokens(user_id, is_active)
  where is_active = true;

alter table public.push_tokens enable row level security;

drop policy if exists "Users can read own push tokens" on public.push_tokens;
create policy "Users can read own push tokens"
  on public.push_tokens
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert own push tokens" on public.push_tokens;
create policy "Users can insert own push tokens"
  on public.push_tokens
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update own push tokens" on public.push_tokens;
create policy "Users can update own push tokens"
  on public.push_tokens
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own push tokens" on public.push_tokens;
create policy "Users can delete own push tokens"
  on public.push_tokens
  for delete
  using (user_id = auth.uid());

-- Optional manual test after a device has logged in and saved a token:
-- select * from public.push_tokens order by updated_at desc;