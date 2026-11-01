/**
 * Rebalancing-targets storage.
 *
 * Reads/writes the per-user `rebalance_settings` + `rebalance_targets` tables
 * (migration 005). Designed to degrade gracefully: if those tables don't yet
 * exist (migration not applied), reads fall back to the locked defaults and
 * `persistence` is reported as unavailable so the UI can prompt a one-time
 * setup instead of crashing. When the tables exist but the user has no rows,
 * we lazily seed the defaults.
 */
import { createClient } from "@/lib/supabase/server";
import type { BucketKey, SleeveKey } from "@/domain/sleeves";
import {
  DEFAULT_SETTINGS,
  defaultTargetsForBucket,
  normalizeTickers,
  type RebalanceSettings,
  type TargetMix,
} from "@/domain/rebalance-config";

export interface RebalanceConfig {
  settings: RebalanceSettings;
  targets: Record<BucketKey, TargetMix>;
  /** True when the rebalance_* tables exist and edits can be persisted. */
  persistence: boolean;
}

/** Raised when a save is attempted but migration 005 hasn't been applied. */
export class RebalanceTablesMissingError extends Error {
  constructor() {
    super(
      "Rebalancing tables are not set up. Apply migration 005_rebalance_targets.sql to enable saving targets.",
    );
    this.name = "RebalanceTablesMissingError";
  }
}

/** Postgres "relation does not exist": the table hasn't been created yet. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    /relation .* does not exist|could not find the table/i.test(error.message ?? "")
  );
}

interface SettingsRow {
  reserve_amount: number | string;
  single_stock_tickers: string[] | null;
  single_stock_cap_pct: number | string;
}
interface TargetRow {
  bucket: string;
  sleeve: string;
  target_pct: number | string;
}

function defaultConfig(persistence: boolean): RebalanceConfig {
  return {
    settings: { ...DEFAULT_SETTINGS, singleStockTickers: [...DEFAULT_SETTINGS.singleStockTickers] },
    targets: {
      taxable: defaultTargetsForBucket("taxable"),
      tax_advantaged: defaultTargetsForBucket("tax_advantaged"),
    },
    persistence,
  };
}

/**
 * Load the user's rebalancing config. Falls back to defaults (and reports
 * `persistence: false`) if the tables are missing; lazily seeds defaults if
 * the tables exist but the user has none yet.
 */
export async function getRebalanceConfig(userId: string): Promise<RebalanceConfig> {
  const supabase = await createClient();

  const [settingsRes, targetsRes] = await Promise.all([
    supabase
      .from("rebalance_settings")
      .select("reserve_amount, single_stock_tickers, single_stock_cap_pct")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("rebalance_targets")
      .select("bucket, sleeve, target_pct")
      .eq("user_id", userId),
  ]);

  if (isMissingTable(settingsRes.error) || isMissingTable(targetsRes.error)) {
    return defaultConfig(false);
  }
  if (settingsRes.error) throw settingsRes.error;
  if (targetsRes.error) throw targetsRes.error;

  const settingsRow = settingsRes.data as SettingsRow | null;
  const targetRows = (targetsRes.data ?? []) as TargetRow[];

  // Tables exist but the user has nothing yet: seed the defaults.
  if (!settingsRow && targetRows.length === 0) {
    const seeded = await seedDefaults(userId);
    return seeded ?? defaultConfig(true);
  }

  const settings: RebalanceSettings = settingsRow
    ? {
        reserveAmount: Number(settingsRow.reserve_amount),
        singleStockTickers: normalizeTickers(settingsRow.single_stock_tickers ?? []),
        singleStockCapPct: Number(settingsRow.single_stock_cap_pct),
      }
    : { ...DEFAULT_SETTINGS, singleStockTickers: [...DEFAULT_SETTINGS.singleStockTickers] };

  const targets: Record<BucketKey, TargetMix> = {
    taxable: {},
    tax_advantaged: {},
  };
  for (const r of targetRows) {
    if (r.bucket !== "taxable" && r.bucket !== "tax_advantaged") continue;
    targets[r.bucket][r.sleeve as SleeveKey] = Number(r.target_pct);
  }
  // Fill any bucket the user hasn't customized with defaults.
  if (Object.keys(targets.taxable).length === 0) {
    targets.taxable = defaultTargetsForBucket("taxable");
  }
  if (Object.keys(targets.tax_advantaged).length === 0) {
    targets.tax_advantaged = defaultTargetsForBucket("tax_advantaged");
  }

  return { settings, targets, persistence: true };
}

/** Insert the default rows for a brand-new user. Best-effort. */
async function seedDefaults(userId: string): Promise<RebalanceConfig | null> {
  try {
    await saveRebalanceConfig(userId, DEFAULT_SETTINGS, {
      taxable: defaultTargetsForBucket("taxable"),
      tax_advantaged: defaultTargetsForBucket("tax_advantaged"),
    });
    return defaultConfig(true);
  } catch {
    return null;
  }
}

/**
 * Persist settings + targets for a user. Upserts the single settings row and
 * replaces the user's target rows. Throws {@link RebalanceTablesMissingError}
 * if migration 005 hasn't been applied.
 */
export async function saveRebalanceConfig(
  userId: string,
  settings: RebalanceSettings,
  targets: Record<BucketKey, TargetMix>,
): Promise<void> {
  const supabase = await createClient();

  const settingsRes = await supabase.from("rebalance_settings").upsert(
    {
      user_id: userId,
      reserve_amount: settings.reserveAmount,
      single_stock_tickers: settings.singleStockTickers,
      single_stock_cap_pct: settings.singleStockCapPct,

      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (isMissingTable(settingsRes.error)) throw new RebalanceTablesMissingError();
  if (settingsRes.error) throw settingsRes.error;

  const rows: Array<{
    user_id: string;
    bucket: BucketKey;
    sleeve: string;
    target_pct: number;
    updated_at: string;
  }> = [];
  const now = new Date().toISOString();
  for (const bucket of ["taxable", "tax_advantaged"] as BucketKey[]) {
    for (const [sleeve, pct] of Object.entries(targets[bucket])) {
      if (pct == null) continue;
      rows.push({ user_id: userId, bucket, sleeve, target_pct: pct, updated_at: now });
    }
  }

  const targetsRes = await supabase
    .from("rebalance_targets")
    .upsert(rows, { onConflict: "user_id,bucket,sleeve" });
  if (isMissingTable(targetsRes.error)) throw new RebalanceTablesMissingError();
  if (targetsRes.error) throw targetsRes.error;
}
