-- Run this once in Supabase -> SQL Editor -> New query -> Run

create extension if not exists "pgcrypto";

create table if not exists public.trips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  destination  text not null,
  start_date   date not null,
  end_date     date not null,
  budget       numeric not null,
  currency     text not null default 'INR',
  travelers    int  not null default 1,
  preferences  jsonb not null default '{}'::jsonb,   -- the form the user filled in
  itinerary    jsonb not null,                       -- the AI-generated (and edited) plan
  is_public    boolean not null default false,       -- share link on/off
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists trips_user_created_idx on public.trips (user_id, created_at desc);

-- Row Level Security: each user can only touch their own trips
alter table public.trips enable row level security;

create policy "owner can read"   on public.trips for select to authenticated using (auth.uid() = user_id);
create policy "owner can insert" on public.trips for insert to authenticated with check (auth.uid() = user_id);
create policy "owner can update" on public.trips for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner can delete" on public.trips for delete to authenticated using (auth.uid() = user_id);

-- Anyone with the link can read a trip, but only if the owner turned sharing on
create policy "public can read shared" on public.trips for select to anon, authenticated using (is_public = true);
