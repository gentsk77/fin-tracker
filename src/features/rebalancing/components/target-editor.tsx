"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TARGET_SLEEVES,
  sleeveLabel,
  sleeveColor,
  type SleeveKey,
} from "@/domain/sleeves";
import { saveRebalanceTargets } from "@/server/rebalancing/actions";

type MixState = Record<string, string>;

interface InitialConfig {
  reserveAmount: number;
  singleStockTickers: string[];
  singleStockCapPct: number;
  taxable: Partial<Record<SleeveKey, number>>;
  taxAdvantaged: Partial<Record<SleeveKey, number>>;
  persistence: boolean;
}

function toMixState(mix: Partial<Record<SleeveKey, number>>): MixState {
  const out: MixState = {};
  for (const s of TARGET_SLEEVES) out[s] = String(mix[s] ?? 0);
  return out;
}

function sumMix(mix: MixState): number {
  return TARGET_SLEEVES.reduce((acc, s) => acc + (Number(mix[s]) || 0), 0);
}

function MixEditor({
  title,
  mix,
  onChange,
}: {
  title: string;
  mix: MixState;
  onChange: (sleeve: SleeveKey, value: string) => void;
}) {
  const sum = sumMix(mix);
  const balanced = Math.abs(sum - 100) <= 0.5;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span
          className={`tabular-nums text-xs font-medium ${
            balanced ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {sum.toFixed(0)}% / 100%
        </span>
      </div>
      <div className="space-y-2">
        {TARGET_SLEEVES.map((s) => (
          <label key={s} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: sleeveColor(s) }}
              />
              {sleeveLabel(s)}
            </span>
            <span className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={mix[s]}
                onChange={(e) => onChange(s, e.target.value)}
                className="h-7 w-16 text-right tabular-nums"
              />
              <span className="text-xs text-foreground-lighter">%</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Editable target panel. Lets the user adjust the cash reserve, the
 * single-stock concentration cap (tickers + percent), and
 * the two diversified-equity target mixes, then persists them via the
 * `saveRebalanceTargets` server action and refreshes the page so the engine
 * recomputes drift against the new targets.
 */
export function TargetEditor({ initial }: { initial: InitialConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reserve, setReserve] = useState(String(initial.reserveAmount));
  const [stockTickers, setStockTickers] = useState(
    initial.singleStockTickers.join(", "),
  );
  const [stockCap, setStockCap] = useState(String(initial.singleStockCapPct));
  const [taxable, setTaxable] = useState<MixState>(toMixState(initial.taxable));
  const [taxAdv, setTaxAdv] = useState<MixState>(
    toMixState(initial.taxAdvantaged),
  );
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saved" }
    | { kind: "error"; message: string; needsMigration?: boolean }
  >({ kind: "idle" });

  const taxableBalanced = Math.abs(sumMix(taxable) - 100) <= 0.5;
  const taxAdvBalanced = Math.abs(sumMix(taxAdv) - 100) <= 0.5;
  const canSave = taxableBalanced && taxAdvBalanced && !pending;

  function num(mix: MixState): Partial<Record<SleeveKey, number>> {
    const out: Partial<Record<SleeveKey, number>> = {};
    for (const s of TARGET_SLEEVES) out[s] = Number(mix[s]) || 0;
    return out;
  }

  function handleSave() {
    setStatus({ kind: "idle" });
    startTransition(async () => {
      const result = await saveRebalanceTargets({
        reserveAmount: Number(reserve) || 0,
        singleStockTickers: stockTickers,
        singleStockCapPct: Number(stockCap) || 0,
        taxable: num(taxable),
        taxAdvantaged: num(taxAdv),
      });
      if (result.ok) {
        setStatus({ kind: "saved" });
        router.refresh();
      } else {
        setStatus({
          kind: "error",
          message: result.error ?? "Couldn't save.",
          needsMigration: result.needsMigration,
        });
      }
    });
  }

  return (
    <div className="space-y-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 elevation-card">
      <div>
        <h2 className="font-heading text-base font-medium">Your targets</h2>
        <p className="text-sm text-muted-foreground">
          Adjust your reserve, concentration cap, and target mixes. Each mix
          should add up to 100%.
        </p>
      </div>

      {!initial.persistence && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          Saving needs a one-time database setup (migration 005). You can still
          edit and preview, but changes won&apos;t persist until it&apos;s
          applied.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">Cash reserve</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-foreground-lighter">$</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <span className="text-[11px] text-foreground-lighter">
            Cash &amp; CDs kept aside in the taxable bucket.
          </span>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Single stock</span>
          <Input
            type="text"
            placeholder="e.g. AAPL"
            autoCapitalize="characters"
            spellCheck={false}
            value={stockTickers}
            onChange={(e) => setStockTickers(e.target.value)}
          />
          <span className="text-[11px] text-foreground-lighter">
            Up to 5 tickers, comma-separated. Leave empty for no cap.
          </span>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Concentration cap</span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              value={stockCap}
              onChange={(e) => setStockCap(e.target.value)}
              className="tabular-nums"
            />
            <span className="text-xs text-foreground-lighter">%</span>
          </div>
          <span className="text-[11px] text-foreground-lighter">
            Max share of the whole portfolio held in those tickers.
          </span>
        </label>
      </div>


      <div className="grid gap-6 border-t border-border pt-4 sm:grid-cols-2">
        <MixEditor
          title="Taxable mix"
          mix={taxable}
          onChange={(s, v) => setTaxable((m) => ({ ...m, [s]: v }))}
        />
        <MixEditor
          title="Tax-advantaged mix"
          mix={taxAdv}
          onChange={(s, v) => setTaxAdv((m) => ({ ...m, [s]: v }))}
        />
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={!canSave}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save targets
        </Button>
        {status.kind === "saved" && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-sm text-amber-600">{status.message}</span>
        )}
        {!taxableBalanced || !taxAdvBalanced ? (
          <span className="text-xs text-foreground-lighter">
            Each mix must total 100% to save.
          </span>
        ) : null}
      </div>
    </div>
  );
}
