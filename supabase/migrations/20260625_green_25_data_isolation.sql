-- GREEN-25: Per-account/project data isolation for Greenlight
-- Run this in Supabase SQL Editor before using real production data.
-- Private by default: users can only access rows they own or projects they belong to.

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

alter table if exists public.profiles enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.project_members enable row level security;
alter table if exists public.scenes enable row level security;
alter table if exists public.assets enable row level security;
alter table if exists public.inventory enable row level security;
alter table if exists public.scene_assets enable row level security;
alter table if exists public.scene_snapshots enable row level security;
alter table if exists public.annotations enable row level security;
alter table if exists public.comments enable row level security;

create policy if not exists "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy if not exists "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy if not exists "projects_select_members" on public.projects
  for select using (owner_id = auth.uid() or public.is_project_member(id));

create policy if not exists "projects_insert_owner" on public.projects
  for insert with check (owner_id = auth.uid());

create policy if not exists "projects_update_owner" on public.projects
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy if not exists "projects_delete_owner" on public.projects
  for delete using (owner_id = auth.uid());

create policy if not exists "project_members_select_members" on public.project_members
  for select using (user_id = auth.uid() or public.is_project_member(project_id));

create policy if not exists "project_members_insert_owner_or_self" on public.project_members
  for insert with check (user_id = auth.uid() or public.is_project_owner(project_id));

create policy if not exists "project_members_update_owner" on public.project_members
  for update using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));

create policy if not exists "project_members_delete_owner_or_self" on public.project_members
  for delete using (user_id = auth.uid() or public.is_project_owner(project_id));

create policy if not exists "scenes_select_project_members" on public.scenes
  for select using (public.is_project_member(project_id));

create policy if not exists "scenes_insert_project_members" on public.scenes
  for insert with check (public.is_project_member(project_id) and created_by = auth.uid());

create policy if not exists "scenes_update_project_members" on public.scenes
  for update using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

create policy if not exists "scenes_delete_project_members" on public.scenes
  for delete using (public.is_project_member(project_id));

create policy if not exists "assets_select_owner_or_project_members" on public.assets
  for select using (
    uploaded_by = auth.uid()
    or (project_id is not null and public.is_project_member(project_id))
  );

create policy if not exists "assets_insert_owner_or_project_members" on public.assets
  for insert with check (
    uploaded_by = auth.uid()
    and (project_id is null or public.is_project_member(project_id))
  );

create policy if not exists "assets_update_owner_or_project_members" on public.assets
  for update using (
    uploaded_by = auth.uid()
    or (project_id is not null and public.is_project_member(project_id))
  ) with check (
    uploaded_by = auth.uid()
    and (project_id is null or public.is_project_member(project_id))
  );

create policy if not exists "assets_delete_owner" on public.assets
  for delete using (uploaded_by = auth.uid());

create policy if not exists "inventory_select_project_members" on public.inventory
  for select using (public.is_project_member(project_id));

create policy if not exists "inventory_insert_project_members" on public.inventory
  for insert with check (public.is_project_member(project_id));

create policy if not exists "inventory_update_project_members" on public.inventory
  for update using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

create policy if not exists "inventory_delete_project_members" on public.inventory
  for delete using (public.is_project_member(project_id));

create policy if not exists "scene_assets_select_project_members" on public.scene_assets
  for select using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  );

create policy if not exists "scene_assets_insert_project_members" on public.scene_assets
  for insert with check (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  );

create policy if not exists "scene_assets_update_project_members" on public.scene_assets
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

create policy if not exists "scene_assets_delete_project_members" on public.scene_assets
  for delete using (
    exists (
      select 1 from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member(s.project_id)
    )
  );

-- Storage hardening note:
-- Current app code still uses getPublicUrl for images.
-- Before real production data, make assets/scene-photos buckets private and migrate to signed URLs.
-- Current user-owned paths should use:
--   assets/{user_id}/...
--   scene-photos/{user_id}/...
