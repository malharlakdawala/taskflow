import { NextResponse } from "next/server";

/**
 * Throws on purpose so the error pipeline (Sentry -> alert) can be verified
 * end to end. Same gate as /api/health: needs HEALTH_TOKEN via x-health-token,
 * otherwise 404, so the public cannot trigger it.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = process.env.HEALTH_TOKEN?.trim();
  if (!token || request.headers.get("x-health-token") !== token) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  throw new Error("Sentry test error from taskflow (intentional, safe to ignore)");
}
