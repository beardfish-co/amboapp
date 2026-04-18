-- Sunday-aware homilies: link each homily to the Sunday it's for.
-- Safe to run more than once.

alter table public.homilies
  add column if not exists sunday_date date;

-- Helpful index for sorting/filtering by Sunday.
create index if not exists homilies_user_sunday_idx
  on public.homilies (user_id, sunday_date desc nulls last);

-- RLS policies already cover all columns on this table,
-- so the new column inherits the existing user-scoped rules.
