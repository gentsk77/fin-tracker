/**
 * Account DB helpers.
 *
 * Accounts are upserted by (connection_id, provider_account_id) per Plaid Item.
 * The current schema doesn't declare a unique constraint on that pair, so we
 * implement upsert manually via a select + update/insert. This is acceptable
 * because the number of accounts per Item is small (typically < 10).
 */
import { createClient } from "@/lib/supabase/server";
import {
  assetCategoryFor,
  signedBalance,
  type AssetCategoryKey,
} from "@/domain/money";
import type { AccountTaxType, AccountType } from "@/types";

export interface AccountRow {
  id: string;
  user_id: string;
  connection_id: string | null;
  provider: "plaid" | "manual";
  provider_account_id: string | null;
  institution_name: string | null;
  name: string;
  official_name: string | null;
  type: AccountType;
  tax_type: AccountTaxType;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  currency_code: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listAccounts(userId: string): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("type", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AccountRow[];
}

export async function countAccounts(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("accounts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

export interface NetWorthBreakdown {
  totalAssets: number;
  totalLiabilities: number; // positive magnitude (sum of debts owed)
  netWorth: number;
  /** Sum of magnitudes by account type (always >= 0). Used for breakdown UI. */
  byType: Partial<Record<AccountType, number>>;
  /**
   * Sum of positive (asset-side) balances grouped into broad money-split
   * categories. Liabilities are NOT included here; see `totalLiabilities`.
   * Always >= 0 per category.
   */
  byCategory: Partial<Record<AssetCategoryKey, number>>;
  /** Source rows so callers can avoid a second fetch when rendering details. */
  accounts: AccountRow[];
  /** True if any non-USD balances were skipped from totals. */
  hadNonUsdAccounts: boolean;
}

/**
 * Compute total assets, liabilities, and net worth from active accounts.
 *
 * Asset/liability classification is derived from the SIGNED balance rather
 * than from `type` alone. This way:
 *   - an overpaid credit card (negative balance on a liability type) flips
 *     to contribute positively to assets
 *   - an overdrafted checking account (negative balance on an asset type)
 *     contributes to liabilities
 *
 * Non-USD accounts are excluded from totals for now (multi-currency support
 * comes later). `hadNonUsdAccounts` lets the UI surface that limitation.
 */
export async function getNetWorthBreakdown(
  userId: string
): Promise<NetWorthBreakdown> {
  const accounts = await listAccounts(userId);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let hadNonUsdAccounts = false;
  const byType: Partial<Record<AccountType, number>> = {};
  const byCategory: Partial<Record<AssetCategoryKey, number>> = {};

  for (const account of accounts) {
    if (account.currency_code !== "USD") {
      hadNonUsdAccounts = true;
      continue;
    }
    const signed = signedBalance(account);
    if (signed > 0) totalAssets += signed;
    else if (signed < 0) totalLiabilities += -signed;

    const magnitude = Math.abs(signed);
    if (magnitude > 0) {
      byType[account.type] = (byType[account.type] ?? 0) + magnitude;
    }

    // Money-split categorization: only positive (asset-side) contributions
    // count. We deliberately use `signed > 0` rather than `assetCategoryFor`
    // alone, so that an overpaid credit card (liability type, positive
    // signed balance) correctly contributes to the appropriate cash-like
    // bucket, but for now those flow into the existing `byType` view only.
    // Standard asset accounts with positive balances feed `byCategory`.
    if (signed > 0) {
      const category = assetCategoryFor(account.type);
      if (category) {
        byCategory[category] = (byCategory[category] ?? 0) + signed;
      }
    }
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    byType,
    byCategory,
    accounts,
    hadNonUsdAccounts,
  };
}

export interface UpsertAccountInput {
  userId: string;
  connectionId: string;
  providerAccountId: string;
  institutionName: string | null;
  name: string;
  officialName: string | null;
  type: AccountType;
  taxType: AccountTaxType;
  currentBalance: number | null;
  availableBalance: number | null;
  creditLimit: number | null;
  currencyCode: string;
}

export async function upsertAccount(
  input: UpsertAccountInput
): Promise<{ id: string }> {
  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", input.userId)
    .eq("connection_id", input.connectionId)
    .eq("provider_account_id", input.providerAccountId)
    .maybeSingle();
  if (selectError) throw selectError;

  const payload = {
    user_id: input.userId,
    connection_id: input.connectionId,
    provider: "plaid" as const,
    provider_account_id: input.providerAccountId,
    institution_name: input.institutionName,
    name: input.name,
    official_name: input.officialName,
    type: input.type,
    tax_type: input.taxType,
    current_balance: input.currentBalance,
    available_balance: input.availableBalance,
    credit_limit: input.creditLimit,
    currency_code: input.currencyCode,
    is_active: true,
    last_synced_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("accounts")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Flip is_active=false on every account associated with a connection.
 * Used when the user unlinks a Plaid connection; accounts use ON DELETE
 * SET NULL for their connection_id FK, so without this step the accounts
 * would become orphan rows that still show up in `listAccounts` (which
 * only filters by user_id + is_active).
 */
export async function deactivateAccountsForConnection(
  connectionId: string,
  userId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false })
    .eq("connection_id", connectionId)
    .eq("user_id", userId);
  if (error) throw error;
}
