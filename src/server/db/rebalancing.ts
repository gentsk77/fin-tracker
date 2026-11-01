/**
 * Rebalancing engine.
 *
 * `getRebalanceState(userId)` is the single entry point. It classifies the
 * user's holdings + investment-adjacent cash into account buckets (taxable vs
 * tax-advantaged) and sleeves, then computes per-bucket drift vs target and a
 * tax-aware list of suggested actions.
 *
 * Design:
 *  - Taxable: carve out a fixed cash/CD reserve, cap any configured single
 *    stock at a % of the whole portfolio, and fund underweight sleeves with
 *    NEW money (freed cash + the single-stock trim) before ever selling an
 *    appreciated position.
 *  - Tax-advantaged: target-date fund is a self-balancing set-aside; the rest
 *    rebalances freely (no tax on sales), so under/over-weights are fully
 *    closed. 401k fund-menu limits are surfaced as a caveat.
 */
import { listHoldings, getPortfolioCashByAccount } from "@/server/db/holdings";
import { listAccounts } from "@/server/db/accounts";
import { getRebalanceConfig } from "@/server/db/rebalancing-targets";
import {
  bucketForAccount,
  sleeveForSecurity,
  sleeveColor,
  sleeveLabel,
  sleeveOrder,
  REPRESENTATIVE_TICKER,
  TARGET_SLEEVES,
  type BucketKey,
  type SleeveKey,
} from "@/domain/sleeves";
import type { RebalanceSettings, TargetMix } from "@/domain/rebalance-config";

/** Drift bands (5/25 rule): flag a sleeve when it strays this far from target. */
const DRIFT_BAND_POINTS = 5;
const DRIFT_BAND_RELATIVE = 0.25;
/** Suggested trades below this dollar amount are noise; don't surface them. */
const MIN_ACTION_USD = 100;

export type ActionKind = "buy" | "trim" | "free_cash" | "note";

export interface RebalanceAction {
  kind: ActionKind;
  sleeve: SleeveKey | null;
  ticker: string | null;
  /** Always a positive magnitude (the UI decides +/− framing from `kind`). */
  amount: number;
  label: string;
}

export interface SleeveDrift {
  sleeve: SleeveKey;
  label: string;
  color: string;
  currentValue: number;
  /** Share of the bucket's current diversified equity (bars sum to ~100%). */
  currentPct: number;
  targetPct: number;
  /** Dollar target against the end-state diversified base. */
  targetValue: number;
  /** targetValue − currentValue: positive = buy, negative = trim. */
  gap: number;
  /** currentPct − targetPct (signed, in percentage points). */
  driftPct: number;
  flagged: boolean;
}

export interface OtherSleeve {
  sleeve: SleeveKey;
  label: string;
  color: string;
  value: number;
}

export interface ReserveInfo {
  safeTotal: number;
  reserveTarget: number;
  reserveHeld: number;
  investable: number;
}

export interface SingleStockInfo {
  /** The configured tickers this cap applies to. */
  tickers: string[];
  current: number;
  capPct: number;
  capValue: number;
  trim: number;
  pctOfTotal: number;
  over: boolean;
}

export interface SetAsideInfo {
  sleeve: SleeveKey;
  label: string;
  value: number;
}

export interface BucketState {
  bucket: BucketKey;
  label: string;
  totalValue: number;
  currentDiversified: number;
  diversifiedBase: number;
  investablePool: number;
  sleeves: SleeveDrift[];
  otherSleeves: OtherSleeve[];
  reserve: ReserveInfo | null;
  singleStock: SingleStockInfo | null;
  setAside: SetAsideInfo | null;
  actions: RebalanceAction[];
  needsRebalance: boolean;
  /** Inline, plan-level explanations (e.g. why an overweight isn't being sold). */
  rationale: string[];
  /** Standing caveats surfaced in the collapsed "Assumptions" section. */
  notes: string[];
}

export interface RebalanceState {
  totalPortfolio: number;
  buckets: BucketState[];
  settings: RebalanceSettings;
  targets: Record<BucketKey, TargetMix>;
  persistence: boolean;
  generatedAt: string;
}

type SleeveTotals = Map<SleeveKey, number>;

function addSleeve(map: SleeveTotals, sleeve: SleeveKey, value: number): void {
  map.set(sleeve, (map.get(sleeve) ?? 0) + value);
}

function computeDrift(
  sleeve: SleeveKey,
  current: number,
  currentDenominator: number,
  targetPct: number,
  diversifiedBase: number,
): SleeveDrift {
  const currentPct = currentDenominator > 0 ? (current / currentDenominator) * 100 : 0;
  const targetValue = (diversifiedBase * targetPct) / 100;
  const gap = targetValue - current;
  const driftPct = currentPct - targetPct;
  const relative = targetPct > 0 ? Math.abs(driftPct) / targetPct : current > 0 ? Infinity : 0;
  const flagged = Math.abs(driftPct) > DRIFT_BAND_POINTS || relative > DRIFT_BAND_RELATIVE;
  return {
    sleeve,
    label: sleeveLabel(sleeve),
    color: sleeveColor(sleeve),
    currentValue: current,
    currentPct,
    targetPct,
    targetValue,
    gap,
    driftPct,
    flagged,
  };
}

function collectOtherSleeves(
  map: SleeveTotals,
  exclude: Set<SleeveKey>,
): OtherSleeve[] {
  const rows: OtherSleeve[] = [];
  for (const [sleeve, value] of map) {
    if (exclude.has(sleeve)) continue;
    if (value <= 0) continue;
    rows.push({ sleeve, label: sleeveLabel(sleeve), color: sleeveColor(sleeve), value });
  }
  return rows.sort((a, b) => sleeveOrder(a.sleeve) - sleeveOrder(b.sleeve));
}

/** Taxable bucket: reserve carve-out, single-stock cap, tax-aware "new money first". */
function buildTaxableBucket(
  map: SleeveTotals,
  totalValue: number,
  grandTotal: number,
  settings: RebalanceSettings,
  targetMix: TargetMix,
): BucketState {
  const currentDiversified = TARGET_SLEEVES.reduce((s, k) => s + (map.get(k) ?? 0), 0);

  const cash = map.get("cash") ?? 0;
  const bonds = map.get("bonds_cds") ?? 0;
  const safeTotal = cash + bonds;
  const reserveHeld = Math.min(settings.reserveAmount, safeTotal);
  const investableCash = Math.max(0, safeTotal - reserveHeld);

  // Single-stock concentration cap. Only active when the user has configured
  // at least one ticker; otherwise there is nothing to cap or trim.
  const tickers = settings.singleStockTickers;
  const stockCurrent = map.get("single_stock") ?? 0;
  const capValue = (settings.singleStockCapPct / 100) * grandTotal;
  const stockTrim = tickers.length > 0 ? Math.max(0, stockCurrent - capValue) : 0;
  const singleStock: SingleStockInfo | null =
    tickers.length > 0
      ? {
          tickers,
          current: stockCurrent,
          capPct: settings.singleStockCapPct,
          capValue,
          trim: stockTrim,
          pctOfTotal: grandTotal > 0 ? (stockCurrent / grandTotal) * 100 : 0,
          over: stockTrim > 0,
        }
      : null;

  const investablePool = investableCash + stockTrim;
  const diversifiedBase = currentDiversified + investablePool;

  const sleeves = TARGET_SLEEVES.map((k) =>
    computeDrift(k, map.get(k) ?? 0, currentDiversified, targetMix[k] ?? 0, diversifiedBase),
  );

  // --- Tax-aware action plan ---
  const actions: RebalanceAction[] = [];
  if (stockTrim >= MIN_ACTION_USD) {
    actions.push({
      kind: "trim",
      sleeve: "single_stock",
      ticker: tickers.length === 1 ? tickers[0] : null,
      amount: stockTrim,
      label: `Trim ${tickers.join(", ")} down to the ${settings.singleStockCapPct}% concentration cap`,
    });
  }
  if (investableCash >= MIN_ACTION_USD) {
    actions.push({
      kind: "free_cash",
      sleeve: null,
      ticker: null,
      amount: investableCash,
      label: "Free up cash & CDs above your reserve",
    });
  }

  const underweights = sleeves.filter((s) => s.gap > 0);
  const sumPositiveGap = underweights.reduce((s, x) => s + x.gap, 0);
  for (const s of underweights) {
    // Deploy the available pool toward underweights. When the pool can't cover
    // every gap (because an overweight sleeve isn't being sold), spread it
    // proportionally so each underweight moves toward target.
    const buy =
      sumPositiveGap <= investablePool || sumPositiveGap === 0
        ? s.gap
        : (investablePool * s.gap) / sumPositiveGap;
    if (buy >= MIN_ACTION_USD) {
      actions.push({
        kind: "buy",
        sleeve: s.sleeve,
        ticker: REPRESENTATIVE_TICKER[s.sleeve],
        amount: buy,
        label: `Buy ${s.label}`,
      });
    }
  }

  const rationale: string[] = [];
  const overweights = sleeves.filter((s) => s.gap < -MIN_ACTION_USD);
  for (const s of overweights) {
    rationale.push(
      `${s.label} sits above target. It is held as-is to avoid realizing taxable gains; trim about ${formatUsd(-s.gap)} only if you want to fully rebalance.`,
    );
  }
  if (settings.reserveAmount > safeTotal) {
    rationale.push(
      `Your reserve target (${formatUsd(settings.reserveAmount)}) is larger than the cash & CDs on hand (${formatUsd(safeTotal)}), so there's no cash to deploy right now.`,
    );
  }

  const needsRebalance = sleeves.some((s) => s.flagged) || (singleStock?.over ?? false);

  return {
    bucket: "taxable",
    label: "Taxable",
    totalValue,
    currentDiversified,
    diversifiedBase,
    investablePool,
    sleeves,
    otherSleeves: collectOtherSleeves(map, new Set<SleeveKey>([...TARGET_SLEEVES, "single_stock"])),
    reserve: { safeTotal, reserveTarget: settings.reserveAmount, reserveHeld, investable: investableCash },
    singleStock,
    setAside: null,
    actions,
    needsRebalance,
    rationale,
    notes: [],
  };
}

/** Tax-advantaged bucket: target-date set-aside; the rest rebalances freely. */
function buildTaxAdvantagedBucket(
  map: SleeveTotals,
  totalValue: number,
  targetMix: TargetMix,
): BucketState {
  const setAsideValue = map.get("target_date") ?? 0;
  const idleCash = (map.get("cash") ?? 0) + (map.get("bonds_cds") ?? 0);
  const currentEquity = TARGET_SLEEVES.reduce((s, k) => s + (map.get(k) ?? 0), 0);

  // Active money = everything except the target-date set-aside. All of it ends
  // up in the four equity sleeves.
  const diversifiedBase = currentEquity + idleCash;

  const sleeves = TARGET_SLEEVES.map((k) =>
    computeDrift(k, map.get(k) ?? 0, currentEquity, targetMix[k] ?? 0, diversifiedBase),
  );

  // --- Free-rebalance action plan (no tax on sales here) ---
  const actions: RebalanceAction[] = [];
  if (idleCash >= MIN_ACTION_USD) {
    actions.push({
      kind: "free_cash",
      sleeve: null,
      ticker: null,
      amount: idleCash,
      label: "Sweep idle cash / stable value into your target mix",
    });
  }
  for (const s of sleeves) {
    if (s.gap < -MIN_ACTION_USD) {
      actions.push({
        kind: "trim",
        sleeve: s.sleeve,
        ticker: REPRESENTATIVE_TICKER[s.sleeve],
        amount: -s.gap,
        label: `Reduce ${s.label}`,
      });
    }
  }
  for (const s of sleeves) {
    if (s.gap > MIN_ACTION_USD) {
      actions.push({
        kind: "buy",
        sleeve: s.sleeve,
        ticker: REPRESENTATIVE_TICKER[s.sleeve],
        amount: s.gap,
        label: `Buy ${s.label}`,
      });
    }
  }

  const notes: string[] = [
    "401(k) plans often have a limited fund menu. Express finer growth or dividend tilts through IRA, Roth and HSA accounts (and new contributions), and use the closest S&P 500 and international index funds inside the 401(k).",
  ];
  if (setAsideValue > 0) {
    notes.push(
      `Your target-date fund (${formatUsd(setAsideValue)}) is treated as a self-balancing set-aside and isn't part of the target mix above.`,
    );
  }

  const needsRebalance = sleeves.some((s) => s.flagged);

  return {
    bucket: "tax_advantaged",
    label: "Tax-advantaged",
    totalValue,
    currentDiversified: currentEquity,
    diversifiedBase,
    investablePool: idleCash,
    sleeves,
    otherSleeves: collectOtherSleeves(
      map,
      new Set<SleeveKey>([...TARGET_SLEEVES, "target_date"]),
    ),
    reserve: null,
    singleStock: null,
    setAside: setAsideValue > 0
      ? { sleeve: "target_date", label: sleeveLabel("target_date"), value: setAsideValue }
      : null,
    actions,
    needsRebalance,
    rationale: [],
    notes,
  };
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Build the full rebalancing picture for a user from live holdings + cash.
 */
export async function getRebalanceState(userId: string): Promise<RebalanceState> {
  const [holdings, accounts, config] = await Promise.all([
    listHoldings(userId),
    listAccounts(userId),
    getRebalanceConfig(userId),
  ]);
  const acctById = new Map(accounts.map((a) => [a.id, a] as const));
  const singleStockTickers = new Set(config.settings.singleStockTickers);

  const totals: Record<BucketKey, SleeveTotals> = {
    taxable: new Map(),
    tax_advantaged: new Map(),
  };

  const holdingAccountIds = new Set<string>();
  for (const h of holdings) {
    if (h.currency_code !== "USD") continue;
    const acct = acctById.get(h.account_id);
    if (!acct) continue; // stale / inactive
    holdingAccountIds.add(h.account_id);
    const sleeve = sleeveForSecurity(
      h.security?.ticker_symbol,
      h.security?.name,
      h.security?.asset_class,
      singleStockTickers,
    );
    addSleeve(totals[bucketForAccount(acct)], sleeve, Number(h.current_value));
  }

  // Investment-adjacent cash (brokerage cash-management accounts and similar).
  const cashByAccount = await getPortfolioCashByAccount(userId, holdingAccountIds);
  for (const { account, cash } of cashByAccount.values()) {
    addSleeve(totals[bucketForAccount(account)], "cash", cash);
  }


  const bucketSum = (m: SleeveTotals) => Array.from(m.values()).reduce((s, v) => s + v, 0);
  const taxableTotal = bucketSum(totals.taxable);
  const taxAdvTotal = bucketSum(totals.tax_advantaged);
  const grandTotal = taxableTotal + taxAdvTotal;

  const buckets: BucketState[] = [
    buildTaxableBucket(totals.taxable, taxableTotal, grandTotal, config.settings, config.targets.taxable),
    buildTaxAdvantagedBucket(totals.tax_advantaged, taxAdvTotal, config.targets.tax_advantaged),
  ];

  return {
    totalPortfolio: grandTotal,
    buckets,
    settings: config.settings,
    targets: config.targets,
    persistence: config.persistence,
    generatedAt: new Date().toISOString(),
  };
}
