import { DollarSign, Landmark, Wallet } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { formatCurrency } from "@/lib/format";

interface NetWorthSummaryProps {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  hadNonUsdAccounts?: boolean;
}

export function NetWorthSummary({
  totalAssets,
  totalLiabilities,
  netWorth,
  hadNonUsdAccounts,
}: NetWorthSummaryProps) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={Wallet}
          iconTone="success"
          label="Total Assets"
          value={
            <span className="text-success">{formatCurrency(totalAssets)}</span>
          }
        />
        <MetricCard
          icon={Landmark}
          iconTone="destructive"
          label="Total Liabilities"
          value={
            <span className="text-destructive">
              {formatCurrency(totalLiabilities)}
            </span>
          }
        />
        <MetricCard
          icon={DollarSign}
          iconTone="brand"
          label="Net Worth"
          value={
            <span className={netWorth < 0 ? "text-destructive" : undefined}>
              {formatCurrency(netWorth)}
            </span>
          }
        />
      </div>
      {hadNonUsdAccounts && (
        <p className="text-xs text-foreground-lighter">
          Non-USD accounts are excluded from these totals.
        </p>
      )}
    </div>
  );
}

