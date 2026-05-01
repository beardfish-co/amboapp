-- 011_daily_notes.sql
-- Extends the homilies table to support Daily Mass notes and (later) Special Occasion notes.
-- A note_type column distinguishes Sunday homilies from daily notes and special occasion notes.
-- Two additional text columns store the liturgical day label and saint name at save time
-- so archived daily notes render correctly even if the API data is no longer available.
--
-- ⚠️ MIGRATION GOTCHA: This file must be manually applied in the Supabase SQL editor at
-- https://supabase.com/dashboard/project/jowbavogcjozxpujwwah/sql/new
-- It is NOT auto-applied. Run it once and confirm the columns appear before deploying code
-- that depends on them.

alter table homilies
  add column if not exists note_type text not null default 'sunday'
    check (note_type in ('sunday', 'daily', 'special')),
  add column if not exists liturgical_day text not null default '',
  add column if not exists saint_name text not null default '';

-- Index on note_type so archive queries filtering by type stay fast.
create index if not exists homilies_note_type_idx on homilies (user_id, note_type, updated_at desc);
