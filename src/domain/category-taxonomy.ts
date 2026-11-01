/**
 * Friendly spending taxonomy.
 *
 * Plaid's Personal Finance Categories (PFC) are too granular and noisy for a
 * Credit-Karma-style view ("General Merchandise", "Loan Disbursements", ...).
 * This module collapses the PFC *primary* category plus a handful of *detailed*
 * overrides into ~18 clean categories that are shared by the spending donut,
 * the transactions table's Category column, and the table filter, so they
 * always agree.
 *
 * It also owns the single source of truth for what counts as *spending*:
 *
 *   - Real third-party outflows count, including physical checks and cash /
 *     ATM withdrawals, which Credit Karma counts under "Cash & checks".
 *   - Money movement does NOT count: own-account transfers, investment /
 *     savings funding, P2P app transfers (Zelle/Venmo), credit-card payments,
 *     and income.
 *
 * Counting the check that Plaid mis-files as `TRANSFER_OUT_ACCOUNT_TRANSFER`
 * is what closes the gap against Credit Karma's monthly total; we still keep
 * excluding genuine transfers and card payments so nothing is double-counted.
 */

export interface CategoryClass {
  /** Stable friendly key (e.g. "FOOD_DINING"). */
  key: string;
  /** Human label (e.g. "Food & Dining"). */
  label: string;
  /** True if this category counts toward spending totals + the donut. */
  isSpending: boolean;
}

interface CatDef {
  key: string;
  label: string;
  color: string;
  isSpending: boolean;
}

// Spending categories in stable display / filter order. Colors are explicit
// (not hashed) so the palette stays intentional and legible; the brand indigo
// anchors it, with a curated qualitative spread for the rest so adjacent donut
// slices stay distinguishable.
const SPENDING_DEFS: CatDef[] = [
  { key: "HOUSING", label: "Housing", color: "hsl(var(--brand))", isSpending: true },
  { key: "BILLS_UTILITIES", label: "Bills & Utilities", color: "#6989C1", isSpending: true },
  { key: "GROCERIES", label: "Groceries", color: "#6FA86B", isSpending: true },
  { key: "FOOD_DINING", label: "Food & Dining", color: "#D9A05B", isSpending: true },
  { key: "SHOPPING", label: "Shopping", color: "#9B7BC7", isSpending: true },
  { key: "TRANSPORTATION", label: "Transportation", color: "#5BA8B5", isSpending: true },
  { key: "TRAVEL", label: "Travel", color: "#4A6B8A", isSpending: true },
  { key: "ENTERTAINMENT", label: "Entertainment", color: "#C16B85", isSpending: true },
  { key: "HEALTH", label: "Health", color: "#4F9D8B", isSpending: true },
  { key: "PERSONAL_CARE", label: "Personal Care", color: "#B07BA0", isSpending: true },
  { key: "SERVICES", label: "Services", color: "#708090", isSpending: true },
  { key: "EDUCATION", label: "Education", color: "#D98162", isSpending: true },
  { key: "HOME", label: "Home", color: "#8A8FBF", isSpending: true },
  { key: "GOVT_NONPROFIT", label: "Government & Non-Profit", color: "#87A96B", isSpending: true },
  { key: "FEES", label: "Fees", color: "#9AA0A6", isSpending: true },
  { key: "LOANS", label: "Loan Payments", color: "#7B7CB8", isSpending: true },
  { key: "CASH_CHECKS", label: "Cash & Checks", color: "#C58F4A", isSpending: true },
  { key: "UNCATEGORIZED", label: "Uncategorized", color: "#B8B8C4", isSpending: true },
];

// Non-spending categories: shown in the table + its filter, never in the
// donut. These are money movement, not consumption.
const NONSPENDING_DEFS: CatDef[] = [
  { key: "INCOME", label: "Income", color: "#5FA88A", isSpending: false },
  { key: "TRANSFER", label: "Transfer", color: "#9AA0A6", isSpending: false },
  { key: "CC_PAYMENT", label: "Credit Card Payment", color: "#8C92A0", isSpending: false },
];

const ORDERED_DEFS: CatDef[] = [...SPENDING_DEFS, ...NONSPENDING_DEFS];

const DEFS: Record<string, CatDef> = {};
ORDERED_DEFS.forEach((d) => {
  DEFS[d.key] = d;
});

/**
 * Sentinel for the donut's display-only long-tail umbrella. The table filter
 * never offers this; it lists the real categories individually.
 */
export const OTHER_SPENDING_KEY = "OTHER_SPENDING";
export const OTHER_SPENDING_LABEL = "Other Spending";
export const OTHER_SPENDING_COLOR = "#C8C8D3";

const FALLBACK_COLOR = "#B8B8C4";

/** Stable sort index for a friendly key (drives the filter list order). */
export function categoryOrder(key: string): number {
  const i = ORDERED_DEFS.findIndex((d) => d.key === key);
  return i === -1 ? 999 : i;
}

/** Human label for a friendly key (or the "Other Spending" umbrella). */
export function categoryLabel(key: string): string {
  if (key === OTHER_SPENDING_KEY) return OTHER_SPENDING_LABEL;
  return DEFS[key]?.label ?? key;
}

/** Stable color for a friendly key (or the "Other Spending" umbrella). */
export function categoryColor(key: string): string {
  if (key === OTHER_SPENDING_KEY) return OTHER_SPENDING_COLOR;
  return DEFS[key]?.color ?? FALLBACK_COLOR;
}

/** True if the friendly key is a spending bucket (vs. money movement). */
export function isSpendingKey(key: string): boolean {
  return DEFS[key]?.isSpending ?? false;
}

/**
 * Detects a paper check or cash withdrawal by description. Guards against
 * debit-card POS names ("CHECKCARD PURCHASE") which are not paper checks.
 */
function isCheckName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (/check\s*card|checkcard/i.test(name)) return false;
  return /\bchecks?\b|check\s*#|check\s*no\b/i.test(name);
}

export interface ClassifyInput {
  category?: string | null;
  subcategory?: string | null;
  name?: string | null;
}

function def(key: string): CategoryClass {
  const d = DEFS[key];
  return { key, label: d.label, isSpending: d.isSpending };
}

/**
 * Map a transaction onto a friendly category. Pure function of Plaid's PFC
 * primary category + a few detailed overrides, with check / withdrawal
 * detection for the "Cash & Checks" bucket.
 */
export function classifyCategory(input: ClassifyInput): CategoryClass {
  const c = input.category ?? null;
  const s = input.subcategory ?? null;
  const name = input.name ?? "";

  // --- Money movement we never count as spending ------------------------
  if (c === "INCOME") return def("INCOME");
  if (c === "TRANSFER_IN") return def("TRANSFER");
  if (s === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return def("CC_PAYMENT");
  if (c === "TRANSFER_OUT") {
    // Physical checks + ATM / cash withdrawals DO count (Credit Karma counts
    // them under "Cash & checks"). Everything else under TRANSFER_OUT is
    // own-account / investment / savings / P2P movement and does not.
    if (s === "TRANSFER_OUT_WITHDRAWAL" || isCheckName(name)) {
      return def("CASH_CHECKS");
    }
    return def("TRANSFER");
  }
  // A check can occasionally land with no PFC category at all.
  if (c == null && isCheckName(name)) return def("CASH_CHECKS");

  // --- Spending ---------------------------------------------------------
  switch (c) {
    case "RENT_AND_UTILITIES":
      return s === "RENT_AND_UTILITIES_RENT"
        ? def("HOUSING")
        : def("BILLS_UTILITIES");
    case "LOAN_PAYMENTS":
      return s === "LOAN_PAYMENTS_MORTGAGE" ? def("HOUSING") : def("LOANS");
    case "FOOD_AND_DRINK":
      return s === "FOOD_AND_DRINK_GROCERIES"
        ? def("GROCERIES")
        : def("FOOD_DINING");
    case "GENERAL_SERVICES":
      return s === "GENERAL_SERVICES_EDUCATION"
        ? def("EDUCATION")
        : def("SERVICES");
    case "GENERAL_MERCHANDISE":
      return def("SHOPPING");
    case "HOME_IMPROVEMENT":
      return def("HOME");
    case "TRANSPORTATION":
      return def("TRANSPORTATION");
    case "TRAVEL":
      return def("TRAVEL");
    case "ENTERTAINMENT":
      return def("ENTERTAINMENT");
    case "MEDICAL":
      return def("HEALTH");
    case "PERSONAL_CARE":
      return def("PERSONAL_CARE");
    case "BANK_FEES":
      return def("FEES");
    case "GOVERNMENT_AND_NON_PROFIT":
      return def("GOVT_NONPROFIT");
    default:
      return def("UNCATEGORIZED");
  }
}

/** True if a transaction should count toward spending totals / the donut. */
export function isSpendingTransaction(input: ClassifyInput): boolean {
  return classifyCategory(input).isSpending;
}
