-- 010_echo_outputs.sql
-- Echo outputs: stores every output the priest saves from the Echo workspace.
-- Each row holds the original AI-generated text (never modified) and the
-- priest's edited version, along with the output type and optional variant.

create table echo_outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  homily_id uuid references homilies(id) on delete set null,
  output_type text not null check (output_type in (
    'take-into-the-week',
    'parish-reflection',
    'social-post',
    'small-group-questions',
    'prayer-prompt'
  )),
  variant text, -- 'short'|'standard'|'longer' for parish-reflection; 'before-sunday'|'after-sunday' for social-post; null for others
  generated_text text not null,   -- original AI output, never modified
  output_text text not null,      -- priest's edited version (starts equal to generated_text)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: priests see only their own outputs
alter table echo_outputs enable row level security;

create policy "Users can manage their own echo outputs"
  on echo_outputs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at
-- Note: update_updated_at_column() is defined with create or replace so it is
-- safe to run even if a later migration already created this function.
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger echo_outputs_updated_at
  before update on echo_outputs
  for each row execute function update_updated_at_column();
