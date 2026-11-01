import { ArrowDownRight, ArrowUpRight, Info, Landmark } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { accountTypeLabel } from "@/domain/money";
import { formatCurrency } from "@/lib/format";
import { ActivityRangeFilter } from "@/features/net-worth/components/activity-range-filter";
import {
  getAccountActivityForWindow,
  type AccountActivityEntry,
  type ActivityWindowDays,
} from "@/server/db/snapshots";

interface AccountActivityProps {
  userId: string;
  days: ActivityWindowDays;
}

function tooltipFor(days: ActivityWindowDays): string {
  return `Last ${days} days of recorded transactions only. Excludes pending transactions and transfers between your own accounts. For investment / retirement accounts this reflects buys, sells, and dividends, not market price changes.`;
}

/**
 * Server-rendered "Account activity" card. Shows the top 3 gainers
 * (largest positive delta) on the left and top 3 dippers (largest
 * negative delta) on the right, over the selected window
 * (`days`: 7, 14, 30, or 90). Investment / retirement accounts that had
 * zero qualifying transactions in the window render in a separate "no
 * recorded activity" footnote, being transparent that we only see flows,
 * not price changes.
 *
 * Renders an empty state when nothing moved at all.
 */
export async function AccountActivity({ userId, days }: AccountActivityProps) {
  const entries = await getAccountActivityForWindow(userId, days);

  const moved = entries.filter((e) => Math.abs(e.delta) > 0.005);
  const noActivityInvestments = entries.filter((e) => e.noActivity);

  const gainers = [...moved]
    .filter((e) => e.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  const dippers = [...moved]
    .filter((e) => e.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);

  const tooltip = tooltipFor(days);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-1.5">
              Account activity
              <span
                className="inline-flex text-foreground-lighter"
                title={tooltip}
                aria-label={tooltip}
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            </CardTitle>
            <CardDescription>
              Where your money moved most in the last {days} days.
            </CardDescription>
          </div>
          <ActivityRangeFilter current={days} />
        </div>
      </CardHeader>
      <CardContent>
        {moved.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-foreground-lighter">
            All quiet: no significant changes in the last {days} days.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <ActivityColumn
              label="Top gainers"
              tone="positive"
              entries={gainers}
            />
            <ActivityColumn
              label="Top dippers"
              tone="negative"
              entries={dippers}
            />
          </div>
        )}

        {noActivityInvestments.length > 0 && (
          <div className="mt-4 border-t border-border pt-3 text-xs text-foreground-lighter">
            <span className="font-medium">No recorded activity:</span>{" "}
            {noActivityInvestments
              .map((e) => e.account.name)
              .join(", ")}
            <span className="ml-1">
              (price changes aren&apos;t tracked).
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ActivityColumnProps {
  label: string;
  tone: "positive" | "negative";
  entries: AccountActivityEntry[];
}

function ActivityColumn({ label, tone, entries }: ActivityColumnProps) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      {entries.length === 0 ? (
        <div className="flex h-16 items-center text-sm text-foreground-lighter">
          {tone === "positive"
            ? "No gainers this week."
            : "No dippers this week."}
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <ActivityRow key={entry.account.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: AccountActivityEntry }) {
  const { account, current, delta, pct } = entry;
  const isPositive = delta > 0;
  const sign = isPositive ? "+" : "-";
  const colorClass = isPositive ? "text-success" : "text-destructive";
  const Arrow = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <li className="flex items-center gap-3">
      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand">
        <Landmark className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{account.name}</div>
        <div className="text-xs text-foreground-lighter">
          {accountTypeLabel(account.type)} · {formatCurrency(current)}
        </div>
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium tabular ${colorClass}`}>
        <Arrow className="h-3.5 w-3.5" />
        <span>
          {sign}
          {formatCurrency(Math.abs(delta))}
        </span>
        <span className="text-xs opacity-80">
          ({sign}
          {Math.abs(pct).toFixed(1)}%)
        </span>
      </div>
    </li>
  );
}
