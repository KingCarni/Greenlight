-- Greenlight Project Member Access Policies
-- Run this in Supabase SQL Editor.
-- Goal: when a user joins a production, they can read the project and related project records.

create or replace function public.is_project_member_or_owner(target_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and p.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
  );
$$;

alter table public.projects enable row level security;

drop policy if exists "Owners and members can read projects" on public.projects;
create policy "Owners and members can read projects"
  on public.projects
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
    )
  );

alter table public.scenes enable row level security;

drop policy if exists "Project team can read scenes" on public.scenes;
create policy "Project team can read scenes"
  on public.scenes
  for select
  using (public.is_project_member_or_owner(project_id));

alter table public.assets enable row level security;

drop policy if exists "Project team can read assets" on public.assets;
create policy "Project team can read assets"
  on public.assets
  for select
  using (public.is_project_member_or_owner(project_id));

alter table public.inventory enable row level security;

drop policy if exists "Project team can read inventory" on public.inventory;
create policy "Project team can read inventory"
  on public.inventory
  for select
  using (public.is_project_member_or_owner(project_id));

alter table public.project_locations enable row level security;

drop policy if exists "Project team can read project locations" on public.project_locations;
create policy "Project team can read project locations"
  on public.project_locations
  for select
  using (public.is_project_member_or_owner(project_id));

alter table public.scene_assets enable row level security;

drop policy if exists "Project team can read scene assets" on public.scene_assets;
create policy "Project team can read scene assets"
  on public.scene_assets
  for select
  using (
    exists (
      select 1
      from public.scenes s
      where s.id = scene_assets.scene_id
        and public.is_project_member_or_owner(s.project_id)
    )
  );

alter table public.annotations enable row level security;

drop policy if exists "Project team can read annotations" on public.annotations;
create policy "Project team can read annotations"
  on public.annotations
  for select
  using (
    exists (
      select 1
      from public.scenes s
      where s.id = annotations.scene_id
        and public.is_project_member_or_owner(s.project_id)
    )
  );

alter table public.comments enable row level security;

drop policy if exists "Project team can read comments" on public.comments;
create policy "Project team can read comments"
  on public.comments
  for select
  using (
    exists (
      select 1
      from public.scenes s
      where s.id = comments.scene_id
        and public.is_project_member_or_owner(s.project_id)
    )
  );

alter table public.scene_snapshots enable row level security;

drop policy if exists "Project team can read scene snapshots" on public.scene_snapshots;
create policy "Project team can read scene snapshots"
  on public.scene_snapshots
  for select
  using (
    exists (
      select 1
      from public.scenes s
      where s.id = scene_snapshots.scene_id
        and public.is_project_member_or_owner(s.project_id)
    )
  );

alter table public.project_members enable row level security;

drop policy if exists "Project team can read project members" on public.project_members;
create policy "Project team can read project members"
  on public.project_members
  for select
  using (public.is_project_member_or_owner(project_id));