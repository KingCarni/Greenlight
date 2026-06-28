-- Greenlight mobile alert delivery hook.
-- Run in Supabase SQL Editor after notifications.sql and push_notifications.sql.
-- Requires pg_net extension and a deployed Edge Function named send-mobile-alert.

create extension if not exists pg_net with schema extensions;

alter table public.app_notifications
add column if not exists push_sent_at timestamptz null;

create index if not exists app_notifications_pending_mobile_idx
  on public.app_notifications(created_at)
  where push_sent_at is null;

create or replace function public.queue_mobile_alert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  function_url text;
begin
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-mobile-alert';

  if function_url is null or function_url = '/functions/v1/send-mobile-alert' then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists app_notifications_mobile_alert_after_insert on public.app_notifications;
create trigger app_notifications_mobile_alert_after_insert
  after insert on public.app_notifications
  for each row
  execute function public.queue_mobile_alert();

-- Set this once in SQL Editor, replacing the value with your Supabase project URL:
-- alter database postgres set app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
