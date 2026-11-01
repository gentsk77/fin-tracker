import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CardLinkProps {
  href: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Small "View details →" link, intended for the top-right (CardAction slot)
 * of a section card on the Overview dashboard. Drives one-click drill-down
 * into the matching detail tab.
 */
export function CardLink({
  href,
  children = "View details",
  className,
}: CardLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-brand-link transition-colors hover:text-brand-700",
        className,
      )}
    >
      {children}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}
