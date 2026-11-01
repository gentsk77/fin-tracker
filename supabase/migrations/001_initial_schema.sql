-- Fin-Tracker: Initial Schema
-- This migration creates the core tables for the financial tracker app.
-- All user-owned tables have RLS enabled with policies restricting access
-- to the authenticated user who owns the data.

-- ---------------------------------------------------------------------------
-- External Connections (provider-abstracted)
-- ---------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'plaid' check (provider in ('plaid', 'manual')),
  provider_item_id text,
  institution_id text,
  institution_name text,
  status text not null default 'active' check (status in ('active', 'error', 'requires_reauth', 'removed')),
  access_token_encrypted text, -- Plaid access token (encrypted at app level)
  transactions_cursor text,    -- Plaid incremental sync cursor
  last_synced_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connections enable row level security;
create policy "Users can manage their own connections"
  on public.connections for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  provider text not null default 'plaid',
  provider_account_id text,
  institution_name text,
  name text not null,
  official_name text,
  type text not null check (type in ('checking', 'savings', 'credit', 'loan', 'mortgage', 'investment', 'retirement', 'other')),
  tax_type text not null default 'unknown' check (tax_type in ('taxable', 'traditional_retirement', 'roth_retirement', 'hsa', 'education', 'unknown')),
  current_balance numeric,
  available_balance numeric,
  credit_limit numeric,
  currency_code text not null default 'USD',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
create policy "Users can manage their own accounts"
  on public.accounts for all using (auth.uid() = user_id);

create index idx_accounts_user_id on public.accounts(user_id);
create index idx_accounts_connection_id on public.accounts(connection_id);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_transaction_id text,
  amount numeric not null,
  currency_code text not null default 'USD',
  date date not null,
  name text not null,
  merchant_name text,
  category text,
  subcategory text,
  pending boolean not null default false,
  type text not null default 'debit' check (type in ('debit', 'credit')),
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
create policy "Users can manage their own transactions"
  on public.transactions for all using (auth.uid() = user_id);

create index idx_transactions_account_id on public.transactions(account_id);
create index idx_transactions_user_date on public.transactions(user_id, date desc);
create unique index idx_transactions_provider on public.transactions(account_id, provider_transaction_id)
  where provider_transaction_id is not null;

-- ---------------------------------------------------------------------------
-- Securities
-- ---------------------------------------------------------------------------
create table public.securities (
  id uuid primary key default gen_random_uuid(),
  provider_security_id text,
  ticker_symbol text,
  name text not null,
  type text not null default 'other' check (type in ('equity', 'etf', 'mutual_fund', 'bond', 'cash', 'crypto', 'other')),
  currency_code text not null default 'USD',
  latest_price numeric,
  latest_price_date date,
  asset_class text default 'other' check (asset_class in ('us_stocks', 'international_stocks', 'bonds', 'cash', 'real_estate', 'crypto', 'alternatives', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Securities are shared across users (reference data), no RLS needed
create unique index idx_securities_ticker on public.securities(ticker_symbol)
  where ticker_symbol is not null;
create unique index idx_securities_provider on public.securities(provider_security_id)
  where provider_security_id is not null;

-- ---------------------------------------------------------------------------
-- Holdings (investment positions)
-- ---------------------------------------------------------------------------
create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  security_id uuid references public.securities(id),
  quantity numeric not null,
  cost_basis numeric,
  current_value numeric not null,
  currency_code text not null default 'USD',
  as_of timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.holdings enable row level security;
create policy "Users can manage their own holdings"
  on public.holdings for all using (auth.uid() = user_id);

create index idx_holdings_account_id on public.holdings(account_id);
create index idx_holdings_user_id on public.holdings(user_id);

-- ---------------------------------------------------------------------------
-- Investment Targets (user-defined target allocation)
-- ---------------------------------------------------------------------------
create table public.investment_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_class text not null check (asset_class in ('us_stocks', 'international_stocks', 'bonds', 'cash', 'real_estate', 'crypto', 'alternatives', 'other')),
  target_percent numeric not null check (target_percent >= 0 and target_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, asset_class)
);

alter table public.investment_targets enable row level security;
create policy "Users can manage their own targets"
  on public.investment_targets for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Manual Assets & Liabilities (for things not linked via Plaid)
-- ---------------------------------------------------------------------------
create table public.manual_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  current_value numeric not null,
  currency_code text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manual_assets enable row level security;
create policy "Users can manage their own manual assets"
  on public.manual_assets for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Net Worth Snapshots
-- ---------------------------------------------------------------------------
create table public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  total_assets numeric not null,
  total_liabilities numeric not null,
  net_worth numeric not null,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.net_worth_snapshots enable row level security;
create policy "Users can manage their own snapshots"
  on public.net_worth_snapshots for all using (auth.uid() = user_id);

create index idx_net_worth_user_date on public.net_worth_snapshots(user_id, date desc);

-- ---------------------------------------------------------------------------
-- Sync Jobs (operational visibility)
-- ---------------------------------------------------------------------------
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('transactions', 'holdings', 'balances', 'full')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sync_jobs enable row level security;
create policy "Users can view their own sync jobs"
  on public.sync_jobs for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at trigger to relevant tables
create trigger set_updated_at before update on public.connections
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.accounts
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.securities
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.holdings
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.investment_targets
  for each row execute function public.update_updated_at();
create trigger set_updated_at before update on public.manual_assets
  for each row execute function public.update_updated_at();
