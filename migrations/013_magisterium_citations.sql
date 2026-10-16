-- Store Magisterium AI's structured citations alongside the prose.
--
-- The Chat API returns a `citations` array (verbatim cited text, document
-- title, author, year, reference number, source URL). We keep it so the
-- Tradition panel can show verified passages with a link to the source,
-- and keep the unstripped response (with [^n] markers) in content_raw so
-- each point can later be matched to its source.
--
-- Additive and safe to re-run.

alter table public.magisterium_cache
  add column if not exists citations   jsonb,
  add column if not exists content_raw text;
