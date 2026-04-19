-- Seed sentence + preparation template for Sunday homilies.
-- Externalizes the Homiletic Directory's "one principal grace":
--   1. `seed` — the central grace or mystery of this Sunday (the homily grows from this)
--   2. `seed_why_now` — why these people need to hear this now
--   3. `seed_eucharist` — how this prepares them for the Eucharist
--   4. `seed_response` — what concrete response the Lord is asking
-- All optional, all empty by default. Same RLS as the homilies table.
-- Safe to re-run.

alter table public.homilies
  add column if not exists seed            text not null default '',
  add column if not exists seed_why_now    text not null default '',
  add column if not exists seed_eucharist  text not null default '',
  add column if not exists seed_response   text not null default '';
