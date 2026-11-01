/**
 * Portfolio "sleeve" taxonomy: a finer-grained classification than Plaid's
 * `asset_class`, used by the rebalancing engine.
 *
 * A sleeve is a role a holding plays in the portfolio (US Blend, US Growth,
 * Dividend, International, Bonds & CDs, Cash, a single-stock concentration,
 * and the self-balancing Target-date fund). Mapping is by ticker/name first,
 * falling back to asset_class. Order matters, so the single-stock and
 * brokered-CD checks run before the broad fallbacks.
 *
 * Pure module: no I/O, no DB. Mirrors the shape of `category-taxonomy.ts`.
 */
import type { AccountTaxType, AccountType } from "@/types";

export type SleeveKey =
  | "us_blend"
  | "us_growth"
  | "us_dividend"
  | "international"
  | "bonds_cds"
  | "cash"
  | "single_stock"
  | "target_date"
  | "unclassified";

export type BucketKey = "taxable" | "tax_advantaged";

interface SleeveMeta {
  key: SleeveKey;
  label: string;
  /** Concrete color value (not a Tailwind class) for recharts / inline styles. */
  color: string;
  order: number;
}

/**
 * Display metadata, in canonical display order. Colors are concrete values so
 * they can feed recharts cells and inline `style` the same way the existing
 * allocation donut does.
 */
export const SLEEVE_META: Record<SleeveKey, SleeveMeta> = {
  us_blend: { key: "us_blend", label: "US Blend", color: "hsl(var(--brand-500))", order: 0 },
  us_growth: { key: "us_growth", label: "US Growth", color: "#0ea5e9", order: 1 },
  us_dividend: { key: "us_dividend", label: "US Dividend", color: "#10b981", order: 2 },
  international: { key: "international", label: "International", color: "#f59e0b", order: 3 },
  bonds_cds: { key: "bonds_cds", label: "Bonds & CDs", color: "#14b8a6", order: 4 },
  cash: { key: "cash", label: "Cash", color: "#64748b", order: 5 },
  single_stock: { key: "single_stock", label: "Single stock", color: "#8b5cf6", order: 6 },
  target_date: { key: "target_date", label: "Target-date", color: "#f43f5e", order: 7 },
  unclassified: { key: "unclassified", label: "Unclassified", color: "#94a3b8", order: 8 },
};

/**
 * The four diversified-equity sleeves that user-set target percentages apply
 * to. The single-stock concentration (capped separately), Bonds & CDs / Cash
 * (the reserve), and Target-date (self-balancing set-aside) are handled by
 * their own callouts, not the per-sleeve target mix.
 */
export const TARGET_SLEEVES: SleeveKey[] = [
  "us_blend",
  "us_growth",
  "us_dividend",
  "international",
];

/**
 * Example buy ticker per target sleeve: a widely held, low-cost ETF for each
 * role, so a suggested buy maps to a concrete order. Single stocks have no
 * representative ticker; trims use the configured ticker instead.
 */
export const REPRESENTATIVE_TICKER: Record<SleeveKey, string | null> = {
  us_blend: "VOO",
  us_growth: "QQQM",
  us_dividend: "SCHD",
  international: "VXUS",
  bonds_cds: null,
  cash: null,
  single_stock: null,
  target_date: null,
  unclassified: null,
};

export function sleeveLabel(key: SleeveKey): string {
  return SLEEVE_META[key]?.label ?? "Unclassified";
}

export function sleeveColor(key: SleeveKey): string {
  return SLEEVE_META[key]?.color ?? SLEEVE_META.unclassified.color;
}

export function sleeveOrder(key: SleeveKey): number {
  return SLEEVE_META[key]?.order ?? 99;
}

const MONEY_MARKET = new Set([
  "SPAXX", "FDRXX", "FZFXX", "VMFXX", "SPRXX", "FCASH",
]);
const DIVIDEND = new Set([
  "SCHD", "VYM", "DGRO", "VTV", "SCHV", "VIG", "VYMI",
  "AVUV", "VBR", "AVDV", "IJS", // small/value tilt
]);
const GROWTH = new Set([
  "VUG", "MGK", "QQQ", "QQQM", "VGT", "SCHG", "ARKK",
  "AAPL", "GOOG", "GOOGL", "NFLX", "META", "AMZN", "NVDA", "TSLA",
]);
const BLEND = new Set([
  "VOO", "SPY", "VTI", "ITOT", "IVV", "FSKAX", "FXAIX", "FNILX", "FZROX", "VV",
]);
const INTERNATIONAL = new Set([
  "VXUS", "VEU", "VEA", "VWO", "IXUS", "IEFA", "IEMG", "SCHF", "SCHE",
]);

const NO_TICKERS: ReadonlySet<string> = new Set();

/**
 * Classify a security into a sleeve. `ticker`/`name`/`assetClass` come straight
 * from the `securities` row; `singleStockTickers` is the user's configured
 * concentration list (upper-case, empty by default). Order is significant:
 *   1. Configured single-stock tickers.
 *   2. Target-date funds (LifePath and similar).
 *   3. Stable value + brokered CDs (whose "ticker" is a dotted bank string).
 *   4. Money-market sweep funds, as Cash.
 *   5. Dividend / value tilt.
 *   6. Growth funds + single growth names.
 *   7. US Blend (S&P 500 / total market).
 *   8. International.
 *   9. asset_class fallback, then name heuristics.
 */
export function sleeveForSecurity(
  ticker: string | null | undefined,
  name: string | null | undefined,
  assetClass: string | null | undefined,
  singleStockTickers: ReadonlySet<string> = NO_TICKERS,
): SleeveKey {
  const t = (ticker ?? "").toUpperCase();
  const n = (name ?? "").toLowerCase();
  const hay = `${t} ${n}`.toLowerCase();

  if (t && singleStockTickers.has(t)) return "single_stock";
  if (/lpath|lifepath|target.?date/.test(hay)) return "target_date";
  if (/stable value/.test(hay)) return "bonds_cds";
  if (/\bbank\b|\bbk\b|\.cd\b|certificate|\bnatl\b|\bassn\b/.test(hay)) return "bonds_cds";
  if (MONEY_MARKET.has(t)) return "cash";
  if (DIVIDEND.has(t)) return "us_dividend";
  if (GROWTH.has(t)) return "us_growth";
  if (BLEND.has(t) || /500 index|s&p 500|total.*market|index trust/.test(hay)) return "us_blend";
  if (INTERNATIONAL.has(t)) return "international";

  switch (assetClass) {
    case "bonds":
      return "bonds_cds";
    case "cash":
      return "cash";
    case "international_stocks":
      return "international";
    case "us_stocks":
      return "us_blend";
    default:
      if (/bond|treasury|fixed income/.test(n)) return "bonds_cds";
      if (/international|ex-?us|emerging|developed/.test(n)) return "international";
      if (/money market|cash/.test(n)) return "cash";
      return "unclassified";
  }
}

/**
 * Split an account into the taxable vs tax-advantaged bucket. The `tax_type`
 * column is the reliable signal on live data (401k/Traditional IRA map to
 * traditional_retirement, Roth to roth_retirement, HSA to hsa); we fall back
 * to account type + name heuristics only when `tax_type` is `unknown`.
 */
export function bucketForAccount(account: {
  tax_type: AccountTaxType;
  type: AccountType;
  name: string | null;
}): BucketKey {
  switch (account.tax_type) {
    case "traditional_retirement":
    case "roth_retirement":
    case "hsa":
    case "education":
      return "tax_advantaged";
    case "taxable":
      return "taxable";
    default: {
      // tax_type unknown: fall back to type + name (legacy heuristic).
      if (account.type === "retirement") return "tax_advantaged";
      const n = (account.name ?? "").toLowerCase();
      return /401|403|\bira\b|roth|hsa|health savings/.test(n)
        ? "tax_advantaged"
        : "taxable";
    }
  }
}
