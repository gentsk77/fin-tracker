"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { MobileNav } from "./sidebar";

const ROUTE_LABELS: Record<string, string> = {
  overview: "Overview",
  accounts: "Accounts",
  spending: "Spending",
  investments: "Assets",
  "net-worth": "Net Worth",
  settings: "Settings",
};

interface HeaderProps {
  email?: string | null;
}

export function HeaderClient({ email }: HeaderProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = ROUTE_LABELS[seg] ?? seg;
    return { href, label };
  });

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
      <MobileNav />
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-[13px] min-w-0"
      >
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <div key={c.href} className="flex items-center gap-1.5 min-w-0">
              {i > 0 ? (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-foreground-muted"
                  aria-hidden
                />
              ) : null}
              {isLast ? (
                <span className="truncate font-medium text-foreground">
                  {c.label}
                </span>
              ) : (
                <Link
                  href={c.href}
                  className="truncate text-foreground-light transition-colors hover:text-foreground"
                >
                  {c.label}
                </Link>
              )}
            </div>
          );
        })}
      </nav>
      <div className="flex-1" />
      {email ? (
        <span className="text-[12px] text-foreground-lighter truncate">
          {email}
        </span>
      ) : null}
    </header>
  );
}
