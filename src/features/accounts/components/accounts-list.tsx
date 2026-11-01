import {
  Banknote,
  CreditCard,
  Home,
  Landmark,
  PiggyBank,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import type { AccountType } from "@/types";
import type { AccountRow } from "@/server/db/accounts";
import type { ConnectionRow } from "@/server/db/connections";

import { SyncButton } from "./sync-button";
import { UnlinkButton } from "./unlink-button";

const LIABILITY_TYPES = new Set<AccountType>(["credit", "loan", "mortgage"]);

const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  checking: Wallet,
  savings: PiggyBank,
  credit: CreditCard,
  loan: Banknote,
  mortgage: Home,
  investment: TrendingUp,
  retirement: ShieldCheck,
  other: Landmark,
};

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit: "Credit Card",
  loan: "Loan",
  mortgage: "Mortgage",
  investment: "Investment",
  retirement: "Retirement",
  other: "Other",
};

function institutionInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

interface Props {
  connections: ConnectionRow[];
  accounts: AccountRow[];
}

export function AccountsList({ connections, accounts }: Props) {
  const grouped = new Map<string, AccountRow[]>();
  for (const acc of accounts) {
    const key = acc.connection_id ?? "__manual__";
    const list = grouped.get(key) ?? [];
    list.push(acc);
    grouped.set(key, list);
  }

  return (
    <div className="space-y-4">
      {connections.map((conn) => (
        <ConnectionGroup
          key={conn.id}
          connection={conn}
          accounts={grouped.get(conn.id) ?? []}
        />
      ))}

      {grouped.has("__manual__") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual Accounts</CardTitle>
            <CardDescription>
              Accounts you&apos;ve added manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(grouped.get("__manual__") ?? []).map((acc) => (
              <AccountRowItem key={acc.id} account={acc} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ConnectionGroup({
  connection,
  accounts,
}: {
  connection: ConnectionRow;
  accounts: AccountRow[];
}) {
  const institutionName = connection.institution_name ?? "Linked Institution";
  const isErrored = connection.status === "error";
  const initials = institutionInitials(institutionName);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-200 text-[12px] font-semibold text-brand-700"
            aria-hidden
          >
            {initials}
          </span>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{institutionName}</CardTitle>
              {isErrored && (
                <StatusBadge tone="destructive" dot>
                  Sync error
                </StatusBadge>
              )}
            </div>
            <CardDescription>
              {accounts.length} account{accounts.length === 1 ? "" : "s"} ·{" "}
              Last synced {formatRelativeDate(connection.last_synced_at)}
            </CardDescription>
            {isErrored && connection.error_message && (
              <p className="text-xs text-destructive">
                {connection.error_message}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <SyncButton connectionId={connection.id} />
          <UnlinkButton
            connectionId={connection.id}
            institutionName={institutionName}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {accounts.length === 0 ? (
          <p className="text-sm text-foreground-lighter">
            No accounts returned for this connection yet. Try syncing.
          </p>
        ) : (
          accounts.map((acc, idx) => (
            <div key={acc.id}>
              <AccountRowItem account={acc} />
              {idx < accounts.length - 1 && <Separator className="my-1" />}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AccountRowItem({ account }: { account: AccountRow }) {
  const Icon = ACCOUNT_ICONS[account.type];
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type];
  const isLiability = LIABILITY_TYPES.has(account.type);
  const balance = account.current_balance;
  const showAsNegative = isLiability && balance !== null && balance > 0;

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground-light">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium leading-none">{account.name}</p>
          <p className="mt-1 text-xs text-foreground-lighter">
            {typeLabel}
            {account.official_name && account.official_name !== account.name
              ? ` · ${account.official_name}`
              : ""}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-semibold tabular ${
            showAsNegative ? "text-destructive" : ""
          }`}
        >
          {showAsNegative ? "-" : ""}
          {formatCurrency(balance, account.currency_code)}
        </p>
        {account.available_balance !== null &&
          account.available_balance !== balance && (
            <p className="text-xs text-foreground-lighter">
              {formatCurrency(account.available_balance, account.currency_code)}{" "}
              available
            </p>
          )}
      </div>
    </div>
  );
}

