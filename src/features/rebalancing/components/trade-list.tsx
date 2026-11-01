import { formatCurrencyWhole } from "@/lib/format";
import type { RebalanceAction } from "@/server/db/rebalancing";

/**
 * The rebalancing plan: an ordered, scannable checklist of moves. This is the
 * page's primary content, so it's intentionally quiet: a step number, a plain
 * instruction, and a single signed amount. Only two accent colors carry
 * meaning: green = money going in (buy / free up), red = money coming out
 * (trim / sell). The dollar amount shown is the actual suggested move, not the
 * raw gap, so it never contradicts the allocation view.
 */
export function TradeList({
  actions,
  emptyLabel = "No moves needed. This bucket is on target.",
}: {
  actions: RebalanceAction[];
  emptyLabel?: string;
}) {
  if (actions.length === 0) {
    return <p className="py-1 text-sm text-foreground-lighter">{emptyLabel}</p>;
  }

  return (
    <ol className="divide-y divide-border/70">
      {actions.map((action, i) => {
        const isSell = action.kind === "trim";
        const amountClass = isSell ? "text-destructive" : "text-success";
        const sign = isSell ? "−" : "+";
        return (
          <li key={i} className="flex items-center gap-3 py-2.5">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-foreground-light">
              {i + 1}
            </span>
            <span className="flex-1 text-sm">
              {action.label}
              {action.kind === "buy" && action.ticker && (
                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground-light">
                  {action.ticker}
                </span>
              )}
            </span>
            <span
              className={`shrink-0 tabular-nums text-sm font-semibold ${amountClass}`}
            >
              {sign}
              {formatCurrencyWhole(action.amount)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
