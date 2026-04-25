-- Magisterium AI response cache — one row per liturgical day.
--
-- Why a separate cache table:
-- The Magisterium API charges per query. Since every priest preparing for the
-- same Sunday sees the same Gospel, we query once and serve the result from
-- here. The caching strategy is identical to day_prompts: first request
-- generates and writes; all subsequent requests read the cached row.
--
-- Each `citations` entry:
--   { "text": "quote from document", "source": "Document name, §n" }
--
-- Attribution requirement (Magisterium API Terms §4.5):
-- The UI that surfaces this data must include "Powered by Magisterium AI".
--
-- RLS:
-- SELECT open to any authenticated user.
-- INSERT open to any authenticated user — PK uniqueness handles race conditions.
-- UPDATE and DELETE not granted; cache is append-only.
--
-- Safe to re-run.

create table if not exists public.magisterium_cache (
  date         text        primary key,   -- YYYYMMDD
  gospel_ref   text        not null,
  day_name     text        not null,
  citations    jsonb       not null,       -- array of { text, source }
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
