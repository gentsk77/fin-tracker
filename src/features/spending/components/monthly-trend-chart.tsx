"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { MonthlySpendTotal } from "@/server/db/transactions";

interface MonthlyTrendChartProps {
  points: MonthlySpendTotal[];
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortMonth(iso: string): string {
  const [year, m] = iso.split("-");
  const idx = Number(m) - 1;
  const label = MONTH_LABELS[idx] ?? m;
  return `${label} '${year.slice(2)}`;
}

interface TooltipPayload {
  payload?: MonthlySpendTotal;
}

interface TooltipContentProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function TooltipContent({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-sm">
      <div className="text-xs text-foreground-lighter">
        {shortMonth(point.month)}
        {point.isCurrentMonth && (
          <span className="ml-1">(month to date)</span>
        )}
      </div>
      <div className="text-sm font-semibold tabular">
        {formatCurrency(point.total)}
      </div>
      <div className="text-xs text-foreground-lighter">
        {point.txCount} {point.txCount === 1 ? "transaction" : "transactions"}
      </div>
    </div>
  );
}

/**
 * Large column chart of monthly spending totals. Defaults to 3 months
 * (latest = current month-to-date). Current month is colored a lighter
 * brand shade to signal it's incomplete.
 */
export function MonthlyTrendChart({ points }: MonthlyTrendChartProps) {
  const hasAny = points.some((p) => p.total > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly trend</CardTitle>
        <CardDescription>
          Total spending over the last {points.length}{" "}
          {points.length === 1 ? "month" : "months"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <div className="flex h-60 items-center justify-center text-sm text-foreground-lighter">
            No spending data yet
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={points}
                margin={{ top: 10, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={shortMonth}
                  tick={{ fill: "hsl(var(--foreground-lighter))", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) =>
                    v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                  }
                  tick={{ fill: "hsl(var(--foreground-lighter))", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  content={<TooltipContent />}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {points.map((p) => (
                    <Cell
                      key={p.month}
                      fill={
                        p.isCurrentMonth
                          ? "hsl(var(--brand-300))"
                          : "hsl(var(--brand))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
