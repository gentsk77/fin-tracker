/**
 * Plaid sync orchestration.
 *
 * One public function: `syncConnection(connectionId, userId)`.
 *
 *   1. Decrypt the Plaid access token for the connection
 *   2. Fetch all accounts for the Plaid Item -> upsert into `accounts`
 *   3. Page through /transactions/sync until `has_more` is false, applying
 *      added / modified / removed sets and persisting the new cursor
 *   4. Update the connection's `last_synced_at` and clear any prior error
 *
 * Errors mid-sync are caught and persisted on the connection row so the
 * UI can surface them; the function still throws so callers know.
 */
import { getPlaidClient } from "@/server/plaid/client";
import { decryptToken } from "@/server/plaid/encryption";
import {
  mapAccount,
  mapPlaidHolding,
  mapPlaidSecurity,
  mapRemovedTransactionIds,
  mapTransaction,
} from "@/server/plaid/mappers";
import { upsertAccount } from "@/server/db/accounts";
import {
  getConnection,
  updateConnection,
  type ConnectionRow,
} from "@/server/db/connections";
import { recordTodaysSnapshot } from "@/server/db/snapshots";
import { upsertSecurity } from "@/server/db/securities";
import { replaceHoldingsForAccount } from "@/server/db/holdings";
import {
  deleteTransactionsByProviderIds,
  insertTransactions,
  updateTransactions,
  type InsertTransactionInput,
} from "@/server/db/transactions";

export interface SyncResult {
  accounts: number;
  added: number;
  modified: number;
  removed: number;
  holdings: number;
}

export async function syncConnection(
  connectionId: string,
  userId: string
): Promise<SyncResult> {
  const connection = await getConnection(connectionId, userId);
  if (!connection) throw new Error("Connection not found.");
  if (!connection.access_token_encrypted) {
    throw new Error("Connection has no stored access token.");
  }

  const accessToken = decryptToken(connection.access_token_encrypted);
  const plaid = getPlaidClient();

  try {
    const result = await runSync(plaid, connection, userId, accessToken);
    await updateConnection(connectionId, userId, {
      status: "active",
      errorCode: null,
      errorMessage: null,
      lastSyncedAt: new Date().toISOString(),
      syncStartedAt: null,
    });

    // Record a snapshot for today using the now-updated account balances.
    // Failure here should NOT fail the sync; snapshot writing is best-effort
    // observability data, not a correctness invariant.
    try {
      await recordTodaysSnapshot(userId);
    } catch (snapshotErr) {
      console.error(
        "[sync] recordTodaysSnapshot failed (non-fatal)",
        snapshotErr,
      );
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateConnection(connectionId, userId, {
      status: "error",
      errorMessage: message.slice(0, 500),
      syncStartedAt: null,
    });
    throw err;
  }
}

type HoldingsResponse = Awaited<
  ReturnType<ReturnType<typeof getPlaidClient>["investmentsHoldingsGet"]>
>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Force a fresh holdings extraction, then poll until Plaid returns them.
 *
 * `/investments/holdings/get` serves a cached result. For a just-linked Item
 * the cache can be empty for a short while. Some large brokerages in production are the
 * reproducible case: the Item reports `billed_products: ["investments"]` and a
 * successful update, yet holdings come back `0`. Calling `/investments/refresh`
 * triggers an on-demand pull from the institution; the real holdings then land
 * within a few seconds. We poll up to ~18s and fall back to the last response
 * (which may legitimately be empty, e.g. a cash-only brokerage) rather than
 * failing the sync.
 */
async function refreshAndAwaitHoldings(
  plaid: ReturnType<typeof getPlaidClient>,
  accessToken: string,
  initial: HoldingsResponse,
): Promise<HoldingsResponse> {
  try {
    await plaid.investmentsRefresh({ access_token: accessToken });
  } catch (refreshErr) {
    // `/investments/refresh` isn't enabled on every Plaid plan; if it's not
    // available, keep whatever the initial holdings call returned.
    const message =
      refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
    console.error(`[sync] investmentsRefresh failed (non-fatal): ${message}`);
    return initial;
  }

  let latest = initial;
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(3000);
    latest = await plaid.investmentsHoldingsGet({ access_token: accessToken });
    if (latest.data.holdings.length > 0) break;
  }
  return latest;
}

async function runSync(
  plaid: ReturnType<typeof getPlaidClient>,
  connection: ConnectionRow,
  userId: string,
  accessToken: string
): Promise<SyncResult> {
  // 1. Accounts
  const accountsResponse = await plaid.accountsGet({ access_token: accessToken });
  const plaidAccounts = accountsResponse.data.accounts;
  const accountIdMap = new Map<string, string>();

  for (const acc of plaidAccounts) {
    const mapped = mapAccount(acc);
    const dbAccount = await upsertAccount({
      userId,
      connectionId: connection.id,
      providerAccountId: mapped.providerAccountId,
      institutionName: connection.institution_name,
      name: mapped.name,
      officialName: mapped.officialName,
      type: mapped.type,
      taxType: mapped.taxType,
      currentBalance: mapped.currentBalance,
      availableBalance: mapped.availableBalance,
      creditLimit: mapped.creditLimit,
      currencyCode: mapped.currencyCode,
    });
    accountIdMap.set(mapped.providerAccountId, dbAccount.id);
  }

  // 2. Holdings (investments): best-effort, runs only if the Item has at
  // least one investment-flavored account. A failure here is logged and
  // swallowed so a flaky investments endpoint doesn't kill the whole sync
  // (transactions are more important to keep flowing).
  let holdingsSynced = 0;
  const hasInvestmentAccount = plaidAccounts.some(
    (a) => a.type === "investment" || a.type === "brokerage",
  );
  if (hasInvestmentAccount) {
    try {
      let holdingsResponse = await plaid.investmentsHoldingsGet({
        access_token: accessToken,
      });

      // Some institutions (several large brokerages do this) return an empty holdings
      // cache on the first call right after link even though the Item is fully
      // initialized for Investments. Force a refresh + poll so a freshly linked
      // account populates immediately, without the user having to sync again.
      if (holdingsResponse.data.holdings.length === 0) {
        holdingsResponse = await refreshAndAwaitHoldings(
          plaid,
          accessToken,
          holdingsResponse,
        );
      }

      const data = holdingsResponse.data;

      // Upsert all securities first so we have a providerSecurityId ->
      // securityId map ready when we insert holdings.
      const securityIdMap = new Map<string, string>();
      for (const sec of data.securities) {
        const mapped = mapPlaidSecurity(sec);
        const row = await upsertSecurity(mapped);
        securityIdMap.set(mapped.providerSecurityId, row.id);
      }

      // Group holdings by account so we can do one replace-per-account.
      const byAccount = new Map<string, typeof data.holdings>();
      for (const h of data.holdings) {
        const arr = byAccount.get(h.account_id) ?? [];
        arr.push(h);
        byAccount.set(h.account_id, arr);
      }

      // For every investment account, replace its holdings (or clear them
      // if the user sold off everything). Accounts that aren't in our
      // accountIdMap are skipped; they'd already be filtered out by the
      // account sync step above.
      for (const acc of plaidAccounts) {
        if (acc.type !== "investment" && acc.type !== "brokerage") continue;
        const accountDbId = accountIdMap.get(acc.account_id);
        if (!accountDbId) continue;

        const holdingsForAccount = byAccount.get(acc.account_id) ?? [];
        const mappedHoldings = holdingsForAccount
          .map((h) => mapPlaidHolding(h))
          .map((mh) => {
            const securityId = securityIdMap.get(mh.providerSecurityId);
            if (!securityId) return null;
            return {
              securityId,
              quantity: mh.quantity,
              costBasis: mh.costBasis,
              currentValue: mh.currentValue,
              currencyCode: mh.currencyCode,
              asOf: mh.asOf,
            };
          })
          .filter((h): h is NonNullable<typeof h> => h !== null);

        await replaceHoldingsForAccount(userId, accountDbId, mappedHoldings);
        holdingsSynced += mappedHoldings.length;
      }
    } catch (holdingsErr) {
      // Non-fatal: a flaky investments endpoint (or a holdings-specific DB
      // error) shouldn't kill transaction sync. But log it LOUDLY with the
      // extracted message so it can't hide; this step silently swallowing an
      // RLS error is exactly what made investments appear broken before.
      const message =
        holdingsErr instanceof Error ? holdingsErr.message : String(holdingsErr);
      console.error(
        `[sync] holdings sync failed (non-fatal) for connection ${connection.id}: ${message}`,
        holdingsErr,
      );
    }
  }

  // 3. Transactions sync loop
  let cursor: string | undefined = connection.transactions_cursor ?? undefined;
  let hasMore = true;
  let added = 0;
  let modified = 0;
  const removedProviderIds: string[] = [];

  while (hasMore) {
    const response = await plaid.transactionsSync({
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
    });
    const data = response.data;

    const addedRows = data.added
      .map((t) => toInsertInput(mapTransaction(t), accountIdMap, userId))
      .filter((r): r is InsertTransactionInput => r !== null);
    const modifiedRows = data.modified
      .map((t) => toInsertInput(mapTransaction(t), accountIdMap, userId))
      .filter((r): r is InsertTransactionInput => r !== null);

    await insertTransactions(addedRows);
    await updateTransactions(modifiedRows);

    added += addedRows.length;
    modified += modifiedRows.length;
    removedProviderIds.push(...mapRemovedTransactionIds(data.removed));

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await deleteTransactionsByProviderIds(removedProviderIds);

  // 4. Persist new cursor
  await updateConnection(connection.id, userId, {
    transactionsCursor: cursor ?? null,
  });

  return {
    accounts: plaidAccounts.length,
    added,
    modified,
    removed: removedProviderIds.length,
    holdings: holdingsSynced,
  };
}

function toInsertInput(
  mapped: ReturnType<typeof mapTransaction>,
  accountIdMap: Map<string, string>,
  userId: string
): InsertTransactionInput | null {
  const accountId = accountIdMap.get(mapped.providerAccountId);
  if (!accountId) {
    // Transaction for an account we haven't synced; skip and let next run pick up.
    return null;
  }
  return {
    userId,
    accountId,
    providerTransactionId: mapped.providerTransactionId,
    amount: mapped.amount,
    currencyCode: mapped.currencyCode,
    date: mapped.date,
    name: mapped.name,
    merchantName: mapped.merchantName,
    category: mapped.category,
    subcategory: mapped.subcategory,
    pending: mapped.pending,
    type: mapped.type,
  };
}
