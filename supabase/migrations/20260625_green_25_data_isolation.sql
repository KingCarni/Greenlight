-- GREEN-25: Per-account/project data isolation for Greenlight
-- Run this in Supabase SQL Editor before using real production data.
-- Private by default: users can only access rows they own or projects they belong to.

-- This migration intentionally uses DROP POLICY IF EXISTS + CREATE POLICY because
-- Postgres/Supabase does not support CREATE POLICY IF NOT EXISTS.

-- -----------------------------------------------------------------------------
-- Defensive columns used by the current app and RLS policies
-- -----------------------------------------------------------------------------
alter table if exists public.assets
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null;

alter table if exists public.assets
  add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table if exists public.scenes
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------
create or replace function public.is_project_member(project_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = project_uuid
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(project_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and p.owner_id = auth.uid()
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on core tables
-- -----------------------------------------------------------------------------
alter table if exists public.profiles enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.project_members enable row level security;
alter table if exists public.scenes enable row level security;
alter table if exists public.assets enable row level security;
alter table if exists public.inventory enable row level security;
alter table if exists public.scene_assets enable row level security;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Projects
-- -----------------------------------------------------------------------------
drop policy if exists "projects_select_members" on public.projects;
create policy "projects_select_members" on public.projects
  for select using (owner_id = auth.uid() or public.is_project_member(id));

drop policy if exists "projects_insert_owner" on public.projects;
create policy "projects_insert_owner" on public.projects
  for insert with check (owner_id = auth.uid());

drop policy if exists "projects_update_owner" on public.projects;
create policy "projects_update_owner" on public.projects
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner" on public.projects
  for delete using (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Project members
-- -----------------------------------------------------------------------------
drop policy if exists "project_members_select_members" on public.project_members;
create policy "project_members_select_members" on public.project_members
  for select using (user_id = auth.uid() or public.is_project_member(project_id));

drop policy if exists "project_members_insert_owner_or_self" on public.project_members;
create policy "project_members_insert_owner_or_self" on public.project_members
  for insert with check (user_id = auth.uid() or public.is_project_owner(project_id));

drop policy if exists "project_members_update_owner" on public.project_members;
create policy "project_members_update_owner" on public.project_members
  for update using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));

drop policy if exists "project_members_delete_owner_or_self" on public.project_members;
create policy "project_members_delete_owner_or_self" on public.project_members
  for delete using (user_id = auth.uid() or public.is_project_owner(project_id));

-- -----------------------------------------------------------------------------
-- Scenes
-- -----------------------------------------------------------------------------
drop policy if exists "scenes_select_project_members" on public.scenes;
create policy "scenes_select_project_members" on public.scenes
  for select using (public.is_project_member(project_id));

drop policy if exists "scenes_insert_project_members" on public.scenes;
create policy "scenes_insert_project_members" on public.scenes
  for insert with check (public.is_project_member(project_id) and created_by = auth.uid());

drop policy if exists "scenes_update_project_members" on public.scenes;
create policy "scenes_update_project_members" on public.scenes
  for update using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

drop policy if exists "scenes_delete_project_members" on public.scenes;
create policy "scenes_delete_project_members" on public.scenes
  for delete using (public.is_project_member(project_id));

-- -----------------------------------------------------------------------------
-- Assets
-- Private owner assets are allowed through uploaded_by.
-- Project assets are allowed through project_id when present.
-- -----------------------------------------------------------------------------
drop policy if exists "assets_select_owner_or_project_members" on public.assets;
create policy "assets_select_owner_or_project_members" on public.assets
  for select using (
    uploaded_by = auth.uid()
    or (project_id is not null and public.is_project_member(project_id))
  );

drop policy if exists "assets_insert_owner_or_project_members" on public.assets;
create policy "assets_insert_owner_or_project_members" on public.assets
  for insert with check (
    uploaded_by = auth.uid()
    and (project_id is null or public.is_project_member(project_id))
  );

drop policy if exists "assets_update_owner_or_project_members" on public.assets;
create policy "assets_update_owner_or_project_members" on public.assets
  for update using (
    uploaded_by = auth.uid()
    or (project_id is not null and public.is_project_member(project_id))
  ) with check (
    uploaded_by = auth.uid()
    and (project_id is null or public.is_project_member(project_id))
  );

drop policy if exists "assets_delete_owner" on public.assets;
create policy "assets_delete_owner" on public.assets
  for delete using (uploaded_by = auth.uid());

-- -----------------------------------------------------------------------------
-- Inventory
-- -----------------------------------------------------------------------------
drop policy if exists "inventory_select_project_members" on public.inventory;
create policy "inventory_select_project_members" on public.inventory
  for select using (public.is_project_member(project_id));

drop policy if exists "inventory_insert_project_members" on public.inventory;
create policy "inventory_insert_project_members" on public.inventory
  for insert with check (public.is_project_member(project_id));

drop policy if exists "inventory_update_project_members" on public.inventory;
create policy "inventory_update_project_members" on public.inventory
  for update using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

drop policy if exists "inventory_delete_project_members" on public.inventory;
create policy "inventory_delete_project_members" on public.inventory
  for delete using (public.is_project_member(project_id));

-- -----------------------------------------------------------------------------
-- Scene assets
-- -----------------------------------------------------------------------------
drop policy if exists "scene_assets_select_project_members" on public.scene_assets;
create policy "scene_assets_select_project_members" on public.scene_assets
  for select using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  );

drop policy if exists "scene_assets_insert_project_members" on public.scene_assets;
create policy "scene_assets_insert_project_members" on public.scene_assets
  for insert with check (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  );

drop policy if exists "scene_assets_update_project_members" on public.scene_assets;
create policy "scene_assets_update_project_members" on public.scene_assets
  for update using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  ) with check (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  );

drop policy if exists "scene_assets_delete_project_members" on public.scene_assets;
create policy "scene_assets_delete_project_members" on public.scene_assets
  for delete using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Storage hardening note
-- -----------------------------------------------------------------------------
-- Current app code still uses getPublicUrl for images. RLS now prevents other users
-- from discovering those URLs through database reads, but already-known public URLs
-- may remain accessible while buckets are public.
--
-- Before real production data:
-- 1. Make the `assets` and `scene-photos` buckets private.
-- 2. Store storage paths separately from display URLs.
-- 3. Generate signed URLs only after database/RLS access is confirmed.
--
-- Current user-owned paths should use:
--   assets/{user_id}/...
--   scene-photos/{user_id}/...
