import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { sleeveColor } from "@/domain/sleeves";
import { formatCurrencyWhole } from "@/lib/format";

import { getRebalanceState } from "@/server/db/rebalancing";

interface Issue {
  color: string;
  label: string;
  detail: string;
}

/**
 * Compact rebalancing summary for the Assets page. Surfaces the few biggest
 * allocation issues (a single stock over its concentration cap, the most
 * off-target sleeves) and links to the full Rebalance page.
 */
export async function RebalanceSummaryCard({ userId }: { userId: string }) {
  const state = await getRebalanceState(userId);
  const needs = state.buckets.some((b) => b.needsRebalance);

  const issues: Issue[] = [];
  for (const b of state.buckets) {
    if (b.singleStock?.over) {
      issues.push({
        color: sleeveColor("single_stock"),
        label: `${b.singleStock.tickers.join(", ")} ${b.singleStock.pctOfTotal.toFixed(0)}%, over the ${b.singleStock.capPct}% concentration cap`,
        detail: `Trim ${formatCurrencyWhole(b.singleStock.trim)}`,
      });
    }
  }
  const flagged = state.buckets.flatMap((b) =>
    b.sleeves
      .filter((s) => s.flagged)
      .map((s) => ({ bucketLabel: b.label, s })),
  );
  flagged.sort((a, b) => Math.abs(b.s.driftPct) - Math.abs(a.s.driftPct));
  for (const { bucketLabel, s } of flagged) {
    issues.push({
      color: s.color,
      label: `${s.label} ${s.driftPct > 0 ? "+" : ""}${s.driftPct.toFixed(0)} pts · ${bucketLabel}`,
      detail: s.gap > 100 ? `Buy ${formatCurrencyWhole(s.gap)}` : `Over ${formatCurrencyWhole(-s.gap)}`,
    });
  }
  const top = issues.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rebalancing</CardTitle>
        <CardDescription>Drift from your target allocation.</CardDescription>
        <CardAction>
          <Link
            href="/rebalance"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-600"
          >
            View <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!needs ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            <p className="text-sm font-medium">On track</p>
            <p className="text-xs text-foreground-lighter">
              Every sleeve is within its target band.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {top.map((issue, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: issue.color }}
                  />
                  {issue.label}
                </span>
                <span className="shrink-0 tabular-nums text-xs font-medium text-foreground-light">
                  {issue.detail}
                </span>
              </li>
            ))}
            <li className="pt-1">
              <Link
                href="/rebalance"
                className="text-xs font-medium text-brand hover:text-brand-600"
              >
                See all moves →
              </Link>
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
