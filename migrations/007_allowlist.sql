-- Invite-only access gate for beta.
--
-- Before any email can receive an OTP, the server checks this table.
-- If the email is not here, the login API returns 403 and Supabase
-- never issues a magic link. A secondary check in the auth callback
-- catches any edge cases (e.g., allowlist modified after OTP send).
--
-- RLS:
-- All direct client access is denied. Only the service-role key
-- (used in the check-allowlist API route) can read this table.
-- This prevents the allowlist from being enumerable by any client.
--
-- Management:
-- Add rows directly in the Supabase dashboard or via a script.
-- There is deliberately no in-app admin UI for beta — keep it simple.

create table if not exists public.beta_allowlist (
  id         uuid        default gen_random_uuid() primary key,
  email      text        not null unique,
  note       text,                           -- e.g. "Fr Michael — Diocese of Perth"
  invited_at timestamptz default now() not null
);

alter table public.beta_allowlist enable row level security;

-- No policies = no access for anon or authenticated roles.
-- The service-role key bypasses RLS entirely.
