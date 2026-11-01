import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "brand" | "neutral" | "success" | "destructive" | "warning";

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: "bg-brand-200", fg: "text-brand-600" },
  neutral: { bg: "bg-muted", fg: "text-foreground-light" },
  success: { bg: "bg-success/10", fg: "text-success" },
  destructive: { bg: "bg-destructive/10", fg: "text-destructive" },
  warning: { bg: "bg-warning/10", fg: "text-warning" },
};

export interface MetricCardProps extends React.ComponentPropsWithoutRef<"div"> {
  icon?: LucideIcon;
  iconTone?: Tone;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trailing?: React.ReactNode;
  /**
   * When provided, the entire card becomes a `<Link>` to this href and
   * receives a subtle hover treatment to signal it's interactive.
   */
  href?: string;
}

export function MetricCard({
  icon: Icon,
  iconTone = "brand",
  label,
  value,
  hint,
  trailing,
  href,
  className,
  ...props
}: MetricCardProps) {
  const tone = TONE_STYLES[iconTone];

  const body = (
    <>
      {Icon ? (
        <div
          className={cn(
            "shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md",
            tone.bg,
          )}
        >
          <Icon className={cn("h-4 w-4", tone.fg)} aria-hidden />
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight tabular truncate">
          {value}
        </div>
        {hint ? (
          <div className="mt-1 text-xs text-foreground-lighter">{hint}</div>
        ) : null}
      </div>
      {trailing ? (
        <div className="shrink-0 self-center">{trailing}</div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "block rounded-lg bg-card ring-1 ring-border elevation-card px-4 py-3.5 flex items-start gap-3 transition-all hover:ring-border-strong hover:bg-muted/40",
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg bg-card ring-1 ring-border elevation-card px-4 py-3.5 flex items-start gap-3",
        className,
      )}
      {...props}
    >
      {body}
    </div>
  );
}
