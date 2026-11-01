"use client";

import { ChevronDown } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityWindowDays } from "@/server/db/snapshots";

const OPTIONS: { key: ActivityWindowDays; label: string }[] = [
  { key: 7, label: "7 days" },
  { key: 14, label: "14 days" },
  { key: 30, label: "30 days" },
  { key: 90, label: "90 days" },
];

function labelFor(days: ActivityWindowDays): string {
  return OPTIONS.find((o) => o.key === days)?.label ?? "7 days";
}

interface ActivityRangeFilterProps {
  current: ActivityWindowDays;
}

/**
 * Dropdown for the window-size selection on the Net Worth "Account activity"
 * card. Mirrors the selection into the URL as `?activityDays=` so the server
 * re-renders the section against the requested window. Scroll position is
 * preserved.
 */
export function ActivityRangeFilter({ current }: ActivityRangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setDays(next: ActivityWindowDays) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 7) {
      params.delete("activityDays");
    } else {
      params.set("activityDays", String(next));
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            {labelFor(current)}
            <ChevronDown data-icon="inline-end" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-36">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.key}
            onClick={() => setDays(opt.key)}
            className={
              opt.key === current ? "bg-muted text-foreground" : undefined
            }
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
