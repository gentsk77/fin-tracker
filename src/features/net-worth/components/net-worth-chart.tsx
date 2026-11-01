"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, TrendingDown, TrendingUp } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

import type { SnapshotRange } from "@/server/db/snapshots";

export interface NetWorthChartPoint {
  date: string; // YYYY-MM-DD
  value: number;
  source: "sync" | "backfill";
}

interface NetWorthChartProps {
  /** All available snapshots, oldest -> newest. */
  series: NetWorthChartPoint[];
  /** Initial timeframe selection. Defaults to "ALL". */
  initialRange?: SnapshotRange;
  /** Optional drill-down link in the header. */
  detailsHref?: string;
  /** Title override. */
  title?: string;
  /** Description override. */
  description?: string;
}

const RANGES: { key: SnapshotRange; label: string; days: number | null }[] = [
  { key: "ALL", label: "ALL", days: null },
  { key: "1M", label: "1M", days: 31 },
  { key: "6M", label: "6M", days: 186 },
  { key: "1Y", label: "1Y", days: 366 },
];

function filterByRange(
  series: NetWorthChartPoint[],
  range: SnapshotRange,
): NetWorthChartPoint[] {
  if (range === "ALL") return series;
  const r = RANGES.find((x) => x.key === range);
  if (!r || r.days === null) return series;
  const cutoff = new Date(Date.now() - r.days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return series.filter((p) => p.date >= cutoff);
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${months[idx]} ${Number(d)}`;
}

function formatShortDateMs(ms: number): string {
  const d = new Date(ms);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

interface TooltipPayloadItem {
  payload?: ChartRow;
  value?: number | string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  // Two series share one X position so payload usually has two entries.
  // Find the first one with a real payload row.
  const point = payload.find((p) => p?.payload)?.payload as
    | ChartRow
    | undefined;
  if (!point) return null;

  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs ring-1 ring-border elevation-card">
      <div className="text-foreground-lighter">{formatShortDate(point.date)}</div>
      <div className="mt-0.5 flex items-center gap-1.5 font-semibold text-foreground text-display">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background:
              point.source === "backfill"
                ? "hsl(var(--brand-300))"
                : "hsl(var(--brand))",
          }}
        />
        {formatCurrency(point.value)}
        {point.source === "backfill" ? (
          <StatusBadge tone="neutral" className="ml-1">
            Estimated
          </StatusBadge>
        ) : null}
      </div>
    </div>
  );
}

interface SplitSeries {
  backfill: NetWorthChartPoint[];
  sync: NetWorthChartPoint[];
  cutoverDate: string | null;
}

/**
 * Split a series into [backfill prefix, sync suffix] such that they share
 * the cutover row so the two lines visually meet on the chart. If there
 * are no sync rows the whole series is backfill; if there are no backfill
 * rows the whole series is sync.
 */
function splitAtCutover(series: NetWorthChartPoint[]): SplitSeries {
  const firstSyncIdx = series.findIndex((p) => p.source === "sync");
  if (firstSyncIdx === -1) {
    return { backfill: series, sync: [], cutoverDate: null };
  }
  if (firstSyncIdx === 0) {
    return { backfill: [], sync: series, cutoverDate: series[0]?.date ?? null };
  }
  return {
    backfill: series.slice(0, firstSyncIdx + 1),
    sync: series.slice(firstSyncIdx),
    cutoverDate: series[firstSyncIdx]?.date ?? null,
  };
}

/**
 * Row shape consumed by the chart. We use a single shared dataset so
 * recharts builds ONE X-axis scale across both series; per-series `data`
 * props confuse the axis and produce duplicate/out-of-order tick labels.
 *
 * Each row carries the original `value` / `source` for the tooltip, plus
 * two split values (`valueBackfill` / `valueSync`) that the Area + Line
 * elements read via `dataKey`. The cutover row (first sync point that
 * follows a backfill prefix) fills BOTH split values so the dashed line
 * visually connects to the solid line at the seam.
 */
interface ChartRow {
  date: string;
  dateMs: number;
  source: "sync" | "backfill";
  value: number;
  valueBackfill: number | null;
  valueSync: number | null;
}

function buildChartData(
  visible: NetWorthChartPoint[],
  cutoverDate: string | null,
): ChartRow[] {
  return visible.map((p) => {
    const isCutover = cutoverDate !== null && p.date === cutoverDate;
    let valueBackfill: number | null = null;
    let valueSync: number | null = null;
    if (p.source === "backfill" || isCutover) {
      valueBackfill = p.value;
    }
    if (p.source === "sync") {
      valueSync = p.value;
    }
    return {
      date: p.date,
      // Numeric timestamp lets recharts use a time scale, so the X-axis
      // is *time-proportional* (not categorical / equal-width slots).
      // Without this, 28 backfill days vs 7 sync days = 50/50 visual split.
      dateMs: Date.UTC(
        Number(p.date.slice(0, 4)),
        Number(p.date.slice(5, 7)) - 1,
        Number(p.date.slice(8, 10)),
      ),
      source: p.source,
      value: p.value,
      valueBackfill,
      valueSync,
    };
  });
}

export function NetWorthChart({
  series,
  initialRange = "ALL",
  detailsHref,
  title = "Net Worth Trend",
  description = "Daily net worth over time.",
}: NetWorthChartProps) {
  const [range, setRange] = React.useState<SnapshotRange>(initialRange);
  const reducedMotion = useReducedMotion();

  const visible = React.useMemo(
    () => filterByRange(series, range),
    [series, range],
  );

  const { backfill, sync, cutoverDate } = React.useMemo(
    () => splitAtCutover(visible),
    [visible],
  );

  const chartData = React.useMemo(
    () => buildChartData(visible, cutoverDate),
    [visible, cutoverDate],
  );

  // A single snapshot (e.g. the day you first link) still has a value worth
  // showing; render it as a lone point. The trend line + growth delta need at
  // least two points.
  const hasData = visible.length >= 1;
  const hasTrend = visible.length >= 2;
  const latest = visible.length > 0 ? visible[visible.length - 1] : null;

  // Domain padding so the line isn't pinned to the edges.
  const [minY, maxY] = React.useMemo(() => {
    if (!hasData) return [0, 1];
    const values = visible.map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.02, 100);
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [visible, hasData]);

  // With a single snapshot there's no min/max date span, so widen the X domain
  // by a day on each side to center the lone point instead of pinning it left.
  const xDomain = React.useMemo<[number | string, number | string]>(() => {
    if (visible.length !== 1) return ["dataMin", "dataMax"];
    const ms = Date.parse(`${visible[0].date}T00:00:00Z`);
    const day = 86_400_000;
    return [ms - day, ms + day];
  }, [visible]);

  // Growth indicator for the visible range.
  const growth = React.useMemo(() => {
    if (!hasTrend) return null;
    const start = visible[0];
    const end = visible[visible.length - 1];
    const delta = end.value - start.value;
    // Percent-change is only meaningful when both endpoints are positive.
    // Net worth that is negative (carrying debt) or crosses zero makes the
    // percentage explode or invert (e.g. a small -$8k base turns a normal
    // swing into "-375%"), which reads as a bug. In those cases we show the
    // dollar delta only and omit the percentage.
    const showPct = start.value > 0 && end.value > 0;
    const pct = showPct ? (delta / start.value) * 100 : 0;
    return {
      start,
      end,
      delta,
      pct,
      showPct,
      startIsBackfill: start.source === "backfill",
    };
  }, [visible, hasTrend]);

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
        {/* Growth indicator + range toggle */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            {latest ? (
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-display text-3xl font-semibold sm:text-4xl">
                  {formatCurrency(latest.value)}
                </span>
                {growth ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-sm font-medium tabular",
                      growth.delta >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {growth.delta >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {growth.delta >= 0 ? "+" : ""}
                    {formatCurrency(growth.delta)}
                    {growth.showPct ? (
                      <span className="text-xs text-foreground-lighter">
                        ({growth.delta >= 0 ? "+" : ""}
                        {growth.pct.toFixed(1)}%)
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-xs text-foreground-lighter">
                    as of today
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-foreground-lighter">
                Not enough data yet
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="xs"
                variant={range === r.key ? "default" : "ghost"}
                onClick={() => setRange(r.key)}
                className={cn(
                  "min-w-[2.5rem]",
                  range === r.key
                    ? "bg-brand text-primary-foreground hover:bg-brand-600"
                    : "text-foreground-light hover:bg-background",
                )}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Legend / methodology */}
        {hasTrend ? (
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-foreground-lighter">
            <span className="inline-flex items-center gap-1.5">
              <svg width="24" height="6" aria-hidden>
                <line
                  x1="0"
                  y1="3"
                  x2="24"
                  y2="3"
                  stroke="hsl(var(--brand))"
                  strokeWidth="2.5"
                />
              </svg>
              Recorded at each sync
            </span>
            <Popover>
              <PopoverTrigger className="inline-flex items-center gap-1 rounded text-foreground-muted outline-none transition-colors hover:text-foreground-light focus-visible:text-foreground-light focus-visible:ring-2 focus-visible:ring-ring/40">
                <Info className="h-3 w-3" aria-hidden />
                How is this computed?
              </PopoverTrigger>
              <PopoverContent align="start" className="leading-relaxed">
                <p className="font-medium text-foreground">
                  How net worth is computed
                </p>
                <p className="mt-1 text-foreground-light">
                  Your net worth is recorded each time your accounts sync, so
                  this chart starts when you link and builds forward from there.
                  Cash and credit balances are exact; investment values reflect
                  buys, sells, and dividends but <strong>not</strong> market
                  price changes between syncs.
                </p>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}

        {/* Chart */}
        <div className="h-[260px] w-full">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="brand-sync-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="brand-bf-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--brand-300))" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="hsl(var(--brand-300))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 6"
                />
                <XAxis
                  dataKey="dateMs"
                  type="number"
                  scale="time"
                  domain={xDomain}
                  tickFormatter={formatShortDateMs}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground-lighter))" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={32}
                  padding={{ left: 8, right: 16 }}
                />
                <YAxis
                  domain={[minY, maxY]}
                  tickFormatter={formatCompactUsd}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground-lighter))" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--brand))", strokeDasharray: "3 3" }}
                  content={<ChartTooltip />}
                />

                {/* Backfill segment: dashed brand-300 with faint area fill.
                    Reads from the shared dataset via `dataKey` so the X-axis
                    scale stays aligned with the sync segment. `connectNulls`
                    bridges the cutover row to the dashed line. */}
                {backfill.length > 0 ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="valueBackfill"
                      stroke="none"
                      fill="url(#brand-bf-fill)"
                      connectNulls
                      isAnimationActive={!reducedMotion}
                      animationDuration={520}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="valueBackfill"
                      stroke="hsl(var(--brand-300))"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                      activeDot={{
                        r: 4,
                        stroke: "hsl(var(--brand-300))",
                        strokeWidth: 2,
                        fill: "hsl(var(--background))",
                      }}
                      connectNulls
                      isAnimationActive={!reducedMotion}
                      animationDuration={760}
                      animationEasing="ease-out"
                    />
                  </>
                ) : null}

                {/* Sync segment: solid brand with stronger area fill. */}
                {sync.length > 0 ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="valueSync"
                      stroke="none"
                      fill="url(#brand-sync-fill)"
                      connectNulls
                      isAnimationActive={!reducedMotion}
                      animationDuration={560}
                      animationBegin={140}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="valueSync"
                      stroke="hsl(var(--brand))"
                      strokeWidth={2.5}
                      dot={
                        sync.length === 1
                          ? {
                              r: 4.5,
                              fill: "hsl(var(--brand))",
                              stroke: "hsl(var(--background))",
                              strokeWidth: 2,
                            }
                          : false
                      }
                      activeDot={{
                        r: 4,
                        stroke: "hsl(var(--brand))",
                        strokeWidth: 2,
                        fill: "hsl(var(--background))",
                      }}
                      connectNulls
                      isAnimationActive={!reducedMotion}
                      animationDuration={820}
                      animationBegin={140}
                      animationEasing="ease-out"
                    />
                  </>
                ) : null}

                {cutoverDate && backfill.length > 1 && sync.length > 1 ? (
                  <ReferenceLine
                    x={Date.UTC(
                      Number(cutoverDate.slice(0, 4)),
                      Number(cutoverDate.slice(5, 7)) - 1,
                      Number(cutoverDate.slice(8, 10)),
                    )}
                    stroke="hsl(var(--border-strong))"
                    strokeDasharray="2 4"
                    label={{
                      value: "Live tracking",
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "hsl(var(--foreground-lighter))",
                    }}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-md bg-muted/40 px-6 text-center text-sm text-foreground-lighter">
              <span className="font-medium text-foreground-light">
                Your history starts here
              </span>
              <span>
                We record your net worth each time your accounts sync, so this
                chart fills in over the next few days as your balances update.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
