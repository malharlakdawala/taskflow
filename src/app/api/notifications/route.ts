import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { notificationMutationSchema, formatZodError } from "@/lib/validation";
import {
  NOTIFICATION_SELECT,
  serializeNotification,
} from "@/lib/notifications/serialize";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * One page of the signed-in user's feed, plus the unread count the bell badge
 * needs. Both come back together because the client wants them together, and
 * two endpoints would mean two round-trips on every poll.
 *
 * Scoped to `guard.user.id` in the query itself — a notification is private to
 * its recipient, so there is no id in the URL a caller could tamper with.
 */
export async function GET(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("filter") === "unread";
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const where = {
    userId: guard.user.id,
    ...(unreadOnly && { readAt: null }),
  };

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      relationLoadStrategy: "join",
      // id breaks ties so keyset pagination can't skip or repeat a row when
      // several notifications share a timestamp — which the fan-out on a
      // bulk edit guarantees will happen.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // One extra row is the cheapest way to know whether there is a next page.
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({
      where: { userId: guard.user.id, readAt: null },
    }),
  ]);

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(
    serializeNotification
  );

  return NextResponse.json({
    items,
    unreadCount,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

/** Clears notifications — the selected ones, or the whole feed. */
export async function DELETE(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = notificationMutationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { ids, all } = parsed.data;

  const result = await prisma.notification.deleteMany({
    where: {
      userId: guard.user.id,
      ...(all ? {} : { id: { in: ids } }),
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: guard.user.id, readAt: null },
  });

  return NextResponse.json({ success: true, deleted: result.count, unreadCount });
}
