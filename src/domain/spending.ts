/**
 * Spending category helpers.
 *
 * Plaid Personal Finance Categories (PFC) include some categories that
 * represent money movement (not real spending). We exclude those from
 * spending totals so inter-account transfers and credit-card payments don't
 * inflate the number, but we deliberately KEEP genuine third-party outflows
 * (rent, mortgage, car/loan payments, and physical checks / cash withdrawals).
 *
 * The actual rules now live in `category-taxonomy.ts` (which also produces the
 * friendly category buckets); this module just re-exposes the spending /
 * non-spending decision via `isExcludedFromSpending` for the aggregation code,
 * and keeps `humanizeCategory` for any raw-PFC fallback display.
 */

import { isSpendingTransaction } from "./category-taxonomy";

/**
 * True if a transaction should be excluded from spending totals because it
 * represents money movement (a transfer) or a credit-card payment rather
 * than consumption.
 *
 * Inspects the detailed `subcategory` so real expenses aren't dropped; most
 * importantly rent that Plaid tags `LOAN_PAYMENTS_OTHER_PAYMENT`.
 */
export function isExcludedFromSpending(
  category: string | null | undefined,
  subcategory?: string | null | undefined,
  name?: string | null | undefined,
): boolean {
  return !isSpendingTransaction({ category, subcategory, name });
}

/**
 * Convert a Plaid PFC primary category like "FOOD_AND_DRINK" into a
 * human-friendly label like "Food And Drink".
 *
 * Null/empty input returns "Uncategorized".
 */
export function humanizeCategory(category: string | null | undefined): string {
  if (!category) return "Uncategorized";
  return category
    .toLowerCase()
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
