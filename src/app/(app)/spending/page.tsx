import { Suspense } from "react";
import { Landmark } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/server/db/accounts";
import { listConnections } from "@/server/db/connections";
import {
  getMonthlySpendTotals,
  getSpendingByCategoryForSpendingRange,
  listTransactionCategories,
  listTransactionsPaged,
  type SpendingRange,
} from "@/server/db/transactions";
import { MonthlyTrendChart } from "@/features/spending/components/monthly-trend-chart";
import { CategoryPieChart } from "@/features/spending/components/category-pie-chart";
import { PaginatedTransactionsList } from "@/features/spending/components/paginated-transactions-list";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

const VALID_RANGES: SpendingRange[] = [
  "this_month",
  "last_month",
  "last_3_months",
  "last_12_months",
  "all_time",
];

const VALID_PAGE_SIZES = [20, 50, 200] as const;
type PageSize = (typeof VALID_PAGE_SIZES)[number];

function parseRange(raw: string | undefined): SpendingRange {
  if (raw && (VALID_RANGES as string[]).includes(raw)) {
    return raw as SpendingRange;
  }
  return "this_month";
}

function parsePageSize(raw: string | undefined): PageSize {
  const n = raw ? Number(raw) : NaN;
  if ((VALID_PAGE_SIZES as readonly number[]).includes(n)) {
    return n as PageSize;
  }
  return 20;
}

function parsePage(raw: string | undefined): number {
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return 1;
}

/**
 * Spending page.
 *
 * Performs only the auth check and a cheap `listConnections` upfront so the
 * empty-state branch can render without blocking on heavier queries. The
 * three real cards (monthly trend, category breakdown, paginated table)
 * each stream in independently via their own `<Suspense>` boundary so the
 * page shell is interactive immediately.
 */
export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    page?: string;
    pageSize?: string;
    category?: string;
  }>;
}) {
  const params = await searchParams;
  const range = parseRange(params.range);
  const pageSize = parsePageSize(params.pageSize);
  const page = parsePage(params.page);
  const category = params.category || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const connections = await listConnections(user.id);
  const hasAnyConnection = connections.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Spending</h1>
        <p className="text-sm text-foreground-light">
          Track your spending patterns and categorized transactions.
          Transfers between your own accounts (and credit-card payments) are
          excluded from these totals.
        </p>
      </div>

      {!hasAnyConnection ? (
        <Card>
          <CardContent>
            <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-200 elevation-card">
                <Landmark className="h-5 w-5 text-brand" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">No accounts linked yet</p>
                <p className="text-sm text-foreground-lighter">
                  Link a bank or card account to see categorized spending,
                  monthly trends, and your full transaction history.
                </p>
              </div>
              <Link href="/accounts" className={cn(buttonVariants({ size: "sm" }))}>
                Link an account
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Suspense fallback={<CardSkeleton heightClass="h-[300px]" />}>
            <MonthlyTrendSection userId={user.id} />
          </Suspense>

          <Suspense fallback={<CardSkeleton heightClass="h-[320px]" />}>
            <CategoryBreakdownSection userId={user.id} range={range} />
          </Suspense>

          <Suspense
            key={`${range}-${page}-${pageSize}-${category ?? "all"}`}
            fallback={<CardSkeleton heightClass="h-[400px]" />}
          >
            <TransactionsSection
              userId={user.id}
              range={range}
              page={page}
              pageSize={pageSize}
              category={category}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}

async function MonthlyTrendSection({ userId }: { userId: string }) {
  const monthlyTotals = await getMonthlySpendTotals(userId, 3);
  return <MonthlyTrendChart points={monthlyTotals} />;
}

async function CategoryBreakdownSection({
  userId,
  range,
}: {
  userId: string;
  range: SpendingRange;
}) {
  const rows = await getSpendingByCategoryForSpendingRange(userId, range);
  return <CategoryPieChart rows={rows} range={range} />;
}

async function TransactionsSection({
  userId,
  range,
  page,
  pageSize,
  category,
}: {
  userId: string;
  range: SpendingRange;
  page: number;
  pageSize: PageSize;
  category: string | null;
}) {
  const [accounts, categories, paged] = await Promise.all([
    listAccounts(userId),
    listTransactionCategories(userId),
    listTransactionsPaged(userId, {
      pageSize,
      offset: (page - 1) * pageSize,
      category,
      range,
    }),
  ]);
  const accountNames = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  return (
    <PaginatedTransactionsList
      rows={paged.rows}
      totalCount={paged.totalCount}
      page={page}
      pageSize={pageSize}
      accountNames={accountNames}
      categories={categories}
      activeCategory={category}
      range={range}
    />
  );
}
