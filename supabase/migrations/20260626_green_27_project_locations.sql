-- GREEN-27: reusable project-scoped storage locations

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
