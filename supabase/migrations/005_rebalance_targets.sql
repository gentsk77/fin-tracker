-- Fin-Tracker: Rebalancing targets
-- Per-user rebalancing configuration: a single settings row (cash reserve +
-- single-stock concentration cap) and a set of per-bucket / per-sleeve target
-- percentages.
--
-- RLS mirrors the rest of the schema: each row is scoped to its owner via
-- `auth.uid() = user_id`, so the authenticated (user) client can read/write
-- its own config. Defaults are seeded lazily in app code (no hardcoded
-- user_id here), so this migration is safe to run on any environment.

-- ---------------------------------------------------------------------------
-- Settings (one row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.rebalance_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reserve_amount numeric not null default 0,
  -- Tickers treated as one concentrated position (empty = no cap applied).
  single_stock_tickers text[] not null default '{}',
  single_stock_cap_pct numeric not null default 10,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rebalance_settings enable row level security;

drop policy if exists "Users manage their own rebalance settings" on public.rebalance_settings;
create policy "Users manage their own rebalance settings"
  on public.rebalance_settings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Targets (one row per user / bucket / sleeve)
-- ---------------------------------------------------------------------------
create table if not exists public.rebalance_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('taxable', 'tax_advantaged')),
  sleeve text not null,
  target_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bucket, sleeve)
);

alter table public.rebalance_targets enable row level security;

drop policy if exists "Users manage their own rebalance targets" on public.rebalance_targets;
create policy "Users manage their own rebalance targets"
  on public.rebalance_targets for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_rebalance_targets_user on public.rebalance_targets(user_id);
