/**
 * Core domain types for Fin-Tracker.
 *
 * These types model the provider-neutral internal representation of
 * accounts, transactions, holdings, and net-worth data.
 */

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type AccountType =
  | "checking"
  | "savings"
  | "credit"
  | "loan"
  | "mortgage"
  | "investment"
  | "retirement"
  | "other";

export type AccountTaxType =
  | "taxable"
  | "traditional_retirement"
  | "roth_retirement"
  | "hsa"
  | "education"
  | "unknown";

export interface Account {
  id: string;
  userId: string;
  connectionId: string;
  provider: "plaid" | "manual";
  providerAccountId: string | null;
  institutionName: string | null;
  name: string;
  officialName: string | null;
  type: AccountType;
  taxType: AccountTaxType;
  currentBalance: number | null;
  availableBalance: number | null;
  currencyCode: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface Transaction {
  id: string;
  accountId: string;
  providerTransactionId: string | null;
  amount: number;
  currencyCode: string;
  date: string;
  name: string;
  merchantName: string | null;
  category: string | null;
  subcategory: string | null;
  pending: boolean;
  type: "debit" | "credit";
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Investment Holdings
// ---------------------------------------------------------------------------

export interface Security {
  id: string;
  providerSecurityId: string | null;
  tickerSymbol: string | null;
  name: string;
  type: "equity" | "etf" | "mutual_fund" | "bond" | "cash" | "crypto" | "other";
  currencyCode: string;
  latestPrice: number | null;
  latestPriceDate: string | null;
}

export interface Holding {
  id: string;
  accountId: string;
  securityId: string;
  quantity: number;
  costBasis: number | null;
  currentValue: number;
  currencyCode: string;
  asOf: string;
}

// ---------------------------------------------------------------------------
// Asset Allocation & Rebalancing
// ---------------------------------------------------------------------------

export type AssetClass =
  | "us_stocks"
  | "international_stocks"
  | "bonds"
  | "cash"
  | "real_estate"
  | "crypto"
  | "alternatives"
  | "other";

export interface AllocationTarget {
  assetClass: AssetClass;
  targetPercent: number; // 0–100
}

export interface AllocationDrift {
  assetClass: AssetClass;
  targetPercent: number;
  currentPercent: number;
  driftPercent: number; // current - target
  currentValue: number;
}

// ---------------------------------------------------------------------------
// Net Worth
// ---------------------------------------------------------------------------

export interface NetWorthSnapshot {
  id: string;
  userId: string;
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  breakdown: Record<string, number>; // e.g. { checking: 5000, investment: 80000, ... }
  createdAt: string;
}

export interface ManualAsset {
  id: string;
  userId: string;
  name: string;
  category: string; // "real_estate", "vehicle", "crypto", "other"
  currentValue: number;
  currencyCode: string;
  notes: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Connections (provider-abstracted)
// ---------------------------------------------------------------------------

export interface ExternalConnection {
  id: string;
  userId: string;
  provider: "plaid" | "manual";
  providerItemId: string | null;
  institutionId: string | null;
  institutionName: string | null;
  status: "active" | "error" | "requires_reauth" | "removed";
  lastSyncedAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}
