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
import type {
  HoldingWithSecurity,
  PortfolioAccountGroup,
} from "@/server/db/holdings";

interface HoldingsTableProps {
  /** Per-account groups, subtotal-sorted by getPortfolioAccounts. */
  groups: PortfolioAccountGroup[];
  /** Total portfolio value used to compute each account's % of portfolio. */
  portfolioValue: number;
  /** Optional override for the title. */
  title?: string;
  /** Optional override for the subtitle. */
  description?: string;
  detailsHref?: string;
  /** True if any non-USD holdings were dropped from the portfolio total. */
  hadNonUsdHoldings?: boolean;
}

function tickerOrFallback(h: HoldingWithSecurity): string {
  return h.security?.ticker_symbol ?? "–";
}

function nameOrFallback(h: HoldingWithSecurity): string {
  return h.security?.name ?? "Unknown holding";
}

function fmtQty(qty: number): string {
  // Two-decimal default; trim trailing zeros for whole-share counts so the
  // column doesn't look fractional when it shouldn't.
  if (Math.abs(qty - Math.round(qty)) < 1e-9) return qty.toFixed(0);
  return qty.toFixed(qty < 1 ? 4 : 2);
}

function pricePerShare(h: HoldingWithSecurity): number | null {
  if (h.quantity === 0) return null;
  return Number(h.current_value) / Number(h.quantity);
}

function cashRowLabel(type: PortfolioAccountGroup["accountType"]): string {
  return type === "other" ? "Cash" : "Balance (holdings not itemized)";
}

/**
 * One account's section: a header band (name · institution · subtotal) over a
 * table of its holdings, with a trailing cash row when the account contributes
 * a bare balance (e.g. a brokerage cash management account). The "% of account"
 * column shows each position's share of its own account so it stays meaningful
 * within the group.
 */
function AccountGroupSection({
  group,
  portfolioValue,
}: {
  group: PortfolioAccountGroup;
  portfolioValue: number;
}) {
  const groupPct =
    portfolioValue > 0 ? (group.subtotal / portfolioValue) * 100 : null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{group.accountName}</p>
          {group.institutionName ? (
            <p className="truncate text-xs text-foreground-lighter">
              {group.institutionName}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular">
            {formatCurrency(group.subtotal)}
          </p>
          {groupPct != null ? (
            <p className="text-xs tabular text-foreground-lighter">
              {groupPct.toFixed(1)}% of portfolio
            </p>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-foreground-lighter">
              <th className="py-2 pr-3 font-medium">Ticker</th>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 pr-3 text-right font-medium">Price</th>
              <th className="py-2 pr-3 text-right font-medium">Value</th>
              <th className="py-2 pl-3 text-right font-medium">% of acct</th>
            </tr>
          </thead>
          <tbody>
            {group.holdings.map((h) => {
              const value = Number(h.current_value);
              const includesInTotal =
                h.currency_code === "USD" && group.subtotal > 0;
              const pct = includesInTotal
                ? (value / group.subtotal) * 100
                : null;
              const price = pricePerShare(h);

              return (
                <tr
                  key={h.id}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <td className="py-2.5 pr-3 font-medium">
                    {tickerOrFallback(h)}
                  </td>
                  <td className="max-w-[260px] py-2.5 pr-3 text-foreground-light">
                    <span className="block truncate">{nameOrFallback(h)}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular">
                    {fmtQty(Number(h.quantity))}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular text-foreground-light">
                    {price == null
                      ? "–"
                      : formatCurrency(price, h.currency_code)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium tabular">
                    {formatCurrency(value, h.currency_code)}
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular text-foreground-light">
                    {pct == null ? "–" : `${pct.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}

            {group.cashValue > 0 ? (
              <tr className="border-b border-border/60 last:border-b-0">
                <td className="py-2.5 pr-3 font-medium text-foreground-light">
                  –
                </td>
                <td className="py-2.5 pr-3 text-foreground-light" colSpan={3}>
                  {cashRowLabel(group.accountType)}
                </td>
                <td className="py-2.5 pr-3 text-right font-medium tabular">
                  {formatCurrency(group.cashValue)}
                </td>
                <td className="py-2.5 pl-3 text-right tabular text-foreground-light">
                  {group.subtotal > 0
                    ? `${((group.cashValue / group.subtotal) * 100).toFixed(
                        1,
                      )}%`
                    : "–"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Holdings for the Assets page, grouped by account.
 *
 * Each account is its own section with a subtotal and its positions; accounts
 * that only carry cash (brokerage cash-management accounts, balance-only plans) show a
 * single cash row. Non-USD holdings are still listed but excluded from the
 * percentages.
 */
export function HoldingsTable({
  groups,
  portfolioValue,
  title = "Holdings by account",
  description = "Your positions, grouped by account.",
  detailsHref,
  hadNonUsdHoldings,
}: HoldingsTableProps) {
  const hasAny = groups.some((g) => g.holdings.length > 0 || g.cashValue > 0);

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
        {!hasAny ? (
          <div className="flex h-32 items-center justify-center text-sm text-foreground-lighter">
            No holdings yet
          </div>
        ) : (
          <div className="space-y-6">
            {hadNonUsdHoldings ? (
              <p className="text-xs text-foreground-lighter">
                Non-USD holdings appear in the list but are excluded from the
                portfolio percentages.
              </p>
            ) : null}
            {groups.map((group) => (
              <AccountGroupSection
                key={group.accountId}
                group={group}
                portfolioValue={portfolioValue}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

