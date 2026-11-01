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
import { formatCurrency } from "@/lib/format";
import type { AssetClassBucket } from "@/server/db/holdings";

interface InvestmentsAllocationCardProps {
  buckets: AssetClassBucket[];
  detailsHref?: string;
  title?: string;
  description?: string;
}

const ASSET_CLASS_LABEL: Record<string, string> = {
  us_stocks: "US Stocks",
  international_stocks: "International Stocks",
  bonds: "Bonds",
  cash: "Cash",
  real_estate: "Real Estate",
  crypto: "Crypto",
  alternatives: "Alternatives",
  other: "Other",
};

// Distinct color per asset class, used for BOTH the donut slices and the
// legend swatches so they always line up. recharts paints these straight onto
// SVG, so we need concrete color values (not Tailwind class names). The primary
// slice tracks the brand token (theme-aware); the rest reuse the same fixed
// Tailwind hues the old stacked bar used, in legend order.
const ASSET_CLASS_COLOR: Record<string, string> = {
  us_stocks: "hsl(var(--brand-500))",
  international_stocks: "#0ea5e9", // sky-500
  bonds: "#10b981", // emerald-500
  cash: "#f59e0b", // amber-500
  real_estate: "#f43f5e", // rose-500
  crypto: "#8b5cf6", // violet-500
  alternatives: "#14b8a6", // teal-500
  other: "#94a3b8", // slate-400
};

function labelFor(assetClass: string): string {
  return ASSET_CLASS_LABEL[assetClass] ?? assetClass;
}

function colorFor(assetClass: string): string {
  return ASSET_CLASS_COLOR[assetClass] ?? "#94a3b8";
}

interface AllocationTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: AssetClassBucket }>;
}

function AllocationTooltip({ active, payload }: AllocationTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0].payload;
  return (
    <div className="rounded-md bg-popover px-2.5 py-1.5 text-xs shadow-md ring-1 ring-border">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorFor(bucket.assetClass) }}
          aria-hidden
        />
        <span className="font-medium text-popover-foreground">
          {labelFor(bucket.assetClass)}
        </span>
      </div>
      <div className="mt-1 tabular text-foreground-light">
        {formatCurrency(bucket.value)}
        <span className="ml-1.5 text-foreground-lighter">
          {bucket.pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Asset allocation for the Investments page, rendered as a donut chart with a
 * centered portfolio total plus a legend listing each asset class with its
 * dollar value and share. Buckets are asset *classes* (US stocks, bonds, etc.)
 * inferred from securities. Empty state mirrors the rest of the page so users
 * see a consistent "link an investment account" affordance.
 */
export function InvestmentsAllocationCard({
  buckets,
  detailsHref,
  title = "Asset Allocation",
  description = "Where your portfolio sits by asset class.",
}: InvestmentsAllocationCardProps) {
  const nonZero = buckets.filter((b) => b.value > 0);
  const total = nonZero.reduce((sum, b) => sum + b.value, 0);

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
        {nonZero.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-foreground-lighter">
            No holdings to allocate yet
          </div>
        ) : (
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
                    data={nonZero}
                    dataKey="value"
                    nameKey="assetClass"
                    cx="50%"
                    cy="50%"
                    innerRadius="64%"
                    outerRadius="92%"
                    paddingAngle={nonZero.length > 1 ? 2 : 0}
                    cornerRadius={3}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {nonZero.map((b) => (
                      <Cell key={b.assetClass} fill={colorFor(b.assetClass)} />
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
              {nonZero.map((b) => (
                <li key={b.assetClass} className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(b.assetClass) }}
                    aria-hidden
                  />
                  <div className="flex flex-1 items-baseline justify-between gap-2 text-sm">
                    <span className="text-foreground-light">
                      {labelFor(b.assetClass)}
                    </span>
                    <span className="font-medium tabular">
                      {formatCurrency(b.value)}
                      <span className="ml-1.5 text-xs text-foreground-lighter">
                        {b.pct.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
