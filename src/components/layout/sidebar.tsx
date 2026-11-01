"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Landmark,
  CreditCard,
  TrendingUp,
  DollarSign,
  Scale,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { signOut } from "@/server/auth/actions";

const navItems = [
  {
    label: "Overview",
    href: "/overview",
    icon: LayoutDashboard,
  },
  {
    label: "Net Worth",
    href: "/net-worth",
    icon: DollarSign,
  },
  {
    label: "Spending",
    href: "/spending",
    icon: CreditCard,
  },
  {
    label: "Assets",
    href: "/investments",
    icon: TrendingUp,
  },
  {
    label: "Rebalance",
    href: "/rebalance",
    icon: Scale,
  },
  {
    label: "Accounts",
    href: "/accounts",
    icon: Landmark,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-brand-200 text-brand-700"
                : "text-foreground-light hover:bg-muted hover:text-foreground",
            )}
          >
            {isActive ? (
              <span
                className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand"
                aria-hidden
              />
            ) : null}
            <item.icon
              className={cn(
                "h-4 w-4",
                isActive ? "text-brand" : "text-foreground-muted group-hover:text-foreground-light",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4">
        <Link
          href="/overview"
          className="inline-flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Fin-Tracker home"
        >
          <BrandMark size="sm" withWordmark />
        </Link>
      </div>

      <div className="flex-1 px-2 py-1">
        <NavLinks />
      </div>

      <div className="border-t border-border px-2 py-3">
        <form>
          <Button
            type="submit"
            formAction={signOut}
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 px-2.5 text-[13px] font-medium text-foreground-light hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4 text-foreground-muted" />
            Sign Out
          </Button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:block">
      <SidebarContent />
    </aside>
  );
}

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="lg:hidden" />
        }
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SidebarContent />
      </SheetContent>
    </Sheet>
  );
}
