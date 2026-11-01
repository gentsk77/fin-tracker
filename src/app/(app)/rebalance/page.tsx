import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeftRight, ChevronRight, Landmark, TriangleAlert, Wallet } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/server/db/accounts";
import { hasInvestmentAccount } from "@/server/db/holdings";
import { getRebalanceState } from "@/server/db/rebalancing";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import { formatCurrencyWhole } from "@/lib/format";
import { BucketSection } from "@/features/rebalancing/components/bucket-section";
import { TargetEditor } from "@/features/rebalancing/components/target-editor";

/**
 * Rebalance page.
 *
 * Shows, per account bucket, how the diversified-equity allocation drifts from
 * the user's targets plus a tax-aware list of suggested moves, then an
 * editable target panel. Caveats are surfaced inline; this is decision
 * support, not advice.
 */
export default async function RebalancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const accounts = await listAccounts(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rebalance</h1>
        <p className="text-sm text-foreground-light">
          How your portfolio drifts from target, and the moves to bring it back
          (guidance, not financial advice).
        </p>
      </div>

      {!hasInvestmentAccount(accounts) ? (
        <EmptyRebalanceState />
      ) : (
        <Suspense
          fallback={
            <div className="space-y-4">
              <CardSkeleton heightClass="h-[420px]" />
              <CardSkeleton heightClass="h-[420px]" />
            </div>
          }
        >
          <RebalanceContent userId={user.id} />
        </Suspense>
      )}
    </div>
  );
}

async function RebalanceContent({ userId }: { userId: string }) {
  const state = await getRebalanceState(userId);

  const offTarget = state.buckets.reduce(
    (n, b) => n + b.sleeves.filter((s) => s.flagged).length,
    0,
  );
  const moves = state.buckets.reduce((n, b) => n + b.actions.length, 0);
  const caveats = state.buckets.flatMap((b) => b.notes);

  return (
    <div className="space-y-5">
      {/* At-a-glance summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={Wallet}
          iconTone="brand"
          label="Portfolio"
          value={formatCurrencyWhole(state.totalPortfolio)}
        />
        <MetricCard
          icon={TriangleAlert}
          iconTone={offTarget > 0 ? "warning" : "success"}
          label="Off-target sleeves"
          value={offTarget}
          hint={offTarget > 0 ? "drifting beyond their band" : "all within band"}
        />
        <MetricCard
          icon={ArrowLeftRight}
          iconTone="neutral"
          label="Suggested moves"
          value={moves}
          hint="across both buckets"
        />
      </div>

      {/* The plan, per bucket */}
      <div className="space-y-4">
        {state.buckets.map((bucket) => (
          <BucketSection key={bucket.bucket} bucket={bucket} />
        ))}
      </div>

      {/* Targets editor: tucked away; reading is the default */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-foreground-light transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          Adjust targets &amp; reserve
          {!state.persistence && (
            <span className="ml-1.5 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
              setup needed to save
            </span>
          )}
        </summary>
        <div className="pt-3">
          <TargetEditor
            initial={{
              reserveAmount: state.settings.reserveAmount,
              singleStockTickers: state.settings.singleStockTickers,
              singleStockCapPct: state.settings.singleStockCapPct,
              taxable: state.targets.taxable,
              taxAdvantaged: state.targets.tax_advantaged,
              persistence: state.persistence,
            }}
          />
        </div>
      </details>

      {/* Assumptions & caveats: collapsed */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-foreground-light transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          Assumptions &amp; caveats
        </summary>
        <ul className="space-y-2 pt-3 pl-5">
          {caveats.map((note, i) => (
            <li key={i} className="text-xs text-foreground-lighter">
              {note}
            </li>
          ))}
          <li className="text-xs text-foreground-lighter">
            Prices reflect what your brokers report to Plaid (some update only
            after market close). Suggested moves don&apos;t account for taxes beyond

            favoring new money over selling gains in taxable accounts. Always
            confirm against your broker before trading.
          </li>
        </ul>
      </details>
    </div>
  );
}

function EmptyRebalanceState() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-200 text-brand">
        <Landmark className="h-4 w-4" />
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Link an investment account</p>
          <p className="text-xs text-foreground-lighter">
            Connect a brokerage or retirement account to see allocation drift
            and rebalancing moves here.
          </p>
        </div>
        <Link
          href="/accounts"
          className="inline-flex items-center rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-brand-600"
        >
          Link account
        </Link>
      </div>
    </div>
  );
}
