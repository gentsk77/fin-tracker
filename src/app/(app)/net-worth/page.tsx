import { Suspense } from "react";
import { Landmark } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { listAccounts, getNetWorthBreakdown } from "@/server/db/accounts";
import { listConnections } from "@/server/db/connections";
import { resolveActivityDays } from "@/server/db/snapshots";
import { AccountActivity } from "@/features/net-worth/components/account-activity";
import { AssetAllocationCard } from "@/features/net-worth/components/asset-allocation-card";
import { LiabilitiesBreakdown } from "@/features/net-worth/components/liabilities-breakdown";
import { NetWorthChartCard } from "@/features/net-worth/components/net-worth-chart-card";
import { NetWorthSummary } from "@/features/net-worth/components/net-worth-summary";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  CardSkeleton,
  MetricSkeleton,
} from "@/components/ui/card-skeleton";
import type { ActivityWindowDays } from "@/server/db/snapshots";

interface NetWorthPageProps {
  searchParams: Promise<{ activityDays?: string | string[] }>;
}

/**
 * Net Worth page.
 *
 * Auth + URL-param parsing happen synchronously; then we render the page
 * shell with per-section `<Suspense>` boundaries. We also do ONE upfront
 * fetch of `listConnections` (cheap, single row count) so we can branch
 * between the empty-state and full layout without flicker; the heavy
 * fetches (snapshots, breakdown, activity) all stream in independently.
 */
export default async function NetWorthPage({ searchParams }: NetWorthPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { activityDays } = await searchParams;
  const days = resolveActivityDays(activityDays);

  const connections = await listConnections(user.id);
  const hasAnyConnection = connections.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Net Worth</h1>
        <p className="text-sm text-foreground-light">
          Track your total net worth across all assets and liabilities.
        </p>
      </div>

      {!hasAnyConnection ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-200">
                <Landmark className="h-5 w-5 text-brand" />
              </div>
              <div className="text-center">
                <p className="font-medium">No accounts linked yet</p>
                <p className="text-sm text-foreground-lighter">
                  Link a bank or investment account from the Accounts page to
                  start tracking your net worth.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Suspense fallback={<SummarySkeleton />}>
            <SummarySection userId={user.id} />
          </Suspense>

          <Suspense fallback={<CardSkeleton heightClass="h-[340px]" />}>
            <NetWorthChartCard
              userId={user.id}
              title="Net Worth Over Time"
              description="Daily net worth across all linked accounts."
            />
          </Suspense>

          <Suspense fallback={<CardSkeleton heightClass="h-[260px]" />}>
            <ActivitySection userId={user.id} days={days} />
          </Suspense>

          <Suspense fallback={<CardSkeleton heightClass="h-[200px]" />}>
            <AllocationSection userId={user.id} />
          </Suspense>

          <Suspense fallback={<CardSkeleton heightClass="h-[160px]" />}>
            <LiabilitiesSection userId={user.id} />
          </Suspense>
        </>
      )}
    </div>
  );
}

async function SummarySection({ userId }: { userId: string }) {
  const breakdown = await getNetWorthBreakdown(userId);
  return (
    <NetWorthSummary
      totalAssets={breakdown.totalAssets}
      totalLiabilities={breakdown.totalLiabilities}
      netWorth={breakdown.netWorth}
      hadNonUsdAccounts={breakdown.hadNonUsdAccounts}
    />
  );
}

async function ActivitySection({
  userId,
  days,
}: {
  userId: string;
  days: ActivityWindowDays;
}) {
  // AccountActivity only renders content when at least one account exists.
  // Cheap check up front avoids rendering an empty card.
  const accounts = await listAccounts(userId);
  if (accounts.length === 0) return null;
  return <AccountActivity userId={userId} days={days} />;
}

async function AllocationSection({ userId }: { userId: string }) {
  const [breakdown, accounts] = await Promise.all([
    getNetWorthBreakdown(userId),
    listAccounts(userId),
  ]);
  if (accounts.length === 0) return null;
  return (
    <AssetAllocationCard
      byCategory={breakdown.byCategory}
      byType={breakdown.byType}
      variant="full"
    />
  );
}

async function LiabilitiesSection({ userId }: { userId: string }) {
  const [breakdown, accounts] = await Promise.all([
    getNetWorthBreakdown(userId),
    listAccounts(userId),
  ]);
  if (accounts.length === 0) return null;
  return <LiabilitiesBreakdown byType={breakdown.byType} />;
}

function SummarySkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricSkeleton />
      <MetricSkeleton />
      <MetricSkeleton />
    </div>
  );
}
