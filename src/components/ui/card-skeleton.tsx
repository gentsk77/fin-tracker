import { Skeleton } from "@/components/ui/skeleton";

/**
 * Reusable card-shaped skeleton with optional title + body. Used by both
 * route-level `loading.tsx` files and per-component `<Suspense>` fallbacks
 * so the placeholder matches the real card chrome 1:1.
 */
export function CardSkeleton({
  heightClass = "h-[200px]",
  showHeader = true,
  className = "",
}: {
  heightClass?: string;
  showHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 elevation-card ${className}`}>
      {showHeader ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      ) : null}
      <Skeleton className={`${showHeader ? "mt-4" : ""} w-full ${heightClass}`} />
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 elevation-card">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function AttentionBannerSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-9 w-9" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>
    </div>
  );
}
