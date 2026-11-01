/**
 * Connection (external provider Item) DB helpers.
 *
 * RLS policies on the `connections` table restrict all access to the
 * authenticated user, so these helpers don't need to explicitly filter
 * by user_id. We still do, as defense-in-depth.
 */
import { createClient } from "@/lib/supabase/server";

export interface ConnectionRow {
  id: string;
  user_id: string;
  provider: "plaid" | "manual";
  provider_item_id: string | null;
  institution_id: string | null;
  institution_name: string | null;
  status: "active" | "error" | "requires_reauth" | "removed";
  access_token_encrypted: string | null;
  transactions_cursor: string | null;
  last_synced_at: string | null;
  sync_started_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function listConnections(userId: string): Promise<ConnectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConnectionRow[];
}

export async function getConnection(
  connectionId: string,
  userId: string
): Promise<ConnectionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConnectionRow | null) ?? null;
}

export interface CreateConnectionInput {
  userId: string;
  providerItemId: string;
  institutionId: string | null;
  institutionName: string | null;
  accessTokenEncrypted: string;
}

export async function createConnection(
  input: CreateConnectionInput
): Promise<ConnectionRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("connections")
    .insert({
      user_id: input.userId,
      provider: "plaid",
      provider_item_id: input.providerItemId,
      institution_id: input.institutionId,
      institution_name: input.institutionName,
      access_token_encrypted: input.accessTokenEncrypted,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ConnectionRow;
}

export interface UpdateConnectionInput {
  status?: ConnectionRow["status"];
  transactionsCursor?: string | null;
  lastSyncedAt?: string | null;
  syncStartedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export async function updateConnection(
  connectionId: string,
  userId: string,
  input: UpdateConnectionInput
): Promise<void> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.transactionsCursor !== undefined)
    patch.transactions_cursor = input.transactionsCursor;
  if (input.lastSyncedAt !== undefined) patch.last_synced_at = input.lastSyncedAt;
  if (input.syncStartedAt !== undefined)
    patch.sync_started_at = input.syncStartedAt;
  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;

  const { error } = await supabase
    .from("connections")
    .update(patch)
    .eq("id", connectionId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function softDeleteConnection(
  connectionId: string,
  userId: string
): Promise<void> {
  await updateConnection(connectionId, userId, { status: "removed" });
}

/**
 * Atomically claim the per-connection sync lock by setting
 * `sync_started_at = now()` only if it is null OR older than 5 minutes
 * (stale-lock recovery) AND the connection hasn't been synced within the
 * staleness window. Returns the connection row when the claim succeeds,
 * or `null` if another caller already holds the lock or the connection
 * was synced recently.
 */
export async function tryClaimSyncLock(
  connectionId: string,
  userId: string,
  options: { staleAfterMs: number }
): Promise<ConnectionRow | null> {
  const supabase = await createClient();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const recentBefore = new Date(now.getTime() - options.staleAfterMs).toISOString();

  // PostgREST translates `or(...)` into an OR group inside the WHERE clause.
  // We claim only when (no lock OR stale lock) AND (never synced OR stale sync).
  const { data, error } = await supabase
    .from("connections")
    .update({ sync_started_at: now.toISOString() })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`sync_started_at.is.null,sync_started_at.lt.${staleBefore}`)
    .or(`last_synced_at.is.null,last_synced_at.lt.${recentBefore}`)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data as ConnectionRow | null) ?? null;
}
