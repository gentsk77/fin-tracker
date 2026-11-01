import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { accountTypeLabel, isLiabilityType } from "@/domain/money";
import { formatCurrency } from "@/lib/format";
import type { AccountType } from "@/types";

interface LiabilitiesBreakdownProps {
  byType: Partial<Record<AccountType, number>>;
}

/**
 * "What you owe" view: credit cards, loans, mortgages broken down by
 * account type. Counterpart to `<AssetAllocationCard />`; kept as its
 * own card because liabilities live in a different mental model from
 * assets.
 */
export function LiabilitiesBreakdown({ byType }: LiabilitiesBreakdownProps) {
  const rows = (Object.entries(byType) as Array<[AccountType, number]>)
    .filter(([t, amount]) => isLiabilityType(t) && amount > 0)
    .map(([type, amount]) => ({ type, amount }))
    .sort((a, b) => b.amount - a.amount);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liabilities</CardTitle>
        <CardDescription>What you owe across all accounts.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-foreground-lighter">
            No liabilities tracked
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const pct = total > 0 ? (row.amount / total) * 100 : 0;
              return (
                <li key={row.type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground-light">
                      {accountTypeLabel(row.type)}
                    </span>
                    <span className="font-medium tabular">
                      {formatCurrency(row.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-destructive"
                      style={{ width: `${pct.toFixed(1)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
