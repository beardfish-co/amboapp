-- Magisterium AI response cache — one row per liturgical day.
--
-- Why a separate cache table:
-- The Magisterium API charges per query. Since every priest preparing for the
-- same Sunday sees the same Gospel, we query once and serve the result from
-- here. One generation per day, read by many.
--
-- `content` stores the raw prose response from Magisterium AI, rendered as
-- formatted markdown in the UI. See ReflectView.tsx for rendering.
--
-- Attribution requirement (Magisterium API Terms §4.5):
-- The UI must include "Powered by Magisterium AI". See ReflectView.tsx.
--
-- RLS: SELECT and INSERT open to any authenticated user.
-- UPDATE and DELETE not granted; cache is append-only.
--
-- Safe to re-run.

create table if not exists public.magisterium_cache (
  date         text        primary key,   -- YYYYMMDD
  gospel_ref   text        not null,
  day_name     text        not null,
  content      text        not null,      -- raw Magisterium AI response
  created_at   timestamptz not null default now()
);

alter table public.magisterium_cache enable row level security;

drop policy if exists "magisterium_cache read any authed" on public.magisterium_cache;
create policy "magisterium_cache read any authed"
  on public.magisterium_cache
  for select
  to authenticated
  using (true);

drop policy if exists "magisterium_cache insert any authed" on public.magisterium_cache;
create policy "magisterium_cache insert any authed"
  on public.magisterium_cache
  for insert
  to authenticated
  with check (true);
