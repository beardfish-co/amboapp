-- Add a private notes column for the Reflect view.
-- Notes are per-homily, captured while meditating on the readings.
-- Never appears in Preach; surfaced as a side panel in Write.
-- Same RLS policies as the homilies table (scoped by user_id = auth.uid()),
-- so no policy changes needed.
-- Safe to re-run.

alter table public.homilies
  add column if not exists notes text not null default '';
