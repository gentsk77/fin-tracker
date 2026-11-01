/**
 * Money / account classification helpers.
 *
 * These are pure functions that operate on the DB row shape (snake_case) so
 * callers can pass `AccountRow` directly without mapping.
 */
import type { AccountType } from "@/types";

export function isAssetType(type: AccountType): boolean {
  return (
    type === "checking" ||
    type === "savings" ||
    type === "investment" ||
    type === "retirement" ||
    type === "other"
  );
}

export function isLiabilityType(type: AccountType): boolean {
  return type === "credit" || type === "loan" || type === "mortgage";
}

export interface AccountBalanceShape {
  type: AccountType;
  current_balance: number | null;
}

/**
 * Returns the account's contribution to net worth.
 *
 *   +balance for asset accounts (positive contribution)
 *   -balance for liability accounts (negative contribution)
 *
 * Null balances are treated as 0.
 *
 * Note: a negative `current_balance` on a liability (e.g. overpaid credit
 * card) will flip sign and contribute positively, which is correct. A
 * negative balance on an asset (e.g. overdrafted checking) stays negative.
 * Callers that want explicit asset/liability buckets should derive them
 * from the signed value (positive -> asset side, negative -> liability side)
 * rather than from `type` alone.
 */
export function signedBalance(account: AccountBalanceShape): number {
  const bal = account.current_balance ?? 0;
  return isLiabilityType(account.type) ? -bal : bal;
}

/**
 * Human-readable label for an account type. Used in breakdown UI.
 */
export function accountTypeLabel(type: AccountType): string {
  switch (type) {
    case "checking":
      return "Checking";
    case "savings":
      return "Savings";
    case "credit":
      return "Credit Cards";
    case "loan":
      return "Loans";
    case "mortgage":
      return "Mortgage";
    case "investment":
      return "Investments";
    case "retirement":
      return "Retirement";
    case "other":
      return "Other";
  }
}

// ---------------------------------------------------------------------------
// Asset categories: broad money-split buckets for dashboard / net-worth UI.
// Only ASSET account types map to a category; liabilities map to null and are
// aggregated separately by callers.
// ---------------------------------------------------------------------------

export type AssetCategoryKey =
  | "cash"
  | "investments"
  | "retirement"
  | "other";

/** Display order for the money-split bar / legend (largest typical share first). */
export const ASSET_CATEGORY_ORDER: AssetCategoryKey[] = [
  "cash",
  "investments",
  "retirement",
  "other",
];

export function assetCategoryLabel(key: AssetCategoryKey): string {
  switch (key) {
    case "cash":
      return "Cash";
    case "investments":
      return "Investments";
    case "retirement":
      return "Retirement";
    case "other":
      return "Other Assets";
  }
}

/**
 * Bucket an account into one of the broad asset categories. Returns null for
 * liability accounts (credit / loan / mortgage); those are tracked
 * separately by `getNetWorthBreakdown`.
 *
 * CDs and money-market accounts are mapped to `savings` upstream in the
 * Plaid mapper, so they correctly land in `cash` here.
 */
export function assetCategoryFor(type: AccountType): AssetCategoryKey | null {
  switch (type) {
    case "checking":
    case "savings":
      return "cash";
    case "investment":
      return "investments";
    case "retirement":
      return "retirement";
    case "other":
      return "other";
    case "credit":
    case "loan":
    case "mortgage":
      return null;
  }
}

/**
 * Tailwind utility classes for each asset category's swatch / bar segment.
 * Chosen to stay on-brand: indigo shades for asset-side categories with
 * green for taxable investments to signal "growth/money in".
 */
export const ASSET_CATEGORY_BAR_CLASS: Record<AssetCategoryKey, string> = {
  cash: "bg-brand-500",
  investments: "bg-success",
  retirement: "bg-brand-300",
  other: "bg-foreground-muted",
};
