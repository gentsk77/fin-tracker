import { Suspense } from "react";
import Link from "next/link";
import { DollarSign, Landmark, LineChart, Percent } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/server/db/accounts";
import {
  getAssetAllocation,
  getPortfolioAccounts,
  getPortfolioDayChange,
  getPortfolioSummary,
  hasInvestmentAccount,
} from "@/server/db/holdings";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { MetricCard } from "@/components/ui/metric-card";
import { HoldingsTable } from "@/features/investments/components/holdings-table";
import { InvestmentsAllocationCard } from "@/features/investments/components/investments-allocation-card";
import { RebalanceSummaryCard } from "@/features/rebalancing/components/rebalance-summary-card";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";

/**
 * Investments page.
 *
 * Up front we do an auth check + cheap account list to decide between two
 * branches:
 *   - No investment-flavored account → onboarding CTA pointing at /accounts.
 *   - At least one investment account → render the real page with per-card
 *     `<Suspense>` boundaries so each section streams in independently.
 *
 * The Rebalancing card summarizes drift and links to /rebalance. Caveats (cost basis missing, non-USD holdings,
 * today's change unavailable) are surfaced inline on the relevant cards
 * instead of in a banner so the user sees them in context.
 */
export default async function InvestmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const accounts = await listAccounts(user.id);
  const hasInvestmentAcct = hasInvestmentAccount(accounts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
        <p className="text-sm text-foreground-light">
          Your portfolio value, allocation, and holdings, including
          investment-linked cash.
        </p>
      </div>

      {!hasInvestmentAcct ? (
        <EmptyInvestmentsState />
      ) : (
        <>
          <Suspense
            fallback={
              <div className="grid gap-3 lg:grid-cols-3">
                <CardSkeleton heightClass="h-[88px]" />
                <CardSkeleton heightClass="h-[88px]" />
                <CardSkeleton heightClass="h-[88px]" />
              </div>
            }
          >
            <PortfolioMetricsSection userId={user.id} />
          </Suspense>

          <div className="grid gap-4 lg:grid-cols-2">
            <Suspense fallback={<CardSkeleton heightClass="h-[240px]" />}>
              <AssetAllocationSection userId={user.id} />
            </Suspense>
            <Suspense fallback={<CardSkeleton heightClass="h-[240px]" />}>
              <RebalanceSummaryCard userId={user.id} />
            </Suspense>
          </div>

          <Suspense fallback={<CardSkeleton heightClass="h-[320px]" />}>
            <HoldingsSection userId={user.id} />
          </Suspense>
        </>
      )}
    </div>
  );
}

function EmptyInvestmentsState() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-200 text-brand">
        <Landmark className="h-4 w-4" />
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Link an investment account</p>
          <p className="text-xs text-foreground-lighter">
            Connect a brokerage or retirement account to see portfolio value,
            holdings, and allocation here.
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

async function PortfolioMetricsSection({ userId }: { userId: string }) {
  const [summary, dayChange] = await Promise.all([
    getPortfolioSummary(userId),
    getPortfolioDayChange(userId),
  ]);

  const returnAmount =
    summary.totalCostBasis > 0
      ? summary.portfolioValue - summary.totalCostBasis
      : null;
  const returnPct =
    summary.totalCostBasis > 0 && returnAmount != null
      ? (returnAmount / summary.totalCostBasis) * 100
      : null;
  const returnTone: "success" | "destructive" | "neutral" =
    returnAmount == null
      ? "neutral"
      : returnAmount >= 0
        ? "success"
        : "destructive";

  const changeTone: "success" | "destructive" | "neutral" =
    !dayChange.hasPriceData
      ? "neutral"
      : dayChange.totalChange > 0
        ? "success"
        : dayChange.totalChange < 0
          ? "destructive"
          : "neutral";

  // How much of the holdings value actually repriced since the prior close.
  // Some brokerages report end-of-day via Plaid, so their holdings sit
  // at $0 intraday change and coverage stays partial until the close rolls.
  const coveragePct =
    summary.holdingsValue > 0
      ? (dayChange.coveredValue / summary.holdingsValue) * 100
      : 0;
  const partialCoverage = dayChange.hasPriceData && coveragePct < 99;

  return (
    <div className="space-y-2">
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard
          icon={DollarSign}
          iconTone="brand"
          label="Portfolio Value"
          value={formatCurrency(summary.portfolioValue)}
          hint={
            summary.hadNonUsdHoldings
              ? "Non-USD holdings excluded"
              : summary.cashValue > 0
                ? `Incl. ${formatCurrency(summary.cashValue)} cash`
                : `${summary.holdingCount} holding${
                    summary.holdingCount === 1 ? "" : "s"
                  }`
          }
        />
        <MetricCard
          icon={LineChart}
          iconTone={changeTone}
          label="Today's Change"
          value={
            dayChange.hasPriceData
              ? formatSignedCurrency(dayChange.totalChange)
              : "–"
          }
          hint={
            dayChange.hasPriceData
              ? `${dayChange.totalChangePct >= 0 ? "+" : ""}${dayChange.totalChangePct.toFixed(
                  2,
                )}% · ${formatCurrency(dayChange.coveredValue)} priced intraday`
              : "Updates after market close"
          }
        />
        <MetricCard
          icon={Percent}
          iconTone={returnTone}
          label="Total Return"
          value={returnAmount == null ? "–" : formatCurrency(returnAmount)}
          hint={
            returnAmount == null
              ? "Cost basis not reported by your broker"
              : summary.costBasisMissing
                ? `${returnPct?.toFixed(2)}% · partial cost basis`
                : `${returnPct?.toFixed(2)}%`
          }
        />
      </div>
      {partialCoverage ? (
        <p className="text-xs text-foreground-lighter">
          Today&apos;s change covers the{" "}
          {formatCurrency(dayChange.coveredValue)} (
          {coveragePct.toFixed(0)}%) of holdings your brokers price intraday
          (some banks). Many brokerages and most 401(k) custodians report end-of-day
          via Plaid, so their holdings update after the market closes, which means we
          can&apos;t match an intraday brokerage figure.
        </p>
      ) : null}
    </div>
  );
}

async function AssetAllocationSection({ userId }: { userId: string }) {
  const buckets = await getAssetAllocation(userId);
  return <InvestmentsAllocationCard buckets={buckets} />;
}

async function HoldingsSection({ userId }: { userId: string }) {
  const [groups, summary] = await Promise.all([
    getPortfolioAccounts(userId),
    getPortfolioSummary(userId),
  ]);
  return (
    <HoldingsTable
      groups={groups}
      portfolioValue={summary.portfolioValue}
      hadNonUsdHoldings={summary.hadNonUsdHoldings}
    />
  );
}
