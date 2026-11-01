"use server";

/**
 * Server Actions for Plaid integration.
 *
 * - `createLinkToken`     : called from the client before opening Plaid Link
 * - `exchangePublicToken` : called from the client's onSuccess callback;
 *                           exchanges the public token for an access token,
 *                           persists the connection, and runs an initial sync
 * - `syncConnectionAction`: re-syncs an existing connection (e.g. "Sync now" button)
 * - `removeConnection`    : soft-deletes a connection and calls /item/remove on Plaid
 */
import { revalidatePath } from "next/cache";
import { CountryCode, Products } from "plaid";

import { createClient } from "@/lib/supabase/server";
import { getPlaidClient } from "@/server/plaid/client";
import { encryptToken, decryptToken } from "@/server/plaid/encryption";
import { syncConnection } from "@/server/plaid/sync";
import {
  createConnection,
  getConnection,
  listConnections,
  softDeleteConnection,
  tryClaimSyncLock,
} from "@/server/db/connections";
import { deactivateAccountsForConnection } from "@/server/db/accounts";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function createLinkToken(): Promise<string> {
  const user = await requireUser();
  const plaid = getPlaidClient();

  const response = await plaid.linkTokenCreate({
    user: { client_user_id: user.id },
    client_name: "Fin-Tracker",
    // Only Transactions is *required*. Plaid filters Link to institutions that
    // support every product in `products`, so requiring Investments here hides
    // any institution without brokerage data: credit cards, and most
    // checking/savings banks ("Connectivity not supported"). Requesting
    // Investments as optional keeps those institutions linkable while still
    // pulling holdings best-effort for brokerages that support it. Our sync
    // already skips the holdings fetch for Items with no investment accounts.
    products: [Products.Transactions],
    optional_products: [Products.Investments],
    country_codes: [CountryCode.Us],
    language: "en",
  });

  return response.data.link_token;
}

export interface ExchangePublicTokenInput {
  institution: { institution_id: string; name: string } | null;
}

export interface ExchangePublicTokenResult {
  connectionId: string;
  synced: boolean;
  syncError: string | null;
}

export async function exchangePublicToken(
  publicToken: string,
  metadata: ExchangePublicTokenInput
): Promise<ExchangePublicTokenResult> {
  const user = await requireUser();
  const plaid = getPlaidClient();

  const exchange = await plaid.itemPublicTokenExchange({
    public_token: publicToken,
  });
  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;

  const connection = await createConnection({
    userId: user.id,
    providerItemId: itemId,
    institutionId: metadata.institution?.institution_id ?? null,
    institutionName: metadata.institution?.name ?? null,
    accessTokenEncrypted: encryptToken(accessToken),
  });

  let synced = true;
  let syncError: string | null = null;
  try {
    await syncConnection(connection.id, user.id);
  } catch (err) {
    synced = false;
    syncError = err instanceof Error ? err.message : String(err);
  }

  revalidatePath("/overview");
  revalidatePath("/accounts");
  revalidatePath("/net-worth");

  return { connectionId: connection.id, synced, syncError };
}

export async function syncConnectionAction(connectionId: string): Promise<void> {
  const user = await requireUser();
  await syncConnection(connectionId, user.id);

  revalidatePath("/overview");
  revalidatePath("/accounts");
  revalidatePath("/net-worth");
}

export async function removeConnection(connectionId: string): Promise<void> {
  const user = await requireUser();
  const connection = await getConnection(connectionId, user.id);
  if (!connection) return;

  // Best-effort: tell Plaid the item is gone so we stop being billed.
  if (connection.access_token_encrypted) {
    try {
      const accessToken = decryptToken(connection.access_token_encrypted);
      await getPlaidClient().itemRemove({ access_token: accessToken });
    } catch {
      // Swallow: the local soft-delete is still useful even if Plaid call fails.
    }
  }

  // Deactivate the accounts first. Their FK to connections is ON DELETE SET
  // NULL so even a hard delete would leave them as active rows; this flip
  // hides them from the rest of the UI consistently.
  await deactivateAccountsForConnection(connectionId, user.id);
  await softDeleteConnection(connectionId, user.id);

  revalidatePath("/overview");
  revalidatePath("/accounts");
  revalidatePath("/net-worth");
  revalidatePath("/spending");
  revalidatePath("/investments");
}

export interface AutoSyncResult {
  attemptedCount: number;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
}

/**
 * Background-sync entry point invoked from the (app) layout on first
 * mount per browser session. For each `status='active'` connection that
 * hasn't been synced in the last 6 hours, atomically claim a per-connection
 * lock (`sync_started_at`) and run `syncConnection`. The lock prevents
 * multi-tab and Strict-Mode races from double-syncing the same connection.
 *
 * Connections in `error` / `requires_reauth` are skipped; they need user
 * action, not retry.
 *
 * After all syncs succeed at least once, kick off a best-effort backfill
 * if the user has no backfill snapshot yet (mirrors `syncConnectionAction`
 * so the trend chart populates for users who linked before backfill shipped).
 *
 * Defensive: every per-connection operation is wrapped in try/catch so that
 * a transient error (or a pending migration like 003) can't take the whole
 * auto-sync down or surface as an unhandled rejection in the boundary.
 */
export async function autoSyncStaleConnections(): Promise<AutoSyncResult> {
  const user = await requireUser();
  const connections = await listConnections(user.id);

  const staleAfterMs = 6 * 60 * 60 * 1000;

  let attempted = 0;
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const conn of connections) {
    if (conn.status !== "active") {
      skipped += 1;
      continue;
    }

    let claimed = null;
    try {
      claimed = await tryClaimSyncLock(conn.id, user.id, { staleAfterMs });
    } catch (err) {
      // Most likely: pending migration (sync_started_at column missing).
      // Surface to logs and skip; manual sync still works in the meantime.
      console.error(
        `[autoSyncStaleConnections] lock claim failed for connection ${conn.id}`,
        err,
      );
      skipped += 1;
      continue;
    }

    if (!claimed) {
      // Either fresh, already in-flight elsewhere, or just synced.
      skipped += 1;
      continue;
    }

    attempted += 1;
    try {
      await syncConnection(conn.id, user.id);
      synced += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `[autoSyncStaleConnections] sync failed for connection ${conn.id}`,
        err,
      );
      // syncConnection already clears the lock and writes status=error.
    }
  }

  if (synced > 0) {
    revalidatePath("/overview");
    revalidatePath("/accounts");
    revalidatePath("/net-worth");
    revalidatePath("/spending");
    revalidatePath("/investments");
  }

  return {
    attemptedCount: attempted,
    syncedCount: synced,
    failedCount: failed,
    skippedCount: skipped,
  };
}
