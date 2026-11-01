/**
 * Net-worth snapshot DB helpers.
 *
 * Three responsibilities:
 *
 *   1. `recordTodaysSnapshot(userId)`: called after every successful sync.
 *      Computes today's totals + per-category breakdown from current
 *      account balances and upserts a row keyed on (user_id, date).
 *      `source='sync'` rows always overwrite any prior `backfill` row
 *      for the same date.
 *
 *   2. `backfillSnapshots(userId, days)`: best-effort historical
 *      reconstruction. Walks each Plaid account's transactions BACKWARDS
 *      from its current balance, day by day, to estimate prior balances.
 *      Writes `source='backfill'` snapshots. Skips any date that already
 *      has a `source='sync'` row.
 *
 *   3. `listSnapshots(userId, range)`: read path for the chart. Returns
 *      rows ordered oldest -> newest, including the `source` field so the
 *      client can render different stroke styles for backfilled vs sync
 *      portions of the line.
 */
import { createClient } from "@/lib/supabase/server";
import {
  assetCategoryFor,
  signedBalance,
  type AssetCategoryKey,
} from "@/domain/money";
import { isExcludedFromSpending } from "@/domain/spending";
import { listAccounts, type AccountRow } from "@/server/db/accounts";
import type { TransactionRow } from "@/server/db/transactions";

export type SnapshotSource = "sync" | "backfill";

export interface NetWorthSnapshotRow {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  breakdown: Partial<Record<AssetCategoryKey, number>> & Record<string, number>;
  source: SnapshotSource;
  created_at: string;
}

export type SnapshotRange = "1M" | "6M" | "1Y" | "ALL";

/**
 * Format a Date as YYYY-MM-DD in UTC. We use UTC throughout snapshot work
 * so day boundaries are stable across local timezones.
 */
function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// recordTodaysSnapshot
// ---------------------------------------------------------------------------

/**
 * Compute and persist today's net-worth snapshot. Idempotent: re-running
 * within the same day overwrites the existing row. `source='sync'` rows
 * always win over any `source='backfill'` row for the same date.
 *
 * Returns the upserted row, or null if the user has no USD accounts (in
 * which case there's nothing meaningful to snapshot).
 */
export async function recordTodaysSnapshot(
  userId: string,
): Promise<NetWorthSnapshotRow | null> {
  const accounts = await listAccounts(userId);

  let totalAssets = 0;
  let totalLiabilities = 0;
  const byCategory: Partial<Record<AssetCategoryKey, number>> = {};
  let hadUsdAccount = false;

  for (const account of accounts) {
    if (account.currency_code !== "USD") continue;
    hadUsdAccount = true;

    const signed = signedBalance(account);
    if (signed > 0) totalAssets += signed;
    else if (signed < 0) totalLiabilities += -signed;

    if (signed > 0) {
      const category = assetCategoryFor(account.type);
      if (category) {
        byCategory[category] = (byCategory[category] ?? 0) + signed;
      }
    }
  }

  if (!hadUsdAccount) return null;

  const today = isoDateUtc(new Date());
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .upsert(
      {
        user_id: userId,
        date: today,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        breakdown: byCategory,
        source: "sync",
      },
      { onConflict: "user_id,date" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as NetWorthSnapshotRow;
}

// ---------------------------------------------------------------------------
// listSnapshots
// ---------------------------------------------------------------------------

export async function listSnapshots(
  userId: string,
  range: SnapshotRange = "ALL",
): Promise<NetWorthSnapshotRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("net_worth_snapshots")
    .select("*")
    .eq("user_id", userId)
    // Only real, forward-recorded snapshots. Synthetic `backfill` rows are
    // intentionally excluded so the chart starts when the user links an
    // account and grows forward, rather than showing reverse-derived history.
    .eq("source", "sync")
    .order("date", { ascending: true });

  if (range !== "ALL") {
    const days = range === "1M" ? 31 : range === "6M" ? 186 : 366;
    const since = isoDateUtc(addDaysUtc(new Date(), -days));
    query = query.gte("date", since);
  }

  // Hard cap: ~400 days even on ALL keeps the payload small.
  query = query.limit(400);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NetWorthSnapshotRow[];
}

// ---------------------------------------------------------------------------
// backfillSnapshots
// ---------------------------------------------------------------------------

/**
 * Reverse-derive historical daily net worth from each account's current
 * balance + transaction history.
 *
 * Algorithm:
 *   For each Plaid USD account:
 *     known_balance[today] = current_balance
 *     For each day D from today-1 down to today-days:
 *       known_balance[D] = known_balance[D+1] +
 *         (sum of debit amounts dated D+1 for asset accounts)
 *         (subtract for liability accounts, flipping the sign)
 *         ... reversed for credit transactions
 *
 *   Then for each day, sum (signed) per-account balances -> net worth.
 *
 * **Caveats** (surfaced to the user via dashed stroke on the chart):
 *
 *   - Investment accounts: tx history captures buys/sells/dividends but
 *     NOT price changes. Historical valuation will under- or over-state
 *     based on market movement.
 *   - Pending transactions: included if present, which can cause
 *     near-today wobble.
 *   - Accounts with thin tx history (< 60 days): we still walk backward,
 *     but earlier dates will appear flat because nothing's there to
 *     subtract.
 *   - Non-Plaid (manual) accounts: skipped entirely. Their balances are
 *     never known historically.
 *
 * Idempotent: any `source='backfill'` row is overwritten on rerun. Rows
 * with `source='sync'` are NEVER overwritten; those came from real
 * snapshots and are authoritative for their date.
 *
 * Returns the count of snapshot rows written/replaced.
 */
export async function backfillSnapshots(
  userId: string,
  days = 365,
): Promise<{ written: number; daysCovered: number; accountsUsed: number }> {
  const accounts = await listAccounts(userId);
  const usdAccounts = accounts.filter(
    (a) => a.currency_code === "USD" && a.provider === "plaid",
  );
  if (usdAccounts.length === 0) {
    return { written: 0, daysCovered: 0, accountsUsed: 0 };
  }

  const today = new Date();
  const todayIso = isoDateUtc(today);
  const oldestIso = isoDateUtc(addDaysUtc(today, -days));

  const supabase = await createClient();

  // Fetch transactions for all USD Plaid accounts within the window in one go.
  const accountIds = usdAccounts.map((a) => a.id);
  const { data: txRows, error: txErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .in("account_id", accountIds)
    .gte("date", oldestIso)
    .lte("date", todayIso)
    .range(0, 49999); // hard cap
  if (txErr) throw txErr;

  const txByAccount = new Map<string, TransactionRow[]>();
  for (const tx of (txRows ?? []) as TransactionRow[]) {
    const list = txByAccount.get(tx.account_id) ?? [];
    list.push(tx);
    txByAccount.set(tx.account_id, list);
  }

  // Per-account historical balance walk.
  //
  // We store a Map<accountId, Map<dateIso, signedBalance>>.
  //
  // The sign convention matches `signedBalance`: positive = asset
  // contribution, negative = liability contribution.
  type DailyBalance = Map<string, number>; // date -> signed balance
  const perAccount = new Map<string, DailyBalance>();

  for (const account of usdAccounts) {
    // Plaid stores credit/loan balances as positive principal-owed amounts;
    // signedBalance flips them to negative. Start from today's signed value
    // so the backfill math works uniformly for asset and liability accounts:
    // for both, `signed(D-1) = signed(D) + debits(D) - credits(D)`.
    const currentSigned = signedBalance(account);

    const daily: DailyBalance = new Map();
    daily.set(todayIso, currentSigned);

    // Index this account's transactions by date.
    const txs = txByAccount.get(account.id) ?? [];
    const txByDate = new Map<string, TransactionRow[]>();
    for (const tx of txs) {
      const list = txByDate.get(tx.date) ?? [];
      list.push(tx);
      txByDate.set(tx.date, list);
    }

    // Walk backwards: balance on day D-1 = balance on day D, minus the
    // net effect of transactions DATED day D.
    //
    // For an asset account:
    //   - debit on day D       => money went OUT day D
    //                          => balance was HIGHER before day D
    //                          => balance(D-1) = balance(D) + amount
    //   - credit on day D      => money came IN day D
    //                          => balance was LOWER before day D
    //                          => balance(D-1) = balance(D) - amount
    //
    // For a liability account (we track as NEGATIVE signed balance):
    //   - debit on day D (charge) => debt INCREASED day D
    //                             => signedBalance was LESS NEGATIVE before
    //                             => signed(D-1) = signed(D) + amount
    //   - credit on day D (payment) => debt DECREASED day D
    //                              => signedBalance was MORE NEGATIVE before
    //                              => signed(D-1) = signed(D) - amount
    //
    // The arithmetic is the same for both asset and liability accounts:
    // subtract credits, add debits. The sign convention encoded in
    // `signedBalance` (asset = +balance, liability = -balance) makes the
    // direction work out naturally.

    let runningSigned = currentSigned;
    for (let i = 1; i <= days; i++) {
      const currentDay = addDaysUtc(today, -(i - 1));
      const priorDay = addDaysUtc(today, -i);
      const currentDayIso = isoDateUtc(currentDay);
      const priorDayIso = isoDateUtc(priorDay);

      const txsForCurrent = txByDate.get(currentDayIso) ?? [];
      let delta = 0;
      for (const tx of txsForCurrent) {
        if (tx.currency_code !== "USD") continue;
        const amt = Number(tx.amount);
        if (!Number.isFinite(amt)) continue;
        if (tx.type === "debit") delta += amt;
        else delta -= amt;
      }
      runningSigned = runningSigned + delta;
      daily.set(priorDayIso, runningSigned);
    }

    perAccount.set(account.id, daily);
  }

  // Aggregate per-day totals across accounts.
  // We compute one row per day in the window. For each day we also
  // rebuild the byCategory breakdown using account.type at that point
  // (the type is constant; Plaid doesn't reclassify accounts retroactively).
  const rowsByDate = new Map<
    string,
    {
      totalAssets: number;
      totalLiabilities: number;
      byCategory: Partial<Record<AssetCategoryKey, number>>;
    }
  >();

  for (let i = 0; i <= days; i++) {
    const dayIso = isoDateUtc(addDaysUtc(today, -i));
    let totalAssets = 0;
    let totalLiabilities = 0;
    const byCategory: Partial<Record<AssetCategoryKey, number>> = {};

    for (const account of usdAccounts) {
      const signed = perAccount.get(account.id)?.get(dayIso);
      if (signed === undefined) continue;

      if (signed > 0) totalAssets += signed;
      else if (signed < 0) totalLiabilities += -signed;

      if (signed > 0) {
        const category = assetCategoryFor(account.type);
        if (category) {
          byCategory[category] = (byCategory[category] ?? 0) + signed;
        }
      }
    }

    rowsByDate.set(dayIso, { totalAssets, totalLiabilities, byCategory });
  }

  // Find dates that already have a sync-source row; never overwrite those.
  const { data: existingSync, error: syncErr } = await supabase
    .from("net_worth_snapshots")
    .select("date")
    .eq("user_id", userId)
    .eq("source", "sync")
    .gte("date", oldestIso)
    .lte("date", todayIso);
  if (syncErr) throw syncErr;
  const syncDates = new Set(
    ((existingSync ?? []) as { date: string }[]).map((r) => r.date),
  );

  // Build the upsert payload. Skip today if it'll likely be overwritten by
  // the sync snapshot in the same flow (also handled by the sync row
  // winning on `source` priority below).
  const payload = [...rowsByDate.entries()]
    .filter(([date]) => !syncDates.has(date))
    .map(([date, totals]) => ({
      user_id: userId,
      date,
      total_assets: totals.totalAssets,
      total_liabilities: totals.totalLiabilities,
      net_worth: totals.totalAssets - totals.totalLiabilities,
      breakdown: totals.byCategory,
      source: "backfill" as const,
    }));

  if (payload.length === 0) {
    return {
      written: 0,
      daysCovered: rowsByDate.size,
      accountsUsed: usdAccounts.length,
    };
  }

  const { error: upsertErr } = await supabase
    .from("net_worth_snapshots")
    .upsert(payload, { onConflict: "user_id,date" });
  if (upsertErr) throw upsertErr;

  return {
    written: payload.length,
    daysCovered: rowsByDate.size,
    accountsUsed: usdAccounts.length,
  };
}

// ---------------------------------------------------------------------------
// rebuildSnapshots
// ---------------------------------------------------------------------------

/**
 * Re-anchor the ENTIRE net-worth history to the user's CURRENT account set.
 *
 * Why this exists: every snapshot row (`backfill` AND `sync`) is computed from
 * whatever accounts were linked at the moment it was written. When the account
 * roster changes (most commonly a relink that surfaces a previously-unlinked
 * liability like a mortgage or student loan, or a new investment account) every
 * historical row becomes stale: it omits the new account entirely. The chart then
 * shows a discontinuous "cliff" on the first day the new account appears, e.g.
 * net worth jumps from +$81k to -$40k overnight when a $56k mortgage + $65k loan
 * get linked.
 *
 * This wipes the user's snapshots and regenerates them from current balances: a
 * `days`-long `backfill` walk plus today's accurate `sync` row. The result is one
 * continuous series that reflects today's full account roster.
 *
 * Trade-off: real day-over-day `sync` deltas recorded before the rebuild are
 * discarded. That's intentional: those rows were computed against an incomplete
 * roster, so a continuous estimate is more honest than a discontinuous "accurate"
 * line. Call this on link/relink, when the account set is known to have changed.
 */
export async function rebuildSnapshots(
  userId: string,
  days = 365,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("net_worth_snapshots")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;

  // backfill writes `backfill` rows for today..today-days; recordTodaysSnapshot
  // then overwrites today with the accurate `sync` row (onConflict user_id,date).
  await backfillSnapshots(userId, days);
  await recordTodaysSnapshot(userId);
}

// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

/**
 * Did this user ever have a snapshot persisted? Used to decide whether
 * the initial backfill should run on first sync.
 */
export async function hasAnySnapshot(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("net_worth_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Does this user have at least one `source='backfill'` row? Used by the
 * manual "Sync now" path to decide whether to kick off a one-time
 * historical backfill (the first-link path in `exchangePublicToken`
 * also covers this, but only fires on the *very* first connection ever).
 */
export async function hasAnyBackfillSnapshot(
  userId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("net_worth_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "backfill");
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// getAccountActivityForWindow
// ---------------------------------------------------------------------------

/** Supported windows for the Net Worth "Account activity" card. */
export type ActivityWindowDays = 7 | 14 | 30 | 90;

const ACTIVITY_WINDOW_VALUES: ReadonlySet<number> = new Set([7, 14, 30, 90]);

/**
 * Normalize a raw `?activityDays=` query string into a supported window.
 * Falls back to 7 days for anything missing or invalid.
 */
export function resolveActivityDays(
  raw: string | string[] | undefined,
): ActivityWindowDays {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return 7;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 7;
  return (ACTIVITY_WINDOW_VALUES.has(parsed)
    ? parsed
    : 7) as ActivityWindowDays;
}

/**
 * Per-account signed-balance delta over a rolling window, derived from the
 * same transaction stream the backfill walker uses. One entry per active
 * USD Plaid account.
 *
 * Math (same convention as `backfillSnapshots`):
 *   delta = sum(credits) - sum(debits)  // over the window
 *   prior = current - delta
 *   pct   = abs(prior) > 0 ? delta / abs(prior) * 100 : 0
 *
 * Excludes pending transactions and transfer-like categories so that
 * inter-account moves don't appear as "growth" on one account or "loss"
 * on another.
 *
 * Investment / retirement accounts with ZERO qualifying transactions in
 * the window get `noActivity: true`. This is the honest signal that the
 * account's balance may have moved due to market prices we don't track,
 * not that nothing happened. UI surfaces these distinctly.
 *
 * Manual (non-Plaid) accounts and non-USD accounts are excluded.
 */
export interface AccountActivityEntry {
  account: AccountRow;
  current: number;
  prior: number;
  delta: number;
  pct: number;
  noActivity: boolean;
}

export async function getAccountActivityForWindow(
  userId: string,
  days: ActivityWindowDays,
): Promise<AccountActivityEntry[]> {
  const accounts = await listAccounts(userId);
  const eligible = accounts.filter(
    (a) => a.currency_code === "USD" && a.provider === "plaid",
  );
  if (eligible.length === 0) return [];

  const today = new Date();
  // Inclusive window: today + (days - 1) prior days.
  const since = isoDateUtc(addDaysUtc(today, -(days - 1)));
  const accountIds = eligible.map((a) => a.id);

  const supabase = await createClient();
  const { data: txRows, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .in("account_id", accountIds)
    .gte("date", since)
    .range(0, 9999);
  if (error) throw error;

  const txByAccount = new Map<string, TransactionRow[]>();
  for (const row of (txRows ?? []) as TransactionRow[]) {
    if (row.pending) continue;
    if (row.currency_code !== "USD") continue;
    if (isExcludedFromSpending(row.category, row.subcategory, row.name)) continue;
    const list = txByAccount.get(row.account_id);
    if (list) list.push(row);
    else txByAccount.set(row.account_id, [row]);
  }

  const entries: AccountActivityEntry[] = [];
  for (const account of eligible) {
    const txs = txByAccount.get(account.id) ?? [];

    let credits = 0;
    let debits = 0;
    for (const tx of txs) {
      const amt = Number(tx.amount);
      if (!Number.isFinite(amt)) continue;
      if (tx.type === "credit") credits += amt;
      else debits += amt;
    }

    const delta = credits - debits;
    const current = signedBalance(account);
    const prior = current - delta;
    const pct =
      Math.abs(prior) > 0 ? (delta / Math.abs(prior)) * 100 : 0;
    const isInvestmentLike =
      account.type === "investment" || account.type === "retirement";
    const noActivity = isInvestmentLike && txs.length === 0;

    entries.push({
      account,
      current,
      prior,
      delta,
      pct,
      noActivity,
    });
  }

  return entries;
}
