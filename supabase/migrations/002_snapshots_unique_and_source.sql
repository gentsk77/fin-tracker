-- 002: Net-worth snapshots: add `source` column + unique (user_id, date) index
--
-- The base table from 001 already exists; this migration just adds the
-- machinery needed for daily upsert and visual distinction between
-- forward-looking sync snapshots and backfilled (estimated) ones.

-- Track whether each row came from a real post-sync snapshot or was
-- reverse-derived by walking transactions backward from current balance.
-- Defaults to 'sync' so existing rows (if any) keep working without churn.
alter table public.net_worth_snapshots
  add column if not exists source text not null default 'sync'
  check (source in ('sync', 'backfill'));

-- Enable daily upsert on (user_id, date). The pre-existing
-- `idx_net_worth_user_date` is a regular (non-unique) index, we keep it
-- for the date-desc read path and add a separate UNIQUE index here for
-- the write path.
create unique index if not exists uq_net_worth_user_date
  on public.net_worth_snapshots (user_id, date);
