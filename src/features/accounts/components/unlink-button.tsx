"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlink2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { removeConnection } from "@/server/plaid/actions";

interface Props {
  connectionId: string;
  institutionName: string;
}

export function UnlinkButton({ connectionId, institutionName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => {
          const ok = window.confirm(
            `Unlink ${institutionName}?\n\nThis removes the connection from Plaid and hides its accounts from your dashboard. Your historical net worth snapshots stay intact.`,
          );
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            try {
              await removeConnection(connectionId);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
        }}
        className="text-foreground-light hover:text-destructive"
      >
        {isPending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Unlink2 className="mr-2 h-3.5 w-3.5" />
        )}
        {isPending ? "Unlinking…" : "Unlink"}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
