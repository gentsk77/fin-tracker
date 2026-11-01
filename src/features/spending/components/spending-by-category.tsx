import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { categoryLabel } from "@/domain/category-taxonomy";
import { formatCurrency } from "@/lib/format";
import type { CategorySpending } from "@/server/db/transactions";

interface SpendingByCategoryProps {
  rows: CategorySpending[];
  /** Title override; defaults to "Spending by Category". */
  title?: string;
  /** Description override. */
  description?: string;
  /** Max rows to display; default 10. */
  limit?: number;
  /** If set, render a "View details →" link in the top-right (CardAction). */
  detailsHref?: string;
}

export function SpendingByCategory({
  rows,
  title = "Spending by Category",
  description = "Breakdown of your spending this month.",
  limit = 10,
  detailsHref,
}: SpendingByCategoryProps) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const visible = rows.slice(0, limit);

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
        {visible.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-foreground-lighter">
            No spending this month yet
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((row) => {
              const pct = total > 0 ? (row.amount / total) * 100 : 0;
              return (
                <li key={row.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2">
                      {categoryLabel(row.category)}
                      <span className="ml-2 text-xs text-foreground-lighter">
                        {row.count} {row.count === 1 ? "transaction" : "transactions"}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(row.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-brand"
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
