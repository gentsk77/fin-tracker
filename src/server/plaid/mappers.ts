/**
 * Map Plaid SDK types into our provider-neutral domain shape.
 *
 * Keep ALL Plaid-specific knowledge in this file so the rest of the app
 * can stay vendor-agnostic.
 */
import type {
  AccountBase,
  AccountSubtype,
  AccountType as PlaidAccountType,
  Holding as PlaidHolding,
  RemovedTransaction,
  Security as PlaidSecurity,
  Transaction as PlaidTransaction,
} from "plaid";
import type { AccountTaxType, AccountType } from "@/types";

/**
 * Our DB enum for `securities.type`. Narrower than Plaid's set; we collapse
 * derivatives/loans/null into `other` to keep the UI buckets manageable.
 */
export type SecurityType =
  | "equity"
  | "etf"
  | "mutual_fund"
  | "bond"
  | "cash"
  | "crypto"
  | "other";

/**
 * Our DB enum for `securities.asset_class`. Inferred from Plaid's
 * `type` + `name` because Plaid doesn't expose a portfolio-asset-class
 * field directly.
 */
export type AssetClass =
  | "us_stocks"
  | "international_stocks"
  | "bonds"
  | "cash"
  | "real_estate"
  | "crypto"
  | "alternatives"
  | "other";

const ROTH_SUBTYPES = new Set<string>([
  "roth",
  "roth 401k",
  "roth 403B",
  "roth 457b",
  "roth pension",
  "roth profit sharing plan",
  "roth thrift savings plan",
]);

const TRADITIONAL_RETIREMENT_SUBTYPES = new Set<string>([
  "401a",
  "401k",
  "403B",
  "457b",
  "ira",
  "keogh",
  "pension",
  "profit sharing plan",
  "retirement",
  "sarsep",
  "sep ira",
  "simple ira",
  "thrift savings plan",
]);

const EDUCATION_SUBTYPES = new Set<string>([
  "529",
  "education savings account",
]);

const HSA_SUBTYPES = new Set<string>([
  "hsa",
  "health reimbursement arrangement",
]);

const RETIREMENT_SUBTYPES = new Set<string>([
  ...ROTH_SUBTYPES,
  ...TRADITIONAL_RETIREMENT_SUBTYPES,
]);

export function mapAccountType(
  type: PlaidAccountType,
  subtype: AccountSubtype | null
): AccountType {
  switch (type) {
    case "depository":
      if (subtype === "checking") return "checking";
      if (subtype === "savings") return "savings";
      // CDs and money market accounts are essentially cash equivalents;
      // group them under savings so they land in the Cash bucket on the
      // dashboard money-split rather than the catch-all "Other".
      if (subtype === "cd" || subtype === "money market") return "savings";
      return "other";
    case "credit":
      return "credit";
    case "loan":
      return subtype === "mortgage" ? "mortgage" : "loan";
    case "investment":
    case "brokerage":
      if (subtype && RETIREMENT_SUBTYPES.has(subtype)) return "retirement";
      return "investment";
    default:
      return "other";
  }
}

export function mapTaxType(
  type: PlaidAccountType,
  subtype: AccountSubtype | null
): AccountTaxType {
  if (subtype) {
    if (ROTH_SUBTYPES.has(subtype)) return "roth_retirement";
    if (TRADITIONAL_RETIREMENT_SUBTYPES.has(subtype)) return "traditional_retirement";
    if (EDUCATION_SUBTYPES.has(subtype)) return "education";
    if (HSA_SUBTYPES.has(subtype)) return "hsa";
  }
  if (type === "investment" || type === "brokerage") {
    if (subtype === "non-taxable brokerage account") return "unknown";
    return "taxable";
  }
  if (type === "depository" || type === "credit" || type === "loan") {
    return "taxable";
  }
  return "unknown";
}

export interface MappedAccount {
  providerAccountId: string;
  name: string;
  officialName: string | null;
  type: AccountType;
  taxType: AccountTaxType;
  currentBalance: number | null;
  availableBalance: number | null;
  creditLimit: number | null;
  currencyCode: string;
}

export function mapAccount(account: AccountBase): MappedAccount {
  const currency =
    account.balances.iso_currency_code ??
    account.balances.unofficial_currency_code ??
    "USD";
  return {
    providerAccountId: account.account_id,
    name: account.name,
    officialName: account.official_name,
    type: mapAccountType(account.type, account.subtype),
    taxType: mapTaxType(account.type, account.subtype),
    currentBalance: account.balances.current,
    availableBalance: account.balances.available,
    creditLimit: account.balances.limit,
    currencyCode: currency,
  };
}

export interface MappedTransaction {
  providerTransactionId: string;
  providerAccountId: string;
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

export function mapTransaction(txn: PlaidTransaction): MappedTransaction {
  // Plaid convention: positive = money OUT (debit), negative = money IN (credit).
  // We store always-positive amounts and disambiguate via `type`.
  const isDebit = txn.amount >= 0;
  const currency =
    txn.iso_currency_code ?? txn.unofficial_currency_code ?? "USD";

  const pfc = txn.personal_finance_category ?? null;
  const category = pfc?.primary ?? txn.category?.[0] ?? null;
  const subcategory = pfc?.detailed ?? txn.category?.[1] ?? null;

  return {
    providerTransactionId: txn.transaction_id,
    providerAccountId: txn.account_id,
    amount: Math.abs(txn.amount),
    currencyCode: currency,
    date: txn.date,
    name: txn.merchant_name ?? txn.name,
    merchantName: txn.merchant_name ?? null,
    category,
    subcategory,
    pending: txn.pending,
    type: isDebit ? "debit" : "credit",
  };
}

export function mapRemovedTransactionIds(
  removed: RemovedTransaction[]
): string[] {
  return removed
    .map((r) => r.transaction_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

// ---------------------------------------------------------------------------
// Investments: securities + holdings
// ---------------------------------------------------------------------------

export function mapSecurityType(type: string | null): SecurityType {
  switch (type) {
    case "equity":
      return "equity";
    case "etf":
      return "etf";
    case "mutual fund":
      return "mutual_fund";
    case "fixed income":
      return "bond";
    case "cash":
      return "cash";
    case "cryptocurrency":
      return "crypto";
    // `derivative`, `loan`, `other`, null all collapse to `other`.
    default:
      return "other";
  }
}

/**
 * Best-effort asset class inference. Plaid doesn't tell us whether `VXUS` is
 * an international ETF vs a US one; we use the security name as a hint and
 * fall back to `other` rather than guessing wrong.
 */
export function inferAssetClass(
  plaidType: string | null,
  name: string | null,
): AssetClass {
  if (plaidType === "cryptocurrency") return "crypto";
  if (plaidType === "cash") return "cash";
  if (plaidType === "fixed income") return "bonds";
  if (plaidType === "derivative") return "alternatives";

  const haystack = (name ?? "").toLowerCase();

  // Strong name signals first; these win even for `equity`/`etf`/`mutual fund`.
  if (
    haystack.includes("real estate") ||
    haystack.includes("reit")
  ) {
    return "real_estate";
  }
  if (
    haystack.includes("bond") ||
    haystack.includes("treasury") ||
    haystack.includes("fixed income") ||
    haystack.includes("aggregate")
  ) {
    return "bonds";
  }
  if (
    haystack.includes("money market") ||
    haystack.includes("cash reserve")
  ) {
    return "cash";
  }
  if (
    haystack.includes("international") ||
    haystack.includes("emerging") ||
    haystack.includes("global ex") ||
    haystack.includes("ex-us") ||
    haystack.includes("ex us") ||
    haystack.includes("developed markets") ||
    haystack.includes("foreign")
  ) {
    return "international_stocks";
  }
  if (
    haystack.includes("commodity") ||
    haystack.includes("gold") ||
    haystack.includes("silver") ||
    haystack.includes("hedge")
  ) {
    return "alternatives";
  }

  // No name signal: fall back on type. Equities/ETFs/mutual funds default
  // to US stocks because that's the most common case for retail US brokerage
  // sandbox data.
  if (
    plaidType === "equity" ||
    plaidType === "etf" ||
    plaidType === "mutual fund"
  ) {
    return "us_stocks";
  }

  return "other";
}

export interface MappedSecurity {
  providerSecurityId: string;
  tickerSymbol: string | null;
  name: string;
  type: SecurityType;
  currencyCode: string;
  latestPrice: number | null;
  latestPriceDate: string | null;
  assetClass: AssetClass;
}

export function mapPlaidSecurity(s: PlaidSecurity): MappedSecurity {
  const currency =
    s.iso_currency_code ?? s.unofficial_currency_code ?? "USD";
  // Some securities (private holdings, money market sweeps, etc.) come back
  // with no name AND no ticker. Fall back to the security id rather than
  // dropping the row entirely, so the holding can still link to *something*.
  const name = s.name ?? s.ticker_symbol ?? `Security ${s.security_id.slice(0, 8)}`;
  return {
    providerSecurityId: s.security_id,
    tickerSymbol: s.ticker_symbol ?? null,
    name,
    type: mapSecurityType(s.type ?? null),
    currencyCode: currency,
    latestPrice: s.close_price ?? null,
    latestPriceDate: s.close_price_as_of ?? null,
    assetClass: inferAssetClass(s.type ?? null, s.name ?? null),
  };
}

export interface MappedHolding {
  providerAccountId: string;
  providerSecurityId: string;
  quantity: number;
  costBasis: number | null;
  currentValue: number;
  currencyCode: string;
  asOf: string;
}

export function mapPlaidHolding(h: PlaidHolding): MappedHolding {
  const currency =
    h.iso_currency_code ?? h.unofficial_currency_code ?? "USD";
  // Prefer the institution-provided price datetime; fall back to today so
  // `as_of` is always set (downstream queries assume non-null).
  const asOf =
    h.institution_price_datetime ??
    h.institution_price_as_of ??
    new Date().toISOString();
  return {
    providerAccountId: h.account_id,
    providerSecurityId: h.security_id,
    quantity: h.quantity,
    costBasis: h.cost_basis ?? null,
    currentValue: h.institution_value,
    currencyCode: currency,
    asOf,
  };
}
