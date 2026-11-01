import { listSnapshots } from "@/server/db/snapshots";
import {
  NetWorthChart,
  type NetWorthChartPoint,
} from "@/features/net-worth/components/net-worth-chart";
import type { SnapshotRange } from "@/server/db/snapshots";

interface NetWorthChartCardProps {
  userId: string;
  initialRange?: SnapshotRange;
  detailsHref?: string;
  title?: string;
  description?: string;
}

/**
 * Server wrapper for the net-worth chart. Fetches every snapshot once,
 * hands the full series to the client component which filters in-memory
 * when the user toggles 1M / 6M / 1Y / ALL.
 */
export async function NetWorthChartCard({
  userId,
  initialRange = "ALL",
  detailsHref,
  title,
  description,
}: NetWorthChartCardProps) {
  const snapshots = await listSnapshots(userId, "ALL");

  const series: NetWorthChartPoint[] = snapshots.map((row) => ({
    date: row.date,
    value: Number(row.net_worth),
    source: row.source,
  }));

  return (
    <NetWorthChart
      series={series}
      initialRange={initialRange}
      detailsHref={detailsHref}
      title={title}
      description={description}
    />
  );
}
