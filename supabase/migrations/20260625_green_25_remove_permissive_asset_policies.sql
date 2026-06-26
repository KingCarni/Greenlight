-- GREEN-25 follow-up: remove permissive policies that can expose assets globally.
-- Supabase RLS policies are additive. A previous prototyping policy such as
-- "Enable read access for all users" will still expose rows even after stricter
-- policies are added. This file removes existing asset policies and recreates
-- only the owner/project-member policies.

alter table if exists public.assets enable row level security;

alter table if exists public.assets
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null;

alter table if exists public.assets
  add column if not exists project_id uuid references public.projects(id) on delete set null;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'assets'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

create policy "assets_select_owner_or_project_members" on public.assets
  for select using (
    uploaded_by = auth.uid()
    or (project_id is not null and public.is_project_member(project_id))
  );

create policy "assets_insert_owner_or_project_members" on public.assets
  for insert with check (
    uploaded_by = auth.uid()
    and (project_id is null or public.is_project_member(project_id))
  );

create policy "assets_update_owner_or_project_members" on public.assets
  for update using (
    uploaded_by = auth.uid()
    or (project_id is not null and public.is_project_member(project_id))
  ) with check (
    uploaded_by = auth.uid()
    and (project_id is null or public.is_project_member(project_id))
  );

create policy "assets_delete_owner" on public.assets
  for delete using (uploaded_by = auth.uid());

-- Manual verification after running:
-- select schemaname, tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'assets';
--
-- Expected: only the four GREEN-25 asset policies above should remain.
