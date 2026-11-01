import { Suspense } from "react";
import { Landmark } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { listAccounts } from "@/server/db/accounts";
import { listConnections } from "@/server/db/connections";
import { AccountsList } from "@/features/accounts/components/accounts-list";
import { LinkAccountButton } from "@/features/accounts/components/link-account-button";

/**
 * Accounts page.
 *
 * Auth + a cheap `listConnections` query happen upfront so we can decide
 * whether to render the empty-state CTA card or the populated accounts
 * list. The populated list streams its accounts in via `<Suspense>` so
 * the header (with Link Account button) is interactive immediately.
 */
export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const connections = await listConnections(user.id);
  const hasAnyConnection = connections.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-foreground-light">
            Manage your linked bank and investment accounts.
          </p>
        </div>
        {hasAnyConnection && <LinkAccountButton />}
      </div>

      {hasAnyConnection ? (
        <Suspense fallback={<AccountsListSkeleton />}>
          <AccountsSection userId={user.id} />
        </Suspense>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Linked Accounts</CardTitle>
            <CardDescription>
              Connect your bank, credit card, and investment accounts via
              Plaid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-200">
                <Landmark className="h-5 w-5 text-brand-600" />
              </div>
              <div className="text-center">
                <p className="font-medium">No accounts linked yet</p>
                <p className="text-sm text-foreground-lighter">
                  Click &quot;Link Account&quot; to connect your first bank or
                  investment account.
                </p>
              </div>
              <LinkAccountButton label="Link Your First Account" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function AccountsSection({ userId }: { userId: string }) {
  const [connections, accounts] = await Promise.all([
    listConnections(userId),
    listAccounts(userId),
  ]);
  return <AccountsList connections={connections} accounts={accounts} />;
}

function AccountsListSkeleton() {
  return (
    <div className="space-y-4">
      <ConnectionCardSkeleton accountRows={3} />
      <ConnectionCardSkeleton accountRows={2} />
    </div>
  );
}

function ConnectionCardSkeleton({ accountRows }: { accountRows: number }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: accountRows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
