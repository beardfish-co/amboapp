-- Snapshot the Universalis readings into the homily row at first successful fetch.
-- Why: Universalis' free JSONP endpoint only serves a narrow sliding window
-- around today (~3 days past, ~9 days future). Past dates beyond that window
-- SILENTLY return today's readings (wrong but shaped correctly). Future dates
-- beyond it return HTML and fail to parse. Either way, historical homilies lose
-- their original readings on reload.
--
-- The snapshot makes each homily self-contained archival: once readings are
-- loaded successfully for a homily's sunday_date, we persist them. Subsequent
-- loads prefer the snapshot over live fetch, so a priest's body of work is
-- immune to Universalis outages, URL changes, or the silent-redirect bug.
--
-- Same RLS as the homilies table (scoped by user_id = auth.uid()) — no policy
-- changes needed.
-- Safe to re-run.

alter table public.homilies
  add column if not exists readings_snapshot jsonb,
  add column if not exists readings_snapshot_date date;
