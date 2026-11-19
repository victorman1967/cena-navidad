create table if not exists public.wishes (
  id text primary key,
  name text not null,
  "text" text not null,
  "date" text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id text primary key,
  name text not null,
  "date" text not null,
  src text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.runners (
  id text primary key,
  name text not null,
  start bigint not null,
  "end" bigint,
  codes text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.finishers (
  id text primary key,
  name text not null,
  start bigint not null,
  "end" bigint not null,
  created_at timestamptz not null default now()
);

alter table public.wishes enable row level security;
alter table public.photos enable row level security;
alter table public.runners enable row level security;
alter table public.finishers enable row level security;

drop policy if exists "acceso_publico" on public.wishes;
create policy "acceso_publico" on public.wishes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "acceso_publico" on public.photos;
create policy "acceso_publico" on public.photos
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "acceso_publico" on public.runners;
create policy "acceso_publico" on public.runners
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "acceso_publico" on public.finishers;
create policy "acceso_publico" on public.finishers
  for all to anon, authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos-cena',
  'fotos-cena',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos_publicas_leer" on storage.objects;
create policy "fotos_publicas_leer" on storage.objects
  for select to anon, authenticated using (bucket_id = 'fotos-cena');

drop policy if exists "fotos_publicas_subir" on storage.objects;
create policy "fotos_publicas_subir" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'fotos-cena');

drop policy if exists "fotos_publicas_actualizar" on storage.objects;
create policy "fotos_publicas_actualizar" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'fotos-cena') with check (bucket_id = 'fotos-cena');

drop policy if exists "fotos_publicas_borrar" on storage.objects;
create policy "fotos_publicas_borrar" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'fotos-cena');
