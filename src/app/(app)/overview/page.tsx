import { Suspense } from "react";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getNetWorthBreakdown,
  listAccounts,
} from "@/server/db/accounts";
import { listConnections } from "@/server/db/connections";
import {
  getPortfolioDayChange,
  getPortfolioSummary,
  hasInvestmentAccount,
  type HoldingMover,
} from "@/server/db/holdings";
import {
  getSpendingByCategoryThisMonth,
  listTransactions,
} from "@/server/db/transactions";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import {
  AttentionBannerSkeleton,
  CardSkeleton,
} from "@/components/ui/card-skeleton";
import { TransactionsList } from "@/features/spending/components/transactions-list";
import { SpendingByCategory } from "@/features/spending/components/spending-by-category";
import { AssetAllocationCard } from "@/features/net-worth/components/asset-allocation-card";
import { NetWorthChartCard } from "@/features/net-worth/components/net-worth-chart-card";
import { AttentionBanner } from "@/features/dashboard/components/attention-banner";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Overview page.
 *
 * Performs only the auth check synchronously, then renders the page shell
 * with per-section `<Suspense>` boundaries. Each section is its own async
 * server component that does its own data fetch, so the slowest card
 * (typically the chart) no longer blocks the entire page from rendering,
 * and the user sees the structural skeleton instantly when navigating in.
 */
export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-foreground-light">
          Your financial overview at a glance.
        </p>
      </div>

      <Suspense fallback={<AttentionBannerSkeleton />}>
        <AttentionBannerSection userId={user.id} />
      </Suspense>

      <Suspense fallback={<CardSkeleton heightClass="h-[340px]" />}>
        <NetWorthChartCard
          userId={user.id}
          detailsHref="/net-worth"
          description="Track your net worth growth over time."
        />
      </Suspense>

      <Suspense fallback={<CardSkeleton heightClass="h-[180px]" />}>
        <AssetAllocationSection userId={user.id} />
      </Suspense>

      <Suspense fallback={<CardSkeleton heightClass="h-[180px]" />}>
        <InvestmentMovementsSection userId={user.id} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<CardSkeleton heightClass="h-[260px]" />}>
          <SpendingByCategorySection userId={user.id} />
        </Suspense>
        <Suspense fallback={<CardSkeleton heightClass="h-[260px]" />}>
          <RecentTransactionsSection userId={user.id} />
        </Suspense>
      </div>
    </div>
  );
}

async function AttentionBannerSection({ userId }: { userId: string }) {
  const connections = await listConnections(userId);
  return <AttentionBanner connections={connections} />;
}

async function AssetAllocationSection({ userId }: { userId: string }) {
  const breakdown = await getNetWorthBreakdown(userId);
  return (
    <AssetAllocationCard
      byCategory={breakdown.byCategory}
      byType={breakdown.byType}
      variant="compact"
      detailsHref="/net-worth"
    />
  );
}

async function SpendingByCategorySection({ userId }: { userId: string }) {
  const rows = await getSpendingByCategoryThisMonth(userId);
  return (
    <SpendingByCategory
      rows={rows}
      title="Spending by Category"
      description="Top categories this month."
      limit={5}
      detailsHref="/spending"
    />
  );
}

async function RecentTransactionsSection({ userId }: { userId: string }) {
  const [transactions, accounts, connections] = await Promise.all([
    listTransactions(userId, { limit: 5 }),
    listAccounts(userId),
    listConnections(userId),
  ]);
  const accountNames = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  if (transactions.length > 0) {
    return (
      <TransactionsList
        transactions={transactions}
        accountNames={accountNames}
        title="Recent Transactions"
        description="Your 5 latest transactions."
        detailsHref="/spending"
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>
          Your latest spending activity will appear here.
        </CardDescription>
        <CardAction>
          <CardLink href="/spending" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-center justify-center text-sm text-foreground-lighter">
          {connections.length === 0
            ? "Link a bank account to see transactions"
            : "No transactions yet. Try syncing your accounts"}
        </div>
      </CardContent>
    </Card>
  );
}

function InvestmentMovementsPlaceholder({
  message,
}: {
  message: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Investment Movements</CardTitle>
        <CardDescription>
          Portfolio activity and top holdings.
        </CardDescription>
        <CardAction>
          <CardLink href="/investments" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 flex-col items-center justify-center gap-1.5 text-center text-sm text-foreground-lighter">
          <TrendingUp
            className="h-5 w-5 text-foreground-muted"
            aria-hidden
          />
          <span>{message}</span>
        </div>
      </CardContent>
    </Card>
  );
}

async function InvestmentMovementsSection({ userId }: { userId: string }) {
  const accounts = await listAccounts(userId);
  const hasInvAcct = hasInvestmentAccount(accounts);

  if (!hasInvAcct) {
    return (
      <InvestmentMovementsPlaceholder message="Link an investment account to see your portfolio here." />
    );
  }

  const [summary, dayChange] = await Promise.all([
    getPortfolioSummary(userId),
    getPortfolioDayChange(userId),
  ]);

  if (summary.holdingCount === 0) {
    return (
      <InvestmentMovementsPlaceholder message="Investment account linked. Holdings will appear after the next sync." />
    );
  }

  const gainers = dayChange.gainers.slice(0, 3);
  const losers = dayChange.losers.slice(0, 3);
  const coveragePct =
    summary.holdingsValue > 0
      ? (dayChange.coveredValue / summary.holdingsValue) * 100
      : 0;
  const partialCoverage = dayChange.hasPriceData && coveragePct < 99;
  const changeColor =
    !dayChange.hasPriceData || dayChange.totalChange === 0
      ? "text-foreground-lighter"
      : dayChange.totalChange > 0
        ? "text-success"
        : "text-destructive";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investment Movements</CardTitle>
        <CardDescription>
          Today&apos;s top and bottom movers since the prior close.
        </CardDescription>
        <CardAction>
          <CardLink href="/investments" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tabular tracking-tight">
              {formatCurrency(summary.portfolioValue)}
            </span>
            {dayChange.hasPriceData ? (
              <span className={cn("text-sm font-medium tabular", changeColor)}>
                {formatSignedCurrency(dayChange.totalChange)} (
                {dayChange.totalChangePct >= 0 ? "+" : ""}
                {dayChange.totalChangePct.toFixed(2)}%)
                <span className="ml-1 text-xs font-normal text-foreground-lighter">
                  today
                </span>
              </span>
            ) : (
              <span className="text-xs text-foreground-lighter">
                Updates after market close
              </span>
            )}
          </div>

          {partialCoverage ? (
            <p className="text-xs text-foreground-lighter">
              Intraday for the {coveragePct.toFixed(0)}% of holdings your
              brokers price live. Many brokerages and 401(k) plans update
              after close.
            </p>
          ) : null}

          {gainers.length === 0 && losers.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border border-border bg-muted/40 text-center text-sm text-foreground-lighter">
              {dayChange.hasPriceData
                ? "No notable movement since the prior close."
                : "Movers appear once intraday prices are available."}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <MoverColumn
                title="Top movers"
                icon={TrendingUp}
                tone="up"
                movers={gainers}
                emptyLabel="No gainers today"
              />
              <MoverColumn
                title="Bottom movers"
                icon={TrendingDown}
                tone="down"
                movers={losers}
                emptyLabel="No losers today"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MoverColumn({
  title,
  icon: Icon,
  tone,
  movers,
  emptyLabel,
}: {
  title: string;
  icon: LucideIcon;
  tone: "up" | "down";
  movers: HoldingMover[];
  emptyLabel: string;
}) {
  const toneText = tone === "up" ? "text-success" : "text-destructive";
  return (
    <div className="space-y-2">
      <div className="eyebrow flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", toneText)} aria-hidden />
        {title}
      </div>
      {movers.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-xs text-foreground-lighter">
          {emptyLabel}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {movers.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{m.symbol}</div>
                <div className="truncate text-xs text-foreground-lighter">
                  {m.accountName}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={cn("text-sm font-medium tabular", toneText)}>
                  {formatSignedCurrency(m.dayChange)}
                </div>
                <div className={cn("text-xs tabular", toneText)}>
                  {m.dayChangePct >= 0 ? "+" : ""}
                  {m.dayChangePct.toFixed(2)}%
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
