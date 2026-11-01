/**
 * Transaction DB helpers.
 *
 * The unique index `idx_transactions_provider` on
 * (account_id, provider_transaction_id) is partial (WHERE provider_transaction_id
 * IS NOT NULL). PostgREST doesn't reliably support upsert against partial
 * unique indexes, so we split the work explicitly:
 *
 *   - `added`    -> bulk insert
 *   - `modified` -> per-row update keyed by (account_id, provider_transaction_id)
 *   - `removed`  -> bulk delete by provider_transaction_id
 *
 * The Plaid /transactions/sync cursor ensures we don't re-receive the same
 * `added` row, so straightforward inserts are correct in normal operation.
 */
import { createClient } from "@/lib/supabase/server";
import { isExcludedFromSpending } from "@/domain/spending";
import { classifyCategory, categoryOrder } from "@/domain/category-taxonomy";

export interface TransactionRow {
  id: string;
  account_id: string;
  user_id: string;
  provider_transaction_id: string | null;
  amount: number;
  currency_code: string;
  date: string; // YYYY-MM-DD
  name: string;
  merchant_name: string | null;
  category: string | null;
  subcategory: string | null;
  pending: boolean;
  type: "debit" | "credit";
  created_at: string;
}

export interface InsertTransactionInput {
  userId: string;
  accountId: string;
  providerTransactionId: string;
  amount: number;
  currencyCode: string;
  date: string;
  name: string;
  merchantName: string | null;
  category: string | null;
  subcategory: string | null;
  pending: boolean;
  type: "debit" | "credit";
}

function toRow(input: InsertTransactionInput) {
  return {
    user_id: input.userId,
    account_id: input.accountId,
    provider_transaction_id: input.providerTransactionId,
    amount: input.amount,
    currency_code: input.currencyCode,
    date: input.date,
    name: input.name,
    merchant_name: input.merchantName,
    category: input.category,
    subcategory: input.subcategory,
    pending: input.pending,
    type: input.type,
  };
}

export async function insertTransactions(
  rows: InsertTransactionInput[]
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .insert(rows.map(toRow));
  if (error) throw error;
}

export async function updateTransactions(
  rows: InsertTransactionInput[]
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = await createClient();
  for (const row of rows) {
    const { error } = await supabase
      .from("transactions")
      .update(toRow(row))
      .eq("account_id", row.accountId)
      .eq("provider_transaction_id", row.providerTransactionId);
    if (error) throw error;
  }
}

export async function deleteTransactionsByProviderIds(
  providerTransactionIds: string[]
): Promise<void> {
  if (providerTransactionIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .in("provider_transaction_id", providerTransactionIds);
  if (error) throw error;
}

export async function deleteTransactionsByAccount(
  accountId: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("account_id", accountId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD in UTC. We use UTC to keep month boundaries
 * stable across local timezones; this is fine because Plaid stores
 * transaction dates as plain dates with no time component.
 */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First day of the calendar month containing `d` (UTC). */
function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First day of the month `monthsAfter` months after `d` (UTC). */
function addMonthsUtc(d: Date, monthsAfter: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsAfter, 1));
}

/**
 * IDs of the user's currently-active accounts. Transaction reads filter on
 * these so that unlinking a connection (which deactivates its accounts
 * rather than hard-deleting them) also hides that account's transactions
 * from spending and recent-activity views, mirroring how holdings and the
 * net-worth/snapshot helpers already gate on `is_active`.
 */
async function activeAccountIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export interface ListTransactionsOptions {
  /** Inclusive lower bound, YYYY-MM-DD. */
  startDate?: string;
  /** Exclusive upper bound, YYYY-MM-DD. */
  endDate?: string;
  limit?: number;
}

/**
 * List a user's transactions, most recent first. Default cap is 100 to keep
 * page renders snappy; callers wanting all rows for a date range should
 * pass an explicit higher limit.
 */
export async function listTransactions(
  userId: string,
  opts: ListTransactionsOptions = {}
): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const accountIds = await activeAccountIds(supabase, userId);
  if (accountIds.length === 0) return [];
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .in("account_id", accountIds)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts.startDate) query = query.gte("date", opts.startDate);
  if (opts.endDate) query = query.lt("date", opts.endDate);

  const limit = opts.limit ?? 100;
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

/**
 * Fetch every transaction in [startDate, endDate). Used by aggregation
 * helpers below. Bounded at 10k rows per range; if a user has more than
 * that in a single month, the trend/category numbers may be incomplete.
 */
async function fetchTransactionsInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const accountIds = await activeAccountIds(supabase, userId);
  if (accountIds.length === 0) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .in("account_id", accountIds)
    .gte("date", startDate)
    .lt("date", endDate)
    .range(0, 9999);
  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

/**
 * Sum of debit transactions in [startDate, endDate), excluding categories
 * that represent money movement (transfers, loan payments).
 */
export async function getSpendingForRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const rows = await fetchTransactionsInRange(userId, startDate, endDate);
  let total = 0;
  for (const row of rows) {
    if (row.type !== "debit") continue;
    if (row.currency_code !== "USD") continue;
    if (isExcludedFromSpending(row.category, row.subcategory, row.name)) continue;
    total += Number(row.amount);
  }
  return total;
}

/** Sum of debit transactions in the current calendar month (UTC). */
export async function getSpendingThisMonth(userId: string): Promise<number> {
  const now = new Date();
  const start = isoDate(startOfMonthUtc(now));
  const end = isoDate(addMonthsUtc(now, 1));
  return getSpendingForRange(userId, start, end);
}

export interface CategorySpending {
  category: string; // friendly category key (see category-taxonomy.ts)
  amount: number;
  count: number;
}

/**
 * Aggregate spending by friendly category for [startDate, endDate). Returns
 * rows sorted by amount desc. Transfers, card payments and income are excluded.
 */
export async function getSpendingByCategoryForRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CategorySpending[]> {
  const rows = await fetchTransactionsInRange(userId, startDate, endDate);
  const buckets = new Map<string, { amount: number; count: number }>();

  for (const row of rows) {
    if (row.type !== "debit") continue;
    if (row.currency_code !== "USD") continue;
    const cls = classifyCategory(row);
    if (!cls.isSpending) continue;
    const bucket = buckets.get(cls.key) ?? { amount: 0, count: 0 };
    bucket.amount += Number(row.amount);
    bucket.count += 1;
    buckets.set(cls.key, bucket);
  }

  return [...buckets.entries()]
    .map(([category, b]) => ({ category, amount: b.amount, count: b.count }))
    .sort((a, b) => b.amount - a.amount);
}

/** Spending by category for the current calendar month (UTC). */
export async function getSpendingByCategoryThisMonth(
  userId: string
): Promise<CategorySpending[]> {
  const now = new Date();
  const start = isoDate(startOfMonthUtc(now));
  const end = isoDate(addMonthsUtc(now, 1));
  return getSpendingByCategoryForRange(userId, start, end);
}

// ---------------------------------------------------------------------------
// Spending page helpers
// ---------------------------------------------------------------------------

export type SpendingRange =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_12_months"
  | "all_time";

/**
 * Resolve a `SpendingRange` keyword into a `[startDate, endDate)` pair of
 * YYYY-MM-DD strings (end is exclusive). Used by the category-pie filter
 * on the Spending page so callers don't have to repeat the date math.
 *
 * `all_time` returns a sentinel `startDate=""`: `fetchTransactionsInRange`
 * won't accept that, so the category-helper variant for `all_time` skips
 * the start-bound entirely.
 */
export function resolveSpendingRange(
  range: SpendingRange,
  now: Date = new Date(),
): { startDate: string | null; endDate: string } {
  const currentMonthStart = startOfMonthUtc(now);
  const nextMonthStart = addMonthsUtc(currentMonthStart, 1);
  switch (range) {
    case "this_month":
      return {
        startDate: isoDate(currentMonthStart),
        endDate: isoDate(nextMonthStart),
      };
    case "last_month":
      return {
        startDate: isoDate(addMonthsUtc(currentMonthStart, -1)),
        endDate: isoDate(currentMonthStart),
      };
    case "last_3_months":
      return {
        startDate: isoDate(addMonthsUtc(currentMonthStart, -2)),
        endDate: isoDate(nextMonthStart),
      };
    case "last_12_months":
      return {
        startDate: isoDate(addMonthsUtc(currentMonthStart, -11)),
        endDate: isoDate(nextMonthStart),
      };
    case "all_time":
      return { startDate: null, endDate: isoDate(nextMonthStart) };
  }
}

export function spendingRangeLabel(range: SpendingRange): string {
  switch (range) {
    case "this_month":
      return "This month";
    case "last_month":
      return "Last month";
    case "last_3_months":
      return "Last 3 months";
    case "last_12_months":
      return "Last 12 months";
    case "all_time":
      return "All time";
  }
}

/**
 * Variant of `getSpendingByCategoryForRange` that supports an open-ended
 * (null start) range for "All time". The bounded path is preferred; open
 * range can pull a lot of rows.
 */
export async function getSpendingByCategoryForSpendingRange(
  userId: string,
  range: SpendingRange,
): Promise<CategorySpending[]> {
  const { startDate, endDate } = resolveSpendingRange(range);
  const supabase = await createClient();
  const accountIds = await activeAccountIds(supabase, userId);
  if (accountIds.length === 0) return [];

  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .in("account_id", accountIds)
    .lt("date", endDate)
    .range(0, 9999);
  if (startDate) query = query.gte("date", startDate);

  const { data, error } = await query;
  if (error) throw error;

  const buckets = new Map<string, { amount: number; count: number }>();
  for (const row of (data ?? []) as TransactionRow[]) {
    if (row.type !== "debit") continue;
    if (row.currency_code !== "USD") continue;
    const cls = classifyCategory(row);
    if (!cls.isSpending) continue;
    const bucket = buckets.get(cls.key) ?? { amount: 0, count: 0 };
    bucket.amount += Number(row.amount);
    bucket.count += 1;
    buckets.set(cls.key, bucket);
  }

  return [...buckets.entries()]
    .map(([category, b]) => ({ category, amount: b.amount, count: b.count }))
    .sort((a, b) => b.amount - a.amount);
}

export interface MonthlySpendTotal {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  /** Spending total (debits, transfers excluded). */
  total: number;
  /** Number of qualifying transactions. */
  txCount: number;
  /** True if this is the (incomplete) current calendar month. */
  isCurrentMonth: boolean;
}

/**
 * Last `months` calendar months of spending totals + transaction counts,
 * ordered oldest -> newest. The most recent entry is the current
 * (incomplete) month.
 *
 * Differs from `getMonthlySpendingTrend` by including a transaction count
 * per month, which the new column chart uses for the on-hover detail.
 */
export async function getMonthlySpendTotals(
  userId: string,
  months: number,
): Promise<MonthlySpendTotal[]> {
  if (months < 1) return [];
  const now = new Date();
  const currentMonthStart = startOfMonthUtc(now);
  const trendStart = addMonthsUtc(currentMonthStart, -(months - 1));
  const trendEnd = addMonthsUtc(currentMonthStart, 1);

  const rows = await fetchTransactionsInRange(
    userId,
    isoDate(trendStart),
    isoDate(trendEnd),
  );

  const points: MonthlySpendTotal[] = [];
  const monthIndex = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const monthDate = addMonthsUtc(trendStart, i);
    const key = isoDate(monthDate);
    monthIndex.set(key, points.length);
    points.push({
      month: key,
      total: 0,
      txCount: 0,
      isCurrentMonth: key === isoDate(currentMonthStart),
    });
  }

  for (const row of rows) {
    if (row.type !== "debit") continue;
    if (row.currency_code !== "USD") continue;
    if (isExcludedFromSpending(row.category, row.subcategory, row.name)) continue;
    const monthKey = row.date.slice(0, 7) + "-01";
    const idx = monthIndex.get(monthKey);
    if (idx !== undefined) {
      points[idx].total += Number(row.amount);
      points[idx].txCount += 1;
    }
  }

  return points;
}

export interface PaginatedTransactions {
  rows: TransactionRow[];
  totalCount: number;
}

/**
 * Server-side pagination for the Spending page transactions table.
 * Returns a page-sized slice plus the total matching count so the UI
 * can render "Page X of Y". Most-recent-first.
 *
 * Optional `category` filters to a single *friendly* category key (see
 * `category-taxonomy.ts`) so the donut's slices and the table filter agree.
 * Friendly classification depends on the transaction name (checks), so it
 * can't be pushed into PostgREST; we load the active-account rows and
 * classify + filter + page in memory. Personal-finance data sets are small
 * enough that this is fine; the fetch is capped at 10k rows.
 *
 * Optional `range` bounds the rows to the same date window the spending
 * donut uses (`resolveSpendingRange`), so the table and the donut stay in
 * sync when either period selector changes.
 */
export async function listTransactionsPaged(
  userId: string,
  opts: {
    pageSize: number;
    offset: number;
    category?: string | null;
    range?: SpendingRange;
  },
): Promise<PaginatedTransactions> {
  const supabase = await createClient();
  const accountIds = await activeAccountIds(supabase, userId);
  if (accountIds.length === 0) return { rows: [], totalCount: 0 };

  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .in("account_id", accountIds)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts.range) {
    const { startDate, endDate } = resolveSpendingRange(opts.range);
    query = query.lt("date", endDate);
    if (startDate) query = query.gte("date", startDate);
  }

  const { data, error } = await query.range(0, 9999);
  if (error) throw error;

  let all = (data ?? []) as TransactionRow[];
  if (opts.category) {
    all = all.filter((row) => classifyCategory(row).key === opts.category);
  }

  const from = Math.max(0, opts.offset);
  const to = from + Math.max(1, opts.pageSize);
  return {
    rows: all.slice(from, to),
    totalCount: all.length,
  };
}

/**
 * Distinct *friendly* transaction categories across the user's active
 * accounts, sorted by their taxonomy order. Each maps 1:1 to a value the
 * table filter passes back to `listTransactionsPaged`. The donut's display-
 * only "Other Spending" umbrella is intentionally not included here.
 */
export async function listTransactionCategories(
  userId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const accountIds = await activeAccountIds(supabase, userId);
  if (accountIds.length === 0) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("category, subcategory, name")
    .eq("user_id", userId)
    .in("account_id", accountIds);
  if (error) throw error;

  const seen = new Set<string>();
  for (const row of (data ?? []) as Pick<
    TransactionRow,
    "category" | "subcategory" | "name"
  >[]) {
    seen.add(classifyCategory(row).key);
  }

  return Array.from(seen).sort((a, b) => categoryOrder(a) - categoryOrder(b));
}
