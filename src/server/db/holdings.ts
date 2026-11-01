/**
 * Holdings DB helpers.
 *
 * Holdings are per-user, per-account, per-security positions. Plaid is the
 * source of truth for "what does the user currently own", so the sync
 * pattern is `replaceHoldingsForAccount` (atomic delete-then-insert) rather
 * than upsert; that way sold-off positions correctly disappear instead of
 * lingering as stale rows.
 */
import { createClient } from "@/lib/supabase/server";
import { getSecuritiesByIds } from "@/server/db/securities";
import { listAccounts, type AccountRow } from "@/server/db/accounts";

export interface HoldingRow {
  id: string;
  account_id: string;
  user_id: string;
  security_id: string | null;
  quantity: number;
  cost_basis: number | null;
  current_value: number;
  currency_code: string;
  as_of: string;
  created_at: string;
  updated_at: string;
}

/** A holding row joined with its security + the owning account name. */
export interface HoldingWithSecurity extends HoldingRow {
  security: {
    id: string;
    ticker_symbol: string | null;
    name: string;
    type: string;
    latest_price: number | null;
    latest_price_date: string | null;
    asset_class: string;
  } | null;
  account_name: string;
  account_id_for_display: string;
}

/**
 * Replace every holding for a given (user, account) pair with the new set.
 * Done as delete-all + insert-all so positions sold since the last sync
 * disappear from the table. Wrapped in a single Supabase request pair
 * (not a true transaction), but the window is small enough for our purposes
 * (no concurrent reads during sync).
 */
export async function replaceHoldingsForAccount(
  userId: string,
  accountId: string,
  holdings: Array<{
    securityId: string;
    quantity: number;
    costBasis: number | null;
    currentValue: number;
    currencyCode: string;
    asOf: string;
  }>,
): Promise<void> {
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("holdings")
    .delete()
    .eq("account_id", accountId)
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (holdings.length === 0) return;

  const payload = holdings.map((h) => ({
    account_id: accountId,
    user_id: userId,
    security_id: h.securityId,
    quantity: h.quantity,
    cost_basis: h.costBasis,
    current_value: h.currentValue,
    currency_code: h.currencyCode,
    as_of: h.asOf,
  }));

  const { error: insertError } = await supabase
    .from("holdings")
    .insert(payload);
  if (insertError) throw insertError;
}

/**
 * List all holdings for a user, joined with security + account metadata.
 * Filters out holdings for inactive accounts so unlinked connections
 * don't pollute the view.
 */
export async function listHoldings(
  userId: string,
): Promise<HoldingWithSecurity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holdings")
    .select(
      `
      *,
      account:accounts!inner(id, name, is_active)
      `,
    )
    .eq("user_id", userId)
    .eq("account.is_active", true)
    .order("current_value", { ascending: false });
  if (error) throw error;

  type RawRow = HoldingRow & {
    account: { id: string; name: string; is_active: boolean } | null;
  };
  const rows = (data ?? []) as RawRow[];

  // `securities` lives behind RLS that the authenticated role can't read, so
  // it can't be joined in the query above. Fetch the referenced securities
  // with the service-role client and stitch them in.
  const securityIds = Array.from(
    new Set(
      rows
        .map((r) => r.security_id)
        .filter((id): id is string => id !== null),
    ),
  );
  const securityMap = await getSecuritiesByIds(securityIds);

  return rows.map((r) => ({
    ...r,
    security: r.security_id ? securityMap.get(r.security_id) ?? null : null,
    account_name: r.account?.name ?? "Account",
    account_id_for_display: r.account?.id ?? r.account_id,
  }));
}

export interface PortfolioSummary {
  /** USD holdings value + investment-adjacent cash (the headline "Assets" total). */
  portfolioValue: number;
  /** Sum of `current_value` across all USD holdings (excludes cash). */
  holdingsValue: number;
  /** Investment-adjacent cash included in `portfolioValue` (e.g. a brokerage cash management account). */
  cashValue: number;
  /** Sum of `cost_basis` (only counts holdings WITH a cost basis). */
  totalCostBasis: number;
  /** True if any holding had no cost_basis, used for the UI caveat. */
  costBasisMissing: boolean;
  /** True if any holdings were skipped from totals due to non-USD currency. */
  hadNonUsdHoldings: boolean;
  /** Number of distinct accounts contributing to the total (holdings + cash). */
  accountCount: number;
  /** Number of distinct holdings rows contributing to the total. */
  holdingCount: number;
}

/**
 * Identify the active accounts whose *cash balance* (not holdings) should count
 * toward the portfolio/assets total. Two cases:
 *
 *   1. Investment-adjacent cash, e.g. a brokerage "cash management" account
 *      that Plaid stores as `type: "other"` with no holdings. We only pull in
 *      such `other` accounts when they sit at an institution that ALSO has an
 *      investment/retirement account, so we don't sweep in unrelated misc
 *      balances at a plain checking-only bank.
 *   2. Investment/retirement accounts with no synced holdings (e.g. a stock-plan
 *      account Plaid reports as a balance only); fall back to the account
 *      balance so the position isn't silently valued at $0.
 *
 * Accounts that already contribute via holdings are skipped (the caller passes
 * the set of holding account IDs) to avoid double counting. Non-USD and
 * non-positive balances are ignored.
 */
export async function getPortfolioCashByAccount(
  userId: string,
  holdingsAccountIds: Set<string>,
): Promise<Map<string, { account: AccountRow; cash: number }>> {
  const accounts = await listAccounts(userId);
  const investmentInstitutions = new Set(
    accounts
      .filter((a) => a.type === "investment" || a.type === "retirement")
      .map((a) => a.institution_name ?? `__acct_${a.id}`),
  );

  const result = new Map<string, { account: AccountRow; cash: number }>();
  for (const a of accounts) {
    if (a.currency_code !== "USD") continue;
    if (holdingsAccountIds.has(a.id)) continue;

    const isInvestmentCore =
      a.type === "investment" || a.type === "retirement";
    const isAdjacentCash =
      a.type === "other" &&
      investmentInstitutions.has(a.institution_name ?? `__acct_${a.id}`);
    if (!isInvestmentCore && !isAdjacentCash) continue;

    const cash = Number(a.current_balance ?? 0);
    if (cash <= 0) continue;
    result.set(a.id, { account: a, cash });
  }
  return result;
}

/**
 * Aggregate portfolio value + cost basis across a user's holdings, plus any
 * investment-adjacent cash (see `getPortfolioCashByAccount`).
 * Mirrors `getNetWorthBreakdown`'s "skip non-USD, flag it" approach.
 */
export async function getPortfolioSummary(
  userId: string,
): Promise<PortfolioSummary> {
  const holdings = await listHoldings(userId);

  let holdingsValue = 0;
  let totalCostBasis = 0;
  let costBasisMissing = false;
  let hadNonUsdHoldings = false;
  const accountIds = new Set<string>();

  for (const h of holdings) {
    if (h.currency_code !== "USD") {
      hadNonUsdHoldings = true;
      continue;
    }
    holdingsValue += Number(h.current_value);
    if (h.cost_basis == null) {
      costBasisMissing = true;
    } else {
      totalCostBasis += Number(h.cost_basis);
    }
    accountIds.add(h.account_id);
  }

  const cashByAccount = await getPortfolioCashByAccount(userId, accountIds);
  let cashValue = 0;
  for (const { cash } of cashByAccount.values()) cashValue += cash;

  return {
    portfolioValue: holdingsValue + cashValue,
    holdingsValue,
    cashValue,
    totalCostBasis,
    costBasisMissing,
    hadNonUsdHoldings,
    accountCount: accountIds.size + cashByAccount.size,
    holdingCount: holdings.length,
  };
}

export interface AssetClassBucket {
  assetClass: string;
  value: number;
  pct: number;
}

/**
 * Group portfolio value by asset class for the asset-allocation chart.
 * Investment-adjacent cash (brokerage cash-management accounts, etc.) is
 * folded into a "cash" bucket so the allocation totals match the headline
 * portfolio value. Skips non-USD holdings (same FX limitation as everywhere).
 */
export async function getAssetAllocation(
  userId: string,
): Promise<AssetClassBucket[]> {
  const holdings = await listHoldings(userId);

  const byClass = new Map<string, number>();
  let total = 0;
  const holdingAccountIds = new Set<string>();
  for (const h of holdings) {
    if (h.currency_code !== "USD") continue;
    const cls = h.security?.asset_class ?? "other";
    const value = Number(h.current_value);
    byClass.set(cls, (byClass.get(cls) ?? 0) + value);
    total += value;
    holdingAccountIds.add(h.account_id);
  }

  const cashByAccount = await getPortfolioCashByAccount(
    userId,
    holdingAccountIds,
  );
  let cash = 0;
  for (const { cash: c } of cashByAccount.values()) cash += c;
  if (cash > 0) {
    byClass.set("cash", (byClass.get("cash") ?? 0) + cash);
    total += cash;
  }

  return Array.from(byClass.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export interface HoldingMover {
  id: string;
  /** Ticker if known, otherwise the security name. */
  symbol: string;
  name: string;
  accountName: string;
  /** Current market value (institution value) of the position. */
  value: number;
  /** Latest per-share price (institution price = value / quantity). */
  price: number | null;
  /** value − quantity × prior-close = qty × (instPrice − closePrice). */
  dayChange: number;
  /** dayChange as a % of the prior-close basis. */
  dayChangePct: number;
}

export interface PortfolioDayChange {
  /** Σ dayChange over holdings that have a usable prior close. */
  totalChange: number;
  /** totalChange as a % of the prior-close basis. */
  totalChangePct: number;
  /** Σ quantity × prior-close (the denominator for the % above). */
  priorValue: number;
  /** Σ current value of holdings that contributed to the change. */
  coveredValue: number;
  /** True if at least one holding had a usable prior close to compare. */
  hasPriceData: boolean;
  /** Most recent price date across contributing holdings (YYYY-MM-DD). */
  asOf: string | null;
  /** Positive movers, largest gain first. */
  gainers: HoldingMover[];
  /** Negative movers, largest loss first. */
  losers: HoldingMover[];
}

// Ignore sub-cent noise when classifying a holding as a gainer/loser.
const DAY_CHANGE_EPSILON = 0.005;

/**
 * Compute the portfolio's change since the prior market close, plus the
 * per-holding top/bottom movers.
 *
 * Plaid gives us two prices per position: the security's `close_price`
 * (prior session close, stored as `securities.latest_price`) and the
 * institution's current price (folded into the holding's `current_value`,
 * since `current_value = quantity × institution_price`). The day change is
 * therefore `current_value − quantity × close_price` per holding.
 *
 * Honest caveat: some institutions only report
 * end-of-day prices, so their `institution_price` equals `close_price` and
 * those holdings contribute ~$0 until the next session rolls the close
 * forward. Holdings with no prior close (many money-market / 401k custom
 * funds) are skipped entirely; we can't know their daily move.
 */
export async function getPortfolioDayChange(
  userId: string,
): Promise<PortfolioDayChange> {
  const holdings = await listHoldings(userId);

  let totalChange = 0;
  let priorValue = 0;
  let coveredValue = 0;
  let asOf: string | null = null;
  const movers: HoldingMover[] = [];

  for (const h of holdings) {
    if (h.currency_code !== "USD") continue;
    const qty = Number(h.quantity);
    const value = Number(h.current_value);
    const close = h.security?.latest_price;
    if (close == null || qty === 0) continue; // no prior close → can't compare

    const closeNum = Number(close);
    const priorVal = qty * closeNum;
    const change = value - priorVal;

    priorValue += priorVal;
    coveredValue += value;
    totalChange += change;

    const priceDate = h.security?.latest_price_date ?? h.as_of ?? null;
    if (priceDate && (!asOf || priceDate > asOf)) asOf = priceDate;

    movers.push({
      id: h.id,
      symbol: h.security?.ticker_symbol ?? h.security?.name ?? "–",
      name: h.security?.name ?? "–",
      accountName: h.account_name,
      value,
      price: qty !== 0 ? value / qty : null,
      dayChange: change,
      dayChangePct: priorVal !== 0 ? (change / priorVal) * 100 : 0,
    });
  }

  const gainers = movers
    .filter((m) => m.dayChange > DAY_CHANGE_EPSILON)
    .sort((a, b) => b.dayChange - a.dayChange);
  const losers = movers
    .filter((m) => m.dayChange < -DAY_CHANGE_EPSILON)
    .sort((a, b) => a.dayChange - b.dayChange);

  return {
    totalChange,
    totalChangePct: priorValue > 0 ? (totalChange / priorValue) * 100 : 0,
    priorValue,
    coveredValue,
    hasPriceData: priorValue > 0,
    asOf,
    gainers,
    losers,
  };
}

/**
 * A user's portfolio organized by account, so the Assets
 * page can render holdings grouped under their owning account with per-account
 * subtotals. Accounts with no priced holdings (e.g. a brokerage cash management
 * account or a balance-only stock plan) appear as a cash-only group.
 */
export interface PortfolioAccountGroup {
  accountId: string;
  accountName: string;
  institutionName: string | null;
  accountType: AccountRow["type"];
  /** Holdings in this account (USD + non-USD), value-sorted by listHoldings. */
  holdings: HoldingWithSecurity[];
  /** Cash/balance counted for an account with no priced holdings. */
  cashValue: number;
  /** Σ USD holdings value + cashValue. */
  subtotal: number;
  /** True if this group has non-USD holdings excluded from the subtotal. */
  hadNonUsdHoldings: boolean;
}

/**
 * Build the per-account portfolio view: holdings grouped under their account,
 * plus cash-only groups for investment-adjacent accounts without holdings.
 * Sorted by subtotal DESC so the biggest accounts lead.
 */
export async function getPortfolioAccounts(
  userId: string,
): Promise<PortfolioAccountGroup[]> {
  const [holdings, accounts] = await Promise.all([
    listHoldings(userId),
    listAccounts(userId),
  ]);
  const acctById = new Map(accounts.map((a) => [a.id, a] as const));
  const groups = new Map<string, PortfolioAccountGroup>();

  for (const h of holdings) {
    let g = groups.get(h.account_id);
    if (!g) {
      const a = acctById.get(h.account_id);
      g = {
        accountId: h.account_id,
        accountName: a?.name ?? h.account_name,
        institutionName: a?.institution_name ?? null,
        accountType: a?.type ?? "investment",
        holdings: [],
        cashValue: 0,
        subtotal: 0,
        hadNonUsdHoldings: false,
      };
      groups.set(h.account_id, g);
    }
    g.holdings.push(h);
    if (h.currency_code === "USD") g.subtotal += Number(h.current_value);
    else g.hadNonUsdHoldings = true;
  }

  const cashByAccount = await getPortfolioCashByAccount(
    userId,
    new Set(groups.keys()),
  );
  for (const { account, cash } of cashByAccount.values()) {
    const existing = groups.get(account.id);
    if (existing) {
      existing.cashValue += cash;
      existing.subtotal += cash;
    } else {
      groups.set(account.id, {
        accountId: account.id,
        accountName: account.name,
        institutionName: account.institution_name,
        accountType: account.type,
        holdings: [],
        cashValue: cash,
        subtotal: cash,
        hadNonUsdHoldings: false,
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.subtotal - a.subtotal);
}

/**
 * True iff the user has any holdings linked to any of their active
 * investment-type accounts. Cheap one-row probe used for empty-state UI.
 */
export async function userHasAnyHoldings(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("holdings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * True if the user has at least one active investment-flavored account
 * (investment or retirement). Used to decide whether the Investments page
 * should show the rich UI or the "link an account" CTA.
 */
export function hasInvestmentAccount(accounts: AccountRow[]): boolean {
  return accounts.some(
    (a) =>
      a.is_active && (a.type === "investment" || a.type === "retirement"),
  );
}
