create table if not exists public.rooms (
  code text primary key check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  host_id uuid not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.rooms add column if not exists host_id uuid;
alter table public.rooms add column if not exists closed_at timestamptz;

alter table public.rooms enable row level security;

drop policy if exists "Anyone can view rooms" on public.rooms;
create policy "Anyone can view rooms"
  on public.rooms
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can create rooms" on public.rooms;
create policy "Anyone can create rooms"
  on public.rooms
  for insert
  to anon, authenticated
  with check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$');

drop policy if exists "Room participants can close rooms" on public.rooms;
drop policy if exists "Room participants can delete rooms" on public.rooms;
create policy "Room participants can delete rooms"
  on public.rooms
  for delete
  to anon, authenticated
  using (true);

create table if not exists public.room_bans (
  room_code text not null references public.rooms(code) on delete cascade,
  name_key text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (room_code, name_key)
);

alter table public.room_bans enable row level security;

drop policy if exists "Anyone can view room bans" on public.room_bans;
create policy "Anyone can view room bans"
  on public.room_bans
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Room participants can create bans" on public.room_bans;
create policy "Room participants can create bans"
  on public.room_bans
  for insert
  to anon, authenticated
  with check (room_code is not null and name_key <> '');
