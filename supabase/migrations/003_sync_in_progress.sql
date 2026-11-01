-- 003: Sync-in-progress lock
--
-- Adds `sync_started_at` to connections so the auto-sync path (and any
-- future concurrent sync triggers) can atomically claim a per-connection
-- lock via UPDATE ... WHERE sync_started_at IS NULL OR sync_started_at <
-- now() - interval '5 minutes' RETURNING id.
--
-- The 5-minute stale recovery handles the case where a sync crashed
-- without clearing the field (process killed, deploy mid-flight, etc).

alter table public.connections
  add column if not exists sync_started_at timestamptz;
