"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DEMO_CREDENTIALS, isDemoMode } from "@/lib/demo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    // Return the user to whatever the proxy bounced them away from.
    // Read from location rather than useSearchParams to avoid needing a
    // Suspense boundary around this page.
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next?.startsWith("/") ? next : "/board");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <CardDescription>Sign in to your task manager</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Only on a demo deployment. A visitor who has to sign up and then
              wait for approval will simply leave. */}
          {isDemoMode && (
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/[0.06] p-3 text-sm">
              <p className="font-semibold">This is a public demo</p>
              <p className="mt-1 text-muted-foreground">
                Sign in and change whatever you like — the data resets
                regularly, and nothing here is real.
              </p>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-background/70 px-2.5 py-1.5 font-mono text-xs">
                <span>
                  {DEMO_CREDENTIALS.email}
                  <span className="text-muted-foreground"> / </span>
                  {DEMO_CREDENTIALS.password}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="font-sans"
                  onClick={() => {
                    setEmail(DEMO_CREDENTIALS.email);
                    setPassword(DEMO_CREDENTIALS.password);
                  }}
                >
                  Fill in
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
