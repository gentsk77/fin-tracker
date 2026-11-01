"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
  ASSET_CATEGORY_ORDER,
  assetCategoryLabel,
  accountTypeLabel,
  isAssetType,
  type AssetCategoryKey,
} from "@/domain/money";
import { formatCurrency } from "@/lib/format";
import type { AccountType } from "@/types";

interface AssetAllocationCardProps {
  byCategory: Partial<Record<AssetCategoryKey, number>>;
  byType: Partial<Record<AccountType, number>>;
  /**
   * `compact` (default): stacked bar + legend only, used on Overview.
   * `full`: stacked bar + legend + per-account-type detail rows, used on
   * the Net Worth page.
   */
  variant?: "compact" | "full";
  /** Optional override for the section title. */
  title?: string;
  /** Optional override for the section description. */
  description?: string;
  /** If set, render a "View details →" link in the top-right. */
  detailsHref?: string;
}

interface Segment {
  key: AssetCategoryKey;
  amount: number;
  pct: number;
}

interface SubtypeRow {
  type: AccountType;
  amount: number;
  pct: number;
}

// Concrete colors per asset category for the donut slices + legend swatches.
// These mirror the theme tokens the old stacked bar used, so the palette is
// unchanged and stays light/dark-aware: brand for cash, success-green for
// taxable investments, lighter brand for retirement, muted grey for other.
const CATEGORY_COLOR: Record<AssetCategoryKey, string> = {
  cash: "hsl(var(--brand-500))",
  investments: "hsl(var(--success))",
  retirement: "hsl(var(--brand-300))",
  other: "hsl(var(--foreground-muted))",
};

interface AllocationTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Segment }>;
}

function AllocationTooltip({ active, payload }: AllocationTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const seg = payload[0].payload;
  return (
    <div className="rounded-md bg-popover px-2.5 py-1.5 text-xs shadow-md ring-1 ring-border">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: CATEGORY_COLOR[seg.key] }}
          aria-hidden
        />
        <span className="font-medium text-popover-foreground">
          {assetCategoryLabel(seg.key)}
        </span>
      </div>
      <div className="mt-1 tabular text-foreground-light">
        {formatCurrency(seg.amount)}
        <span className="ml-1.5 text-foreground-lighter">
          {seg.pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Unified visualization of how a user's assets are distributed.
 *
 * Replaces the old `<MoneySplit />` (high-level category bar) and the
 * assets half of `<AccountsBreakdown />` (per-subtype detail rows); both
 * answered "where is my money?" with different framings, which felt
 * redundant. This card always shows the stacked bar at the top; in `full`
 * mode, it also shows the per-subtype rows below.
 *
 * Liabilities are intentionally excluded; see `<LiabilitiesBreakdown />`.
 */
export function AssetAllocationCard({
  byCategory,
  byType,
  variant = "compact",
  title = "Where your money is",
  description = "Assets grouped by category.",
  detailsHref,
}: AssetAllocationCardProps) {
  const total = Object.values(byCategory).reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  );

  const segments: Segment[] = ASSET_CATEGORY_ORDER.map((key) => {
    const amount = byCategory[key] ?? 0;
    const pct = total > 0 ? (amount / total) * 100 : 0;
    return { key, amount, pct };
  }).filter((s) => s.amount > 0);

  const subtypeTotal = (Object.entries(byType) as Array<[AccountType, number]>)
    .filter(([t, amount]) => isAssetType(t) && amount > 0)
    .reduce((sum, [, amount]) => sum + amount, 0);

  const subtypeRows: SubtypeRow[] = (
    Object.entries(byType) as Array<[AccountType, number]>
  )
    .filter(([t, amount]) => isAssetType(t) && amount > 0)
    .map(([type, amount]) => ({
      type,
      amount,
      pct: subtypeTotal > 0 ? (amount / subtypeTotal) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {detailsHref ? (
          <CardAction>
            <CardLink href={detailsHref} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {segments.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-foreground-lighter">
            Link an account to see your allocation
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={<AllocationTooltip />}
                      cursor={false}
                      wrapperStyle={{ outline: "none", zIndex: 30 }}
                    />
                    <Pie
                      data={segments}
                      dataKey="amount"
                      nameKey="key"
                      cx="50%"
                      cy="50%"
                      innerRadius="64%"
                      outerRadius="92%"
                      paddingAngle={segments.length > 1 ? 2 : 0}
                      cornerRadius={3}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {segments.map((s) => (
                        <Cell key={s.key} fill={CATEGORY_COLOR[s.key]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[11px] uppercase tracking-wide text-foreground-lighter">
                    Total
                  </span>
                  <span className="text-base font-semibold tabular text-foreground">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
              <ul className="grid w-full flex-1 gap-2.5">
                {segments.map((s) => (
                  <li key={s.key} className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLOR[s.key] }}
                      aria-hidden
                    />
                    <div className="flex flex-1 items-baseline justify-between gap-2 text-sm">
                      <span className="text-foreground-light">
                        {assetCategoryLabel(s.key)}
                      </span>
                      <span className="font-medium tabular">
                        {formatCurrency(s.amount)}
                        <span className="ml-1.5 text-xs text-foreground-lighter">
                          {s.pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {variant === "full" && subtypeRows.length > 0 ? (
              <div className="space-y-2.5 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-lighter">
                  By account type
                </p>
                <ul className="space-y-2.5">
                  {subtypeRows.map((row) => (
                    <li key={row.type} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground-light">
                          {accountTypeLabel(row.type)}
                        </span>
                        <span className="font-medium tabular">
                          {formatCurrency(row.amount)}
                          <span className="ml-1.5 text-xs text-foreground-lighter">
                            {row.pct.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-brand"
                          style={{ width: `${row.pct.toFixed(1)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
