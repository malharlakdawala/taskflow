"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
  MessageSquare,
  PenLine,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/lib/types";

/**
 * A glanceable icon per event, so the feed can be scanned without reading it.
 * The tones borrow from the status palette used on the board.
 */
const APPEARANCE: Record<
  NotificationType,
  { icon: typeof UserPlus; className: string }
> = {
  TASK_ASSIGNED: {
    icon: UserPlus,
    className: "bg-primary/10 text-primary ring-primary/15",
  },
  TASK_UPDATED: {
    icon: PenLine,
    className: "bg-blue-500/10 text-blue-600 ring-blue-500/15 dark:text-blue-400",
  },
  TASK_COMMENT: {
    icon: MessageSquare,
    className:
      "bg-purple-500/10 text-purple-600 ring-purple-500/15 dark:text-purple-400",
  },
  TASK_DUE_SOON: {
    icon: CalendarClock,
    className: "bg-destructive/10 text-destructive ring-destructive/15",
  },
  ACCOUNT_APPROVED: {
    icon: ShieldCheck,
    className:
      "bg-green-500/10 text-green-600 ring-green-500/15 dark:text-green-400",
  },
};

export function NotificationItem({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  /** Fired before navigation so the row can be marked read optimistically. */
  onOpen: (notification: AppNotification) => void;
}) {
  const { icon: Icon, className } = APPEARANCE[notification.type];
  const isUnread = notification.readAt === null;

  return (
    <Link
      href={notification.url}
      onClick={() => onOpen(notification)}
      className={cn(
        "group flex gap-3 rounded-lg px-3 py-2.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        isUnread ? "bg-primary/[0.04] hover:bg-primary/[0.07]" : "hover:bg-muted/60"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1",
          className
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "line-clamp-2 text-sm leading-snug",
            isUnread ? "font-semibold" : "font-medium text-foreground/90"
          )}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {notification.body}
          </p>
        )}
        <time
          dateTime={notification.createdAt}
          title={new Date(notification.createdAt).toLocaleString()}
          className="mt-1 block text-[11px] text-muted-foreground/80"
        >
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </time>
      </div>

      {/* The unread marker is a dot rather than a colour change alone, so it
          survives both themes and a colour-blind reader. */}
      {isUnread && (
        <span
          aria-label="Unread"
          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
        />
      )}
    </Link>
  );
}
