import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrencyWhole } from "@/lib/format";
import type { BucketState } from "@/server/db/rebalancing";
import { AllocationCompare } from "./allocation-compare";
import { TradeList } from "./trade-list";

/** A light, muted line of context facts under the bucket header. */
function ContextLine({ bucket }: { bucket: BucketState }) {
  const { reserve, singleStock, setAside } = bucket;
  const facts: ReactNode[] = [];

  if (reserve) {
    facts.push(
      <span key="reserve">
        Reserve {formatCurrencyWhole(reserve.reserveHeld)} held
      </span>,
    );
  }
  if (singleStock) {
    facts.push(
      <span key="single-stock" className={singleStock.over ? "text-warning" : undefined}>
        {singleStock.tickers.join(", ")} {singleStock.pctOfTotal.toFixed(0)}% of
        portfolio · cap {singleStock.capPct}%
      </span>,
    );
  }

  if (setAside) {
    facts.push(
      <span key="setaside">
        Target-date {formatCurrencyWhole(setAside.value)} set aside
      </span>,
    );
  }
  if (facts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-lighter">
      {facts.map((f, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden>·</span>}
          {f}
        </span>
      ))}
    </div>
  );
}

/**
 * One account bucket (Taxable or Tax-advantaged), restructured answer-first:
 * a compact header + context line, then THE PLAN (suggested moves) as the
 * primary content, the inline rationale for anything we're deliberately not
 * touching, and the current-vs-target allocation chart tucked behind a
 * disclosure as supporting evidence.
 */
export function BucketSection({ bucket }: { bucket: BucketState }) {
  return (
    <section className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border elevation-card sm:p-5">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              {bucket.label}
              <span className="tabular-nums text-sm font-normal text-foreground-lighter">
                {formatCurrencyWhole(bucket.totalValue)}
              </span>
            </h2>
          </div>
          <StatusBadge tone={bucket.needsRebalance ? "warning" : "success"} dot>
            {bucket.needsRebalance ? "Rebalance suggested" : "On track"}
          </StatusBadge>
        </div>
        <ContextLine bucket={bucket} />
      </header>

      {/* The plan: primary content */}
      <div>
        <p className="eyebrow mb-1.5">The plan</p>
        <TradeList actions={bucket.actions} />
      </div>

      {/* Why we're holding something as-is */}
      {bucket.rationale.length > 0 && (
        <ul className="space-y-1 border-t border-border/70 pt-3">
          {bucket.rationale.map((note, i) => (
            <li key={i} className="text-xs text-foreground-lighter">
              {note}
            </li>
          ))}
        </ul>
      )}

      {/* Evidence on demand */}
      <details className="group border-t border-border/70 pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-foreground-light transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          Show current vs target
        </summary>
        <div className="pt-4">
          <AllocationCompare bucket={bucket} />
        </div>
      </details>
    </section>
  );
}
