import Link from "next/link";
import { AlertCircle, Landmark } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConnectionRow } from "@/server/db/connections";

interface AttentionBannerProps {
  connections: ConnectionRow[];
}

/**
 * Conditional banner at the top of the Overview page. Renders only when
 * the user needs to take action; otherwise it stays out of the way.
 *
 * Cases (priority order):
 *   1. No active connections → onboarding nudge to link first account
 *   2. Any connection in `error` / `requires_reauth` → reauth nudge
 */
export function AttentionBanner({ connections }: AttentionBannerProps) {
  const active = connections.filter((c) => c.status === "active");
  const needsReauth = connections.filter(
    (c) => c.status === "error" || c.status === "requires_reauth",
  );

  if (active.length === 0 && needsReauth.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-200 text-brand">
          <Landmark className="h-4 w-4" />
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Link your first account</p>
            <p className="text-xs text-foreground-lighter">
              Connect a bank or investment account to start tracking your
              finances.
            </p>
          </div>
          <Link
            href="/accounts"
            className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
          >
            Link account
          </Link>
        </div>
      </div>
    );
  }

  if (needsReauth.length > 0) {
    const count = needsReauth.length;
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/20 text-warning">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {count} account{count === 1 ? "" : "s"} need attention
            </p>
            <p className="text-xs text-foreground-lighter">
              {count === 1 ? "A connection" : "Some connections"} stopped
              syncing. Reauthorize from the Accounts page to resume updates.
            </p>
          </div>
          <Link
            href="/accounts"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "shrink-0",
            )}
          >
            Go to Accounts
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
