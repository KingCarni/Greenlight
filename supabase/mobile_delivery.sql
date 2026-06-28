-- Greenlight mobile alert delivery hook.
-- Run in Supabase SQL Editor after notifications.sql and push_notifications.sql.
-- Requires pg_net extension and a deployed Edge Function named send-mobile-alert.
-- Deploy the function with: supabase functions deploy send-mobile-alert --no-verify-jwt
--
-- Important:
-- Do NOT store your service role key in SQL.
-- The Edge Function uses SUPABASE_SERVICE_ROLE_KEY from its server environment.
-- This database trigger only passes the notification id to the function.

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
  function_url text := 'https://gxmusblxlrgpezeawuqe.supabase.co/functions/v1/send-mobile-alert';
begin
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
