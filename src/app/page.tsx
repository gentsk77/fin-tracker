import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  DollarSign,
  Landmark,
  TrendingUp,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Landmark,
    title: "Linked accounts",
    body: "Connect banks, cards, and brokerages in one place through Plaid.",
  },
  {
    icon: CreditCard,
    title: "Spending",
    body: "Categorized transactions and monthly trends, transfers filtered out.",
  },
  {
    icon: TrendingUp,
    title: "Assets",
    body: "Holdings, cash, and allocation across every brokerage account.",
  },
  {
    icon: DollarSign,
    title: "Net worth",
    body: "A daily net-worth line across every account you hold.",
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background-200">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-gradient-to-b from-brand-100/70 to-transparent"
        aria-hidden
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" aria-label="Fin-Tracker home">
          <BrandMark size="sm" withWordmark />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16">
        <div className="max-w-2xl">
          <span className="eyebrow">Personal finance, in one view</span>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Every account, every dollar, one clear picture.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-foreground-light">
            Fin-Tracker links your banks, cards, and brokerages, then turns the
            raw feed into spending trends, portfolio drift, and a net-worth line
            you can actually read.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/overview"
              className={cn(buttonVariants({ size: "lg" }), "gap-1.5")}
            >
              Go to overview
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Create an account
            </Link>
          </div>
        </div>

        <div className="mt-16 grid max-w-3xl gap-x-8 gap-y-7 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-200 text-brand">
                <f.icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-medium text-foreground">
                  {f.title}
                </h2>
                <p className="mt-0.5 text-sm leading-relaxed text-foreground-light">
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-6 py-6 text-xs text-foreground-lighter">
        Fin-Tracker. Your accounts, your data, your call.
      </footer>
    </div>
  );
}
