-- 012_special_occasions.sql
-- Adds the category column for Special Occasion homilies (note_type = 'special').
-- Values: 'wedding', 'funeral', 'baptism', 'other'. Null for Sunday and Daily.
--
-- ⚠️ Apply manually in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/jowbavogcjozxpujwwah/sql/new
-- Confirm the column appears in the homilies table before deploying code that
-- depends on it.

alter table homilies
  add column if not exists category text
    check (category in ('wedding', 'funeral', 'baptism', 'other'));
