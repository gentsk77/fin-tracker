/**
 * Default rebalancing configuration. These defaults seed the DB on first use
 * and are the fallback the engine reads from when the `rebalance_*` tables
 * don't yet exist (e.g. before migration 005 is applied). They are neutral
 * starting points, meant to be edited on the Rebalance page.
 *
 * Pure module: no I/O.
 */
import type { BucketKey, SleeveKey } from "@/domain/sleeves";

export interface RebalanceSettings {
  /** Cash + CDs kept as a reserve in the taxable bucket (not rebalanced). */
  reserveAmount: number;
  /**
   * Tickers treated as a single-stock concentration (for example a large
   * individual position or company stock). Upper-case; empty means no cap.
   */
  singleStockTickers: string[];
  /** Concentration cap for those tickers, as a percent of the whole portfolio. */
  singleStockCapPct: number;
}

/** Per-bucket diversified-equity target mix (the four TARGET_SLEEVES, summing to 100). */
export type TargetMix = Partial<Record<SleeveKey, number>>;

/** Upper bound on how many tickers the single-stock cap can track. */
export const MAX_SINGLE_STOCK_TICKERS = 5;

export const DEFAULT_SETTINGS: RebalanceSettings = {
  reserveAmount: 0,
  singleStockTickers: [],
  singleStockCapPct: 10,
};

/**
 * Default mix for both buckets: a plain textbook split.
 * US Blend 60 / International 30 / US Dividend 10 / US Growth 0.
 */
export const DEFAULT_TAXABLE_TARGETS: TargetMix = {
  us_blend: 60,
  international: 30,
  us_dividend: 10,
  us_growth: 0,
};

export const DEFAULT_TAX_ADVANTAGED_TARGETS: TargetMix = {
  us_blend: 60,
  international: 30,
  us_dividend: 10,
  us_growth: 0,
};

/**
 * Parse a free-form ticker list ("aapl, nvda" or ["AAPL"]) into a clean,
 * de-duplicated, upper-case array. Drops anything that doesn't look like a
 * ticker and keeps at most {@link MAX_SINGLE_STOCK_TICKERS} entries.
 */
export function normalizeTickers(input: string | readonly string[]): string[] {
  const parts = typeof input === "string" ? input.split(/[\s,;]+/) : input;
  const out: string[] = [];
  for (const raw of parts) {
    const t = String(raw ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= MAX_SINGLE_STOCK_TICKERS) break;
  }
  return out;
}

export function defaultTargetsForBucket(bucket: BucketKey): TargetMix {
  return bucket === "taxable"
    ? { ...DEFAULT_TAXABLE_TARGETS }
    : { ...DEFAULT_TAX_ADVANTAGED_TARGETS };
}
