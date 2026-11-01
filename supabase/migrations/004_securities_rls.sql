-- 004: Securities RLS policies
--
-- `securities` is shared reference data (every user's holdings point at the
-- same AAPL/VTI/etc rows), so 001 intended it to have "no RLS". In the live
-- database, however, RLS ended up ENABLED on the table with no policy. With
-- RLS on and no policy, the `authenticated` role (which the app's
-- user-scoped Supabase client runs as) can neither read nor write securities.
--
-- That silently broke the investments pipeline:
--   * sync's `upsertSecurity` threw a 42501 "violates row-level security
--     policy" error, which the holdings step caught and swallowed, so
--     holdings were never written;
--   * even when holdings existed, `listHoldings`' join to `securities`
--     returned NULL for every row, so the UI showed no tickers/names and
--     bucketed everything as "other".
--
-- The application code now reads/writes securities through the service-role
-- client (`createAdminClient()`), which bypasses RLS, securities are global
-- reference data, so that's the correct access model and means existing
-- deployments work without running this migration.
--
-- This migration makes the schema honest for fresh setups: keep RLS enabled
-- (good hygiene) but add permissive policies so any authenticated user can
-- read securities and the sync can upsert them. Per-user `holdings` keep their
-- own `auth.uid() = user_id` policy, only the shared securities table is
-- opened up here.

alter table public.securities enable row level security;

drop policy if exists "Authenticated users can read securities" on public.securities;
create policy "Authenticated users can read securities"
  on public.securities for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert securities" on public.securities;
create policy "Authenticated users can insert securities"
  on public.securities for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update securities" on public.securities;
create policy "Authenticated users can update securities"
  on public.securities for update
  to authenticated
  using (true)
  with check (true);
