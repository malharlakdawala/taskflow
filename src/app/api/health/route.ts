import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Deep health check for the external monitor (auto_test_and_error).
 *
 * Runs a real query against the database and pings Supabase Auth, so a changed
 * DATABASE_URL password or a broken Supabase key is reported here (503) before
 * a user hits it. Gated by HEALTH_TOKEN (x-health-token header) so the public
 * cannot use it to open database connections; with no token configured it
 * answers 404.
 */
export const dynamic = "force-dynamic";

type Check = { ok: boolean; ms: number; error?: string };

async function timed(fn: () => Promise<void>): Promise<Check> {
  const started = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET(request: Request) {
  const token = process.env.HEALTH_TOKEN?.trim();
  if (!token || request.headers.get("x-health-token") !== token) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [db, supabaseAuth] = await Promise.all([
    timed(async () => {
      await prisma.$queryRaw`SELECT 1`;
    }),
    timed(async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
        {
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) throw new Error(`Supabase Auth returned ${res.status}`);
    }),
  ]);

  const checks = { db, supabaseAuth };
  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
