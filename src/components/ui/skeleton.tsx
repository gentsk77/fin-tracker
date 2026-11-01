import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Low-level skeleton primitive. Renders a pulsing muted block at the size
 * of its container or via passed-in width/height utilities. Compose this
 * inside route-level `loading.tsx` files (and inline `<Suspense>` boundaries)
 * to give navigating users a structural preview while the server streams
 * the real content.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
      {...props}
    />
  );
}

export { Skeleton };
