-- GREEN-27: project-scoped storage locations shared by Library and Inventory

-- Assets need a project relationship so Library can load the correct location set.
alter table if exists public.assets
add column if not exists project_id uuid references public.projects(id) on delete cascade;

create index if not exists assets_project_id_idx on public.assets(project_id);

-- Shared location source of truth per production/project.
create table if not exists public.project_locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_locations_project_normalized_name_idx
on public.project_locations (
  project_id,
  lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
);

alter table public.project_locations enable row level security;

drop policy if exists "project_locations_select_owner_or_member" on public.project_locations;
create policy "project_locations_select_owner_or_member"
on public.project_locations
for select
using (
  public.is_project_owner(project_id)
  or public.is_project_member(project_id)
);

drop policy if exists "project_locations_insert_owner_or_member" on public.project_locations;
create policy "project_locations_insert_owner_or_member"
on public.project_locations
for insert
with check (
  created_by = auth.uid()
  and (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  )
);

drop policy if exists "project_locations_update_owner_or_member" on public.project_locations;
create policy "project_locations_update_owner_or_member"
on public.project_locations
for update
using (
  public.is_project_owner(project_id)
  or public.is_project_member(project_id)
)
with check (
  public.is_project_owner(project_id)
  or public.is_project_member(project_id)
);

drop policy if exists "project_locations_delete_owner_or_member" on public.project_locations;
create policy "project_locations_delete_owner_or_member"
on public.project_locations
for delete
using (
  public.is_project_owner(project_id)
  or public.is_project_member(project_id)
);

-- Backfill locations already used by Inventory.
insert into public.project_locations (project_id, name, created_by)
select distinct on (
  i.project_id,
  lower(regexp_replace(btrim(i.warehouse_location), '\s+', ' ', 'g'))
)
  i.project_id,
  btrim(i.warehouse_location) as name,
  p.owner_id as created_by
from public.inventory i
join public.projects p on p.id = i.project_id
where i.warehouse_location is not null
  and btrim(i.warehouse_location) <> ''
on conflict do nothing;

-- Backfill locations already saved on project-linked Library assets.
insert into public.project_locations (project_id, name, created_by)
select distinct on (
  a.project_id,
  lower(regexp_replace(btrim(a.storage_location), '\s+', ' ', 'g'))
)
  a.project_id,
  btrim(a.storage_location) as name,
  coalesce(a.uploaded_by, p.owner_id) as created_by
from public.assets a
join public.projects p on p.id = a.project_id
where a.project_id is not null
  and a.storage_location is not null
  and btrim(a.storage_location) <> ''
on conflict do nothing;

notify pgrst, 'reload schema';
