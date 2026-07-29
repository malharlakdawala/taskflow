"use client";

import { useMemo, useState } from "react";
import { BellOff, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NotificationItem } from "@/components/notifications/notification-item";
import { cn } from "@/lib/utils";
import { useNotifications, useNotificationActions } from "@/lib/use-notifications";
import type { AppNotification } from "@/lib/types";

type Filter = "all" | "unread";

/**
 * The whole feed, for when the bell's preview isn't enough.
 *
 * Filtering happens on already-loaded rows rather than by refetching with
 * `?filter=unread`: the list is short, it keeps "Unread" instant, and it means
 * marking something read doesn't make it vanish from under the cursor
 * mid-click. The server-side filter stays available for anything that needs it.
 */
export default function NotificationsPage() {
  const { items, unreadCount, nextCursor, isLoading, isLoadingMore, error } =
    useNotifications();
  const { loadMore, markRead, markAllRead, clearAll } = useNotificationActions();
  const [filter, setFilter] = useState<Filter>("all");
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((n) => n.readAt === null) : items),
    [items, filter]
  );

  const open = (notification: AppNotification) => markRead([notification.id]);

  return (
    <div className="enter flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Notifications
            </h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "Everything here has been read"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={unreadCount === 0}
              onClick={markAllRead}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              disabled={items.length === 0}
              onClick={() => setIsConfirmingClear(true)}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        <div className="mt-3 flex gap-1">
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                filter === value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {value}
              {value === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 tabular-nums">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl">
          {isLoading && items.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-[72px] rounded-lg" />
              ))}
            </div>
          ) : error && items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {error}
            </p>
          ) : visible.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <>
              <div className="space-y-1">
                {visible.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onOpen={open}
                  />
                ))}
              </div>

              {nextCursor && (
                <div className="pt-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    {isLoadingMore ? "Loading…" : "Load older"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={isConfirmingClear}
        onOpenChange={setIsConfirmingClear}
        title="Clear all notifications?"
        description="Your feed will be emptied. The tasks and comments they point to are not affected."
        confirmLabel="Clear all"
        destructive
        onConfirm={() => {
          clearAll();
          setIsConfirmingClear(false);
        }}
      />
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <BellOff className="h-5 w-5 text-muted-foreground" />
      </span>
      <h2 className="font-display text-lg font-semibold">
        {filter === "unread" ? "Nothing unread" : "No notifications yet"}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filter === "unread"
          ? "You have read everything in your feed."
          : "When someone assigns you a task, comments on one, or changes something you own, it shows up here."}
      </p>
    </div>
  );
}
