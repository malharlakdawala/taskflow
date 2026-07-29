import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo";
import {
  DEMO_PEOPLE,
  clearDemoContent,
  seedDemoContent,
} from "@/lib/demo-data";

/**
 * Puts the public demo back the way it was.
 *
 * A demo anyone can sign into is a demo anyone can empty, so the content is
 * rebuilt on a schedule. Only the *content* — tasks, comments, notifications,
 * tokens. The accounts are left alone, because recreating those needs the
 * service-role key and that key has no business being in a deployment.
 *
 * This endpoint deletes every task in the database, so it is behind two
 * independent gates: the deployment must be a demo, and the caller must know
 * CRON_SECRET. Either one missing and it refuses. On a normal deployment the
 * first gate alone makes it permanently inert.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isDemoMode) {
    return NextResponse.json(
      { error: "Not a demo deployment." },
      { status: 404 }
    );
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ordered to match DEMO_PEOPLE, because the fixture refers to members by
  // position. A demo whose accounts have been removed is not one this can fix.
  const members = await Promise.all(
    DEMO_PEOPLE.map((person) =>
      prisma.user.findUnique({
        where: { email: person.email },
        select: { id: true },
      })
    )
  );

  if (members.some((member) => !member)) {
    return NextResponse.json(
      {
        error:
          "The demo accounts are missing. Run `npm run seed` against this " +
          "database to recreate them.",
      },
      { status: 409 }
    );
  }

  const ids = members.map((member) => member!.id);

  try {
    await clearDemoContent(prisma);
    const { tasks, comments } = await seedDemoContent(prisma, ids);
    return NextResponse.json({ success: true, tasks, comments });
  } catch (error) {
    console.error("[cron] demo reset failed:", error);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
