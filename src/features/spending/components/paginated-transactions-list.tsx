"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { categoryColor, categoryLabel, classifyCategory } from "@/domain/category-taxonomy";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SpendingRange, TransactionRow } from "@/server/db/transactions";

const PAGE_SIZE_OPTIONS = [20, 50, 200] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const RANGE_OPTIONS: { key: SpendingRange; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "last_12_months", label: "Last 12 months" },
  { key: "all_time", label: "All time" },
];

function rangeLabel(range: SpendingRange): string {
  return RANGE_OPTIONS.find((o) => o.key === range)?.label ?? "This month";
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${MONTHS[idx]} ${Number(d)}`;
}

interface PaginatedTransactionsListProps {
  rows: TransactionRow[];
  totalCount: number;
  page: number; // 1-based
  pageSize: PageSize;
  accountNames: Record<string, string>;
  categories: string[];
  activeCategory: string | null;
  range: SpendingRange;
}

/**
 * Server-paginated transactions table. Page + pageSize live in the URL
 * (`?page=`, `?pageSize=`) so the server fetches only the visible slice.
 * The `?category=` and `?range=` filters are both shared with the spending
 * donut above: clicking a slice, picking a category, or changing the period
 * on either card drives the same URL state, so the two views stay in sync.
 */
export function PaginatedTransactionsList({
  rows,
  totalCount,
  page,
  pageSize,
  accountNames,
  categories,
  activeCategory,
  range,
}: PaginatedTransactionsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const firstShown = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastShown = Math.min(totalCount, safePage * pageSize);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setPage(next: number) {
    if (next < 1 || next > totalPages) return;
    pushParams({ page: String(next) });
  }

  function setPageSize(next: PageSize) {
    // Reset to page 1 to avoid landing on an empty page.
    pushParams({ pageSize: String(next), page: "1" });
  }

  function setCategory(next: string | null) {
    // Reset to page 1 so the filtered view starts at the top.
    pushParams({ category: next, page: "1" });
  }

  function setRange(next: SpendingRange) {
    // Reset to page 1; the new period likely has a different row count.
    pushParams({ range: next, page: "1" });
  }

  const activeLabel = activeCategory ? categoryLabel(activeCategory) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              Transactions across your linked accounts for the selected period.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {activeCategory ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setCategory(null)}
                aria-label="Clear category filter"
              >
                Clear
                <X data-icon="inline-end" />
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    {rangeLabel(range)}
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-44">
                {RANGE_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.key}
                    onClick={() => setRange(opt.key)}
                    className={
                      opt.key === range ? "bg-muted text-foreground" : undefined
                    }
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    {activeCategory ? (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryColor(activeCategory) }}
                        aria-hidden
                      />
                    ) : null}
                    {activeLabel ?? "All categories"}
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                }
              />
              <DropdownMenuContent
                align="end"
                className="max-h-80 min-w-52 overflow-y-auto"
              >
                <DropdownMenuItem
                  onClick={() => setCategory(null)}
                  className={
                    activeCategory == null ? "bg-muted text-foreground" : undefined
                  }
                >
                  All categories
                </DropdownMenuItem>
                {categories.map((cat) => (
                  <DropdownMenuItem
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "gap-2",
                      cat === activeCategory && "bg-muted text-foreground",
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(cat) }}
                      aria-hidden
                    />
                    {categoryLabel(cat)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-foreground-lighter">
            {activeLabel ? (
              <>
                <span>
                  No {activeLabel} transactions for{" "}
                  {rangeLabel(range).toLowerCase()}
                </span>
                <Button size="xs" variant="outline" onClick={() => setCategory(null)}>
                  Clear filter
                </Button>
              </>
            ) : (
              <span>
                No transactions for {rangeLabel(range).toLowerCase()}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="eyebrow py-2 pr-4">Date</th>
                    <th className="eyebrow py-2 pr-4">Description</th>
                    <th className="eyebrow py-2 pr-4">Category</th>
                    <th className="eyebrow py-2 pr-4">Account</th>
                    <th className="eyebrow py-2 pr-0 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((tx) => {
                    const isDebit = tx.type === "debit";
                    const sign = isDebit ? "-" : "+";
                    return (
                      <tr
                        key={tx.id}
                        className="border-b border-border last:border-b-0 align-top"
                      >
                        <td className="py-2 pr-4 whitespace-nowrap text-foreground-lighter">
                          {formatDate(tx.date)}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="font-medium flex items-center gap-2 flex-wrap">
                            {tx.merchant_name || tx.name}
                            {tx.pending && (
                              <StatusBadge tone="warning" dot>
                                Pending
                              </StatusBadge>
                            )}
                          </div>
                          {tx.merchant_name && tx.merchant_name !== tx.name && (
                            <div className="text-xs text-foreground-lighter">
                              {tx.name}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-foreground-light">
                          {categoryLabel(classifyCategory(tx).key)}
                        </td>
                        <td className="py-2 pr-4 text-foreground-light">
                          {accountNames[tx.account_id] ?? "–"}
                        </td>
                        <td
                          className={
                            "py-2 pr-0 text-right tabular font-medium " +
                            (isDebit ? "" : "text-success")
                          }
                        >
                          {sign}
                          {formatCurrency(Number(tx.amount), tx.currency_code)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-foreground-light">
              <div>
                Showing <span className="font-medium">{firstShown}</span>–
                <span className="font-medium">{lastShown}</span> of{" "}
                <span className="font-medium">{totalCount}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-foreground-lighter">
                    Rows
                  </span>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      size="xs"
                      variant={size === pageSize ? "default" : "ghost"}
                      onClick={() => setPageSize(size)}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-xs"
                    variant="outline"
                    onClick={() => setPage(safePage - 1)}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="text-xs tabular px-2">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="outline"
                    onClick={() => setPage(safePage + 1)}
                    disabled={safePage >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
