import { NextResponse } from "next/server";
import { notifyDueSoon } from "@/lib/email/notify";

/**
 * Daily digest of overdue and soon-due tasks, one email per assignee.
 *
 * Scheduled from vercel.json at 02:30 UTC, which is 08:00 IST — the workspace
 * owner's timezone. Vercel only schedules crons in UTC, so that offset is baked
 * into the expression and has to be recalculated if the team moves.
 *
 * Unlike every other route here there is no signed-in user to authorise, so the
 * request itself has to prove it came from the scheduler. Vercel sends the
 * project's CRON_SECRET as a bearer token; without that check the endpoint
 * would be a public button for spraying email at the whole workspace.
 */
export const dynamic = "force-dynamic";
/** Scanning tasks and sending a digest per assignee can outlast the default. */
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();

  // Refuse rather than run unauthenticated: an unset secret in production
  // would otherwise leave the endpoint wide open.
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await notifyDueSoon();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron] due-soon digest failed:", error);
    return NextResponse.json(
      { error: "Digest failed" },
      { status: 500 }
    );
  }
}
