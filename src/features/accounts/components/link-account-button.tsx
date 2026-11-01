"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  usePlaidLink,
  type PlaidLinkOnSuccess,
  type PlaidLinkOnExit,
} from "react-plaid-link";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createLinkToken,
  exchangePublicToken,
} from "@/server/plaid/actions";

interface Props {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
  className?: string;
}

export function LinkAccountButton({
  variant = "default",
  size = "default",
  label = "Link Account",
  className,
}: Props) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExchanging, startExchange] = useTransition();

  useEffect(() => {
    let cancelled = false;
    createLinkToken()
      .then((token) => {
        if (!cancelled) setLinkToken(token);
      })
      .catch((err) => {
        if (cancelled) return;
        setTokenError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken, metadata) => {
      setActionError(null);
      startExchange(async () => {
        try {
          const result = await exchangePublicToken(publicToken, {
            institution: metadata.institution
              ? {
                  institution_id: metadata.institution.institution_id,
                  name: metadata.institution.name,
                }
              : null,
          });
          if (!result.synced && result.syncError) {
            setActionError(`Linked, but initial sync failed: ${result.syncError}`);
          }
          router.refresh();
        } catch (err) {
          setActionError(err instanceof Error ? err.message : String(err));
        }
      });
    },
    [router]
  );

  const onExit = useCallback<PlaidLinkOnExit>((err) => {
    if (err) setActionError(err.display_message || err.error_message);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const disabled = !ready || !linkToken || isExchanging;
  const buttonError = tokenError ?? actionError;

  return (
    <div className={className}>
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => open()}
      >
        {isExchanging ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        {isExchanging ? "Linking…" : label}
      </Button>
      {buttonError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {buttonError}
        </p>
      )}
    </div>
  );
}
