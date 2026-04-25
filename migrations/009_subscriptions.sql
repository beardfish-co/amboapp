-- 009_subscriptions.sql
-- Ambo Pro subscription tracking.
-- One row per user; kept in sync by the Stripe webhook handler.

create table if not exists subscriptions (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id    text unique,
  stripe_subscription_id text,
  status                text not null default 'trialing',
  price_id              text,
  current_period_end    timestamptz,
  trial_end             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Row-level security: users can only read their own subscription row.
alter table subscriptions enable row level security;

create policy "Users can read own subscription"
  on subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Indexes for webhook lookups by Stripe IDs.
create index if not exists subscriptions_stripe_customer_id_idx
  on subscriptions (stripe_customer_id);

create index if not exists subscriptions_stripe_subscription_id_idx
  on subscriptions (stripe_subscription_id);
