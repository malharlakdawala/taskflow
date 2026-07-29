import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { notificationMutationSchema, formatZodError } from "@/lib/validation";

/**
 * Marks notifications read — the one just opened, or all of them.
 *
 * `readAt: null` is part of the filter so re-reading something does not move
 * its timestamp, and so "mark all read" touches only the rows that need it
 * rather than rewriting the user's entire history.
 */
export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = notificationMutationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { ids, all } = parsed.data;

  await prisma.notification.updateMany({
    where: {
      userId: guard.user.id,
      readAt: null,
      ...(all ? {} : { id: { in: ids } }),
    },
    data: { readAt: new Date() },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: guard.user.id, readAt: null },
  });

  return NextResponse.json({ success: true, unreadCount });
}
