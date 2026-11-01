"use client";

import { ChevronDown, X } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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
import { categoryColor, categoryLabel, OTHER_SPENDING_KEY } from "@/domain/category-taxonomy";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CategorySpending,
  SpendingRange,
} from "@/server/db/transactions";

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

interface Slice {
  key: string; // friendly category key or OTHER_SPENDING_KEY
  label: string;
  amount: number;
  count: number;
}

function bucketSlices(rows: CategorySpending[]): Slice[] {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= 9) {
    return sorted.map((r) => ({
      key: r.category,
      label: categoryLabel(r.category),
      amount: r.amount,
      count: r.count,
    }));
  }
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const otherAmount = rest.reduce((sum, r) => sum + r.amount, 0);
  const otherCount = rest.reduce((sum, r) => sum + r.count, 0);
  return [
    ...top.map((r) => ({
      key: r.category,
      label: categoryLabel(r.category),
      amount: r.amount,
      count: r.count,
    })),
    {
      key: OTHER_SPENDING_KEY,
      label: categoryLabel(OTHER_SPENDING_KEY),
      amount: otherAmount,
      count: otherCount,
    },
  ];
}

interface TooltipPayload {
  payload?: Slice & { pct: number };
}

interface TooltipContentProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function TooltipContent({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const slice = payload[0]?.payload;
  if (!slice) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
      <div className="text-xs font-medium">{slice.label}</div>
      <div className="text-sm font-semibold tabular">
        {formatCurrency(slice.amount)}{" "}
        <span className="text-xs font-normal text-foreground-lighter">
          ({slice.pct.toFixed(1)}%)
        </span>
      </div>
      <div className="text-xs text-foreground-lighter">
        {slice.count} {slice.count === 1 ? "transaction" : "transactions"}
      </div>
    </div>
  );
}

interface CategoryPieChartProps {
  rows: CategorySpending[];
  range: SpendingRange;
}

/**
 * Client component for the spending-by-category pie. Time-range selection
 * is mirrored into the URL `?range=` so the server can re-fetch with the
 * correct date window; no fetch-all-and-filter on the client.
 */
export function CategoryPieChart({ rows, range }: CategoryPieChartProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  const slices = React.useMemo(() => bucketSlices(rows), [rows]);
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const sliceWithPct = slices.map((s) => ({
    ...s,
    pct: total > 0 ? (s.amount / total) * 100 : 0,
  }));

  function setRange(next: SpendingRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next);
    // Reset pagination when range changes.
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleCategory(key: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!key || key === activeCategory) {
      params.delete("category");
    } else {
      params.set("category", key);
    }
    // Filtering the table: jump back to its first page.
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>
              Total spent per category. Transfers and credit-card payments
              excluded. Click a slice to filter the table below.
            </CardDescription>
            {activeCategory ? (
              <button
                type="button"
                onClick={() => toggleCategory(null)}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor(activeCategory) }}
                  aria-hidden
                />
                {categoryLabel(activeCategory)}
                <X className="h-3 w-3 text-foreground-lighter" aria-hidden />
                <span className="sr-only">Clear category filter</span>
              </button>
            ) : null}
          </div>
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
        </div>
      </CardHeader>
      <CardContent>
        {sliceWithPct.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-foreground-lighter">
            No spending in this range yet
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_1fr] items-center">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sliceWithPct}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={1}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                    onClick={(_, index) => {
                      const s = sliceWithPct[index];
                      if (!s || s.key === OTHER_SPENDING_KEY) return;
                      toggleCategory(s.key);
                    }}
                  >
                    {sliceWithPct.map((s) => {
                      const dimmed =
                        activeCategory != null && s.key !== activeCategory;
                      const clickable = s.key !== OTHER_SPENDING_KEY;
                      return (
                        <Cell
                          key={s.key}
                          fill={categoryColor(s.key)}
                          fillOpacity={dimmed ? 0.35 : 1}
                          style={{ cursor: clickable ? "pointer" : "default" }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    content={<TooltipContent />}
                    cursor={false}
                    wrapperStyle={{ outline: "none", zIndex: 30 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2">
              {sliceWithPct.map((s) => {
                const clickable = s.key !== OTHER_SPENDING_KEY;
                const isActive = s.key === activeCategory;
                const dimmed = activeCategory != null && !isActive;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && toggleCategory(s.key)}
                      aria-pressed={isActive}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
                        clickable && "hover:bg-muted/60",
                        !clickable && "cursor-default",
                        dimmed && "opacity-55",
                        isActive && "bg-muted/70",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: categoryColor(s.key) }}
                        />
                        <span className={cn("truncate", isActive && "font-medium")}>
                          {s.label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-foreground-lighter tabular">
                          {s.pct.toFixed(1)}%
                        </span>
                        <span className="font-medium tabular">
                          {formatCurrency(s.amount)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
