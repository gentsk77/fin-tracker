"use server";

/**
 * Server Actions for the rebalancing feature.
 *
 * `saveRebalanceTargets` persists the user's reserve / single-stock cap and
 * the two diversified-equity target mixes. It validates that each bucket's
 * target sleeves sum to 100 and returns a structured result so the editor can
 * show inline status (including the "run migration 005" hint when the
 * persistence tables don't exist yet).
 */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  saveRebalanceConfig,
  RebalanceTablesMissingError,
} from "@/server/db/rebalancing-targets";
import { TARGET_SLEEVES, type BucketKey, type SleeveKey } from "@/domain/sleeves";
import { normalizeTickers, type TargetMix } from "@/domain/rebalance-config";

export interface SaveRebalanceInput {
  reserveAmount: number;
  /** Free-form ticker list ("AAPL, NVDA"); normalized server-side. */
  singleStockTickers: string;
  singleStockCapPct: number;
  taxable: TargetMix;
  taxAdvantaged: TargetMix;
}

export interface SaveRebalanceResult {
  ok: boolean;
  error?: string;
  needsMigration?: boolean;
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user.id;
}

function cleanMix(mix: TargetMix): { mix: TargetMix; sum: number } {
  const out: TargetMix = {};
  let sum = 0;
  for (const sleeve of TARGET_SLEEVES) {
    const raw = Number(mix[sleeve] ?? 0);
    const pct = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    out[sleeve as SleeveKey] = pct;
    sum += pct;
  }
  return { mix: out, sum };
}

export async function saveRebalanceTargets(
  input: SaveRebalanceInput,
): Promise<SaveRebalanceResult> {
  const userId = await requireUserId();

  const reserveAmount = Number(input.reserveAmount);
  const singleStockCapPct = Number(input.singleStockCapPct);
  const singleStockTickers = normalizeTickers(String(input.singleStockTickers ?? ""));
  if (!Number.isFinite(reserveAmount) || reserveAmount < 0) {
    return { ok: false, error: "Reserve must be a non-negative number." };
  }
  if (!Number.isFinite(singleStockCapPct) || singleStockCapPct < 0 || singleStockCapPct > 100) {
    return { ok: false, error: "Concentration cap must be between 0 and 100." };
  }

  const taxable = cleanMix(input.taxable);
  const taxAdv = cleanMix(input.taxAdvantaged);
  for (const [label, { sum }] of [
    ["Taxable", taxable],
    ["Tax-advantaged", taxAdv],
  ] as const) {
    if (Math.abs(sum - 100) > 0.5) {
      return {
        ok: false,
        error: `${label} targets must add up to 100% (currently ${sum.toFixed(0)}%).`,
      };
    }
  }

  const targets: Record<BucketKey, TargetMix> = {
    taxable: taxable.mix,
    tax_advantaged: taxAdv.mix,
  };

  try {
    await saveRebalanceConfig(
      userId,
      { reserveAmount, singleStockTickers, singleStockCapPct },
      targets,
    );

  } catch (err) {
    if (err instanceof RebalanceTablesMissingError) {
      return { ok: false, needsMigration: true, error: err.message };
    }
    throw err;
  }

  revalidatePath("/rebalance");
  revalidatePath("/investments");
  return { ok: true };
}
