import type { Prisma } from "@/generated/prisma/client";

/** The actor's avatar and name are all the feed renders of them. */
export const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  url: true,
  taskId: true,
  commentId: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, email: true, name: true, avatarUrl: true } },
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT;
}>;

/** Dates cross the wire as ISO strings, matching every other payload here. */
export function serializeNotification(notification: NotificationRow) {
  return {
    ...notification,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
