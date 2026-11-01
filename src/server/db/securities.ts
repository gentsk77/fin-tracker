/**
 * Securities DB helpers.
 *
 * Securities are reference data shared across users, keyed by
 * `provider_security_id` (Plaid's stable id for the asset). Multiple users
 * holding AAPL all point at the same security row.
 *
 * The table has RLS enabled with no policy for the `authenticated` role, so
 * the signed-in user (the role `createClient()` runs as) can neither read nor
 * write securities. Because securities are global reference data (not owned
 * by any one user), every access here goes through the service-role
 * `createAdminClient()`, which bypasses RLS. Per-user `holdings` continue to
 * use the user-scoped client so their RLS policy still applies.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { MappedSecurity } from "@/server/plaid/mappers";

/** Shape of the security fields the holdings UI needs. */
export interface SecurityLite {
  id: string;
  ticker_symbol: string | null;
  name: string;
  type: string;
  latest_price: number | null;
  latest_price_date: string | null;
  asset_class: string;
}

export interface SecurityRow {
  id: string;
  provider_security_id: string | null;
  ticker_symbol: string | null;
  name: string;
  type: string;
  currency_code: string;
  latest_price: number | null;
  latest_price_date: string | null;
  asset_class: string;
  created_at: string;
  updated_at: string;
}

/**
 * Upsert a security by `provider_security_id`. Returns the row id so the
 * caller can wire it into holdings.
 *
 * Uses a select + update/insert (rather than ON CONFLICT) for parity with
 * the rest of the codebase and because the partial unique index on
 * `provider_security_id WHERE NOT NULL` isn't compatible with
 * postgres-rest's onConflict shorthand in all client versions.
 */
export async function upsertSecurity(
  input: MappedSecurity,
): Promise<{ id: string }> {
  const supabase = createAdminClient();

  const { data: existing, error: selectError } = await supabase
    .from("securities")
    .select("id")
    .eq("provider_security_id", input.providerSecurityId)
    .maybeSingle();
  if (selectError) throw selectError;

  const payload = {
    provider_security_id: input.providerSecurityId,
    ticker_symbol: input.tickerSymbol,
    name: input.name,
    type: input.type,
    currency_code: input.currencyCode,
    latest_price: input.latestPrice,
    latest_price_date: input.latestPriceDate,
    asset_class: input.assetClass,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("securities")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("securities")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch securities by id, returned as a `Map<id, SecurityLite>`.
 *
 * Used by the holdings read path: `holdings` is read with the user-scoped
 * client (RLS-filtered to the current user), but `securities` can't be joined
 * there because the authenticated role can't see the securities table. So we
 * collect the `security_id`s from the holdings and look them up here through
 * the service-role client, then stitch the results together in JS.
 */
export async function getSecuritiesByIds(
  ids: string[],
): Promise<Map<string, SecurityLite>> {
  const map = new Map<string, SecurityLite>();
  if (ids.length === 0) return map;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("securities")
    .select(
      "id, ticker_symbol, name, type, latest_price, latest_price_date, asset_class",
    )
    .in("id", ids);
  if (error) throw error;

  for (const row of (data ?? []) as SecurityLite[]) {
    map.set(row.id, row);
  }
  return map;
}
