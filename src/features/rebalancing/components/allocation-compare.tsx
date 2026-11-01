import type { BucketState } from "@/server/db/rebalancing";

interface Row {
  label: string;
  color: string;
  currentPct: number;
  targetPct: number;
  currentValue: number;
  flagged: boolean;
}

function StackedBar({
  rows,
  field,
}: {
  rows: Row[];
  field: "currentPct" | "targetPct";
}) {
  return (
    <div className="flex h-7 w-full overflow-hidden rounded-md bg-muted">
      {rows.map((r) => {
        const pct = Math.max(0, r[field]);
        if (pct <= 0) return null;
        return (
          <div
            key={r.label}
            className="flex items-center justify-center overflow-hidden"
            style={{ width: `${pct}%`, background: r.color }}
            title={`${r.label} ${Math.round(pct)}%`}
          >
            {pct >= 9 && (
              <span className="px-1 text-[11px] font-medium tabular-nums text-white/95">
                {Math.round(pct)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Allocation evidence: two 100%-stacked bars (the bucket's current
 * diversified-equity mix above its target mix), so drift reads in a single
 * glance instead of four separate gauges. A compact legend carries the exact
 * current → target numbers. This is the "why" behind the plan, shown on demand.
 */
export function AllocationCompare({ bucket }: { bucket: BucketState }) {
  const rows: Row[] = bucket.sleeves.map((s) => ({
    label: s.label,
    color: s.color,
    currentPct: s.currentPct,
    targetPct: s.targetPct,
    currentValue: s.currentValue,
    flagged: s.flagged,
  }));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-lighter">
            Your mix
          </p>
          <StackedBar rows={rows} field="currentPct" />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-lighter">
            Target
          </p>
          <StackedBar rows={rows} field="targetPct" />
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: r.color }}
              />
              <span className={r.flagged ? "font-medium" : ""}>{r.label}</span>
            </span>
            <span className="tabular-nums text-foreground-light">
              {Math.round(r.currentPct)}%
              <span className="text-foreground-lighter">
                {" "}
                → {Math.round(r.targetPct)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
