import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const TILE: Record<Size, string> = {
  sm: "h-7 w-7 rounded-md text-sm",
  md: "h-9 w-9 rounded-lg text-base",
  lg: "h-12 w-12 rounded-xl text-xl",
};

const WORD: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

/**
 * Brand lockup: the indigo "F" tile, optionally paired with the wordmark.
 * Shared across the marketing landing, auth screens, and the app sidebar so
 * the identity stays consistent everywhere instead of a bare emoji.
 */
export function BrandMark({
  className,
  size = "md",
  withWordmark = false,
}: {
  className?: string;
  size?: Size;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center bg-gradient-to-br from-brand to-brand-600 font-semibold text-primary-foreground ring-1 ring-inset ring-white/15 elevation-card",
          TILE[size],
        )}
        aria-hidden
      >
        F
      </span>
      {withWordmark ? (
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground",
            WORD[size],
          )}
        >
          Fin-Tracker
        </span>
      ) : null}
    </span>
  );
}
