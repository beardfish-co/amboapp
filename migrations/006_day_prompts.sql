-- AI-generated reflective prompts, cached per liturgical day.
--
-- Why a separate table (not a column on homilies):
-- The prompts are a property of the *day's readings*, not of a priest's
-- homily. They should be shared across every priest preparing for the same
-- Sunday — one generation per day, read by many. This also means we can
-- generate them once (on first request) and never burn API tokens again.
--
-- RLS:
-- SELECT is open to any authenticated user (prompts are not sensitive; they're
-- shared lectio aids). INSERT is also open to authenticated users because
-- the API route runs on the user's cookie — but the primary key on
-- sunday_date enforces uniqueness, so duplicate generation from a race
-- simply fails the second insert. UPDATE and DELETE are forbidden; if a
-- day's prompts ever need regeneration it's a manual admin action.
--
-- Shape of `prompts` jsonb:
--   {
--     "r1": [{"prompt": "...", "basis": "...", "mood": "...", "pressure": "..."}, ...],
--     "ps": [...],
--     "r2": [...],
--     "gospel": [...]
--   }
-- Three objects per reading slot. `prompt` is what the priest sees;
-- `basis` is the italic sub-note below it; `mood` and `pressure` are the
-- hidden textual reasoning Manus insisted must drive the generator.
--
-- `evaluator_verdict` jsonb preserves the rubric scores for audit and for
-- future tuning of the generator prompt. Shape:
--   {
--     "r1": [{"brev": 5, "mood": 5, "pray": 5, "end": 5, "weighted": 5.0, "flags": 0, "pass": true}, ...],
--     ...
--   }
--
-- Safe to re-run.

create table if not exists public.day_prompts (
  sunday_date         date primary key,
  prompts             jsonb not null,
  generator_model     text  not null,
  evaluator_verdict   jsonb,
  created_at          timestamptz not null default now()
);

-- RLS: readable by anyone authenticated; writable by anyone authenticated
-- (gated by the primary-key uniqueness, so a race just fails safely).
alter table public.day_prompts enable row level security;

drop policy if exists "day_prompts read any authed" on public.day_prompts;
create policy "day_prompts read any authed"
  on public.day_prompts
  for select
  to authenticated
  using (true);

drop policy if exists "day_prompts insert any authed" on public.day_prompts;
create policy "day_prompts insert any authed"
  on public.day_prompts
  for insert
  to authenticated
  with check (true);

-- Updates and deletes intentionally NOT granted. Manual admin work only.
