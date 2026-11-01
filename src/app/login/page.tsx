import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { login, signInWithGoogle } from "@/server/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background-200 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-50" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-100/70 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark size="lg" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-foreground-light">
              Sign in to your Fin-Tracker account.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4">
            {params.error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{params.error}</span>
              </div>
            )}
            {params.message && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{params.message}</span>
              </div>
            )}

            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" formAction={login} className="w-full">
                Sign in
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-foreground-lighter">
                  or continue with
                </span>
              </div>
            </div>

            <form>
              <Button
                type="submit"
                formAction={signInWithGoogle}
                variant="outline"
                className="w-full"
              >
                Google
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center border-t border-border">
            <p className="text-sm text-foreground-light">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-brand-link underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
