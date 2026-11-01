import * as React from "react";
import { cn } from "@/lib/utils";

type StatusTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "destructive"
  | "info";

const TONE_CLASSES: Record<
  StatusTone,
  { bg: string; text: string; dot: string }
> = {
  neutral: {
    bg: "bg-muted",
    text: "text-foreground-light",
    dot: "bg-foreground-muted",
  },
  brand: {
    bg: "bg-brand-200",
    text: "text-brand-600",
    dot: "bg-brand",
  },
  success: {
    bg: "bg-success/10",
    text: "text-success",
    dot: "bg-success",
  },
  warning: {
    bg: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning",
  },
  destructive: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    dot: "bg-destructive",
  },
  info: {
    bg: "bg-brand-100",
    text: "text-brand-link",
    dot: "bg-brand-link",
  },
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
}

export function StatusBadge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const styles = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        styles.bg,
        styles.text,
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", styles.dot)}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
