-- Greenlight Notifications Foundation
-- Run this in Supabase SQL Editor before wiring the notification UI.
-- Creates in-app notification records for Team Chat and Marketplace messages.

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  type text not null check (
    type in (
      'team_message',
      'marketplace_message',
      'marketplace_reservation',
      'system'
    )
  ),
  title text not null,
  body text null,
  source_table text null,
  source_id uuid null,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created_idx
  on public.app_notifications(user_id, created_at desc);

create index if not exists app_notifications_user_unread_idx
  on public.app_notifications(user_id, read_at)
  where read_at is null;

create index if not exists app_notifications_project_idx
  on public.app_notifications(project_id);

alter table public.app_notifications enable row level security;

-- Users can only read their own notifications.
drop policy if exists "Users can read own notifications" on public.app_notifications;
create policy "Users can read own notifications"
  on public.app_notifications
  for select
  using (user_id = auth.uid());

-- Users can only mark/update their own notifications.
drop policy if exists "Users can update own notifications" on public.app_notifications;
create policy "Users can update own notifications"
  on public.app_notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users may delete/clear their own notifications.
drop policy if exists "Users can delete own notifications" on public.app_notifications;
create policy "Users can delete own notifications"
  on public.app_notifications
  for delete
  using (user_id = auth.uid());

-- Helper: shorten notification body.
create or replace function public.greenlight_notification_body(raw_body text)
returns text
language sql
immutable
as $$
  select case
    when raw_body is null then null
    when char_length(raw_body) <= 140 then raw_body
    else substring(raw_body from 1 for 137) || '...'
  end;
$$;

-- Notify project owner and members when a Team Chat message is created.
create or replace function public.notify_team_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_name text;
  sender_name text;
begin
  select name into project_name
  from public.projects
  where id = new.project_id;

  select full_name into sender_name
  from public.profiles
  where id = new.sender_id;

  insert into public.app_notifications (
    user_id,
    project_id,
    type,
    title,
    body,
    source_table,
    source_id
  )
  select distinct recipient_id,
    new.project_id,
    'team_message',
    coalesce(sender_name, 'Team Member') || ' posted in ' || coalesce(project_name, 'Team Chat'),
    public.greenlight_notification_body(new.content),
    'team_messages',
    new.id
  from (
    select p.owner_id as recipient_id
    from public.projects p
    where p.id = new.project_id

    union

    select pm.user_id as recipient_id
    from public.project_members pm
    where pm.project_id = new.project_id
  ) recipients
  where recipient_id is not null
    and recipient_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists team_messages_notify_after_insert on public.team_messages;
create trigger team_messages_notify_after_insert
  after insert on public.team_messages
  for each row
  execute function public.notify_team_message();

-- Notify the other participant when a Marketplace message is created.
create or replace function public.notify_marketplace_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row record;
  listing_title text;
  recipient_id uuid;
  sender_name text;
begin
  select * into reservation_row
  from public.marketplace_reservations
  where id = new.reservation_id;

  if reservation_row is null then
    return new;
  end if;

  if new.sender_id = reservation_row.requester_id then
    recipient_id := reservation_row.seller_id;
  else
    recipient_id := reservation_row.requester_id;
  end if;

  if recipient_id is null or recipient_id = new.sender_id then
    return new;
  end if;

  select title into listing_title
  from public.marketplace_listings
  where id = reservation_row.listing_id;

  select full_name into sender_name
  from public.profiles
  where id = new.sender_id;

  insert into public.app_notifications (
    user_id,
    type,
    title,
    body,
    source_table,
    source_id
  ) values (
    recipient_id,
    'marketplace_message',
    coalesce(sender_name, 'Marketplace User') || ' messaged about ' || coalesce(listing_title, 'a marketplace item'),
    public.greenlight_notification_body(new.content),
    'marketplace_messages',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists marketplace_messages_notify_after_insert on public.marketplace_messages;
create trigger marketplace_messages_notify_after_insert
  after insert on public.marketplace_messages
  for each row
  execute function public.notify_marketplace_message();