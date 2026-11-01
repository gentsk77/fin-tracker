"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { autoSyncStaleConnections } from "@/server/plaid/actions";

const SENTINEL_KEY = "fintracker.autoSync";

/**
 * Invisible mount that runs `autoSyncStaleConnections` once per browser
 * session. Uses sessionStorage as a fast same-tab gate (catches Strict-Mode
 * double-mount in dev), and the server-side `sync_started_at` lock as the
 * authoritative cross-tab gate.
 *
 * Sentinel is written BEFORE awaiting so the second mount sees it and bails.
 * On success with non-zero synced connections, calls `router.refresh()` so
 * server components re-render against the freshly-written data.
 *
 * Auto-sync failures flip the affected connection's `status` to `error` in
 * the DB; the `<AttentionBanner />` on the Overview page surfaces those
 * (with a deep link to /accounts) so we don't need an in-flight toast here.
 */
export function AutoSyncBoundary() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SENTINEL_KEY)) return;
    sessionStorage.setItem(SENTINEL_KEY, "in-flight");

    let cancelled = false;
    (async () => {
      try {
        const result = await autoSyncStaleConnections();
        if (cancelled) return;
        sessionStorage.setItem(SENTINEL_KEY, new Date().toISOString());

        if (result.syncedCount > 0) {
          router.refresh();
        }
      } catch (err) {
        if (cancelled) return;
        sessionStorage.removeItem(SENTINEL_KEY);
        console.error("[AutoSyncBoundary] auto-sync failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally empty deps: fire once per mount; the sentinel handles
    // re-renders and React Strict Mode's deliberate double-invocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
