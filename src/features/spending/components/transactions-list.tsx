import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { categoryLabel, classifyCategory } from "@/domain/category-taxonomy";
import { formatCurrency } from "@/lib/format";
import type { TransactionRow } from "@/server/db/transactions";

interface TransactionsListProps {
  transactions: TransactionRow[];
  /** Map of account_id -> display name, for the account column. */
  accountNames?: Record<string, string>;
  title?: string;
  description?: string;
  /** If set, render a "View details →" link in the top-right (CardAction). */
  detailsHref?: string;
}

function formatDate(iso: string): string {
  // iso is YYYY-MM-DD; render as short, locale-agnostic.
  const [, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${months[idx]} ${Number(d)}`;
}

export function TransactionsList({
  transactions,
  accountNames,
  title = "All Transactions",
  description = "Your recent transactions across all linked accounts.",
  detailsHref,
}: TransactionsListProps) {
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
        {transactions.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-foreground-lighter">
            No transactions yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="eyebrow py-2 pr-4">Date</th>
                  <th className="eyebrow py-2 pr-4">Description</th>
                  <th className="eyebrow py-2 pr-4">Category</th>
                  {accountNames && (
                    <th className="eyebrow py-2 pr-4">Account</th>
                  )}
                  <th className="eyebrow py-2 pr-0 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isDebit = tx.type === "debit";
                  const sign = isDebit ? "-" : "+";
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-border last:border-b-0 align-top"
                    >
                      <td className="py-2 pr-4 whitespace-nowrap text-foreground-lighter">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          {tx.merchant_name || tx.name}
                          {tx.pending && (
                            <StatusBadge tone="warning" dot>
                              Pending
                            </StatusBadge>
                          )}
                        </div>
                        {tx.merchant_name && tx.merchant_name !== tx.name && (
                          <div className="text-xs text-foreground-lighter">
                            {tx.name}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-foreground-light">
                        {categoryLabel(classifyCategory(tx).key)}
                      </td>
                      {accountNames && (
                        <td className="py-2 pr-4 text-foreground-light">
                          {accountNames[tx.account_id] ?? "–"}
                        </td>
                      )}
                      <td
                        className={
                          "py-2 pr-0 text-right tabular font-medium " +
                          (isDebit ? "" : "text-success")
                        }
                      >
                        {sign}
                        {formatCurrency(Number(tx.amount), tx.currency_code)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
