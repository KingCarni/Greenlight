alter table if exists public.scene_assets
add column if not exists flip_x boolean not null default false;
