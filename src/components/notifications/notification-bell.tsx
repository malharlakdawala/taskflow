"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, BellOff, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NotificationItem } from "@/components/notifications/notification-item";
import { cn } from "@/lib/utils";
import { useNotifications, useNotificationActions } from "@/lib/use-notifications";
import type { AppNotification } from "@/lib/types";

/** As many as fit without the panel becoming its own scrolling page. */
const PREVIEW_COUNT = 8;

export function NotificationBell() {
  const { items, unreadCount, isLoading } = useNotifications();
  const { markRead, markAllRead } = useNotificationActions();
  const [isOpen, setIsOpen] = useState(false);

  const preview = items.slice(0, PREVIEW_COUNT);

  const open = (notification: AppNotification) => {
    markRead([notification.id]);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          />
        }
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          // Sits on the bell rather than beside it so the sidebar header keeps
          // its height whether or not there is anything waiting.
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center",
              "rounded-full bg-primary px-1 text-[10px] font-bold leading-none",
              "text-primary-foreground ring-2 ring-sidebar"
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-[22rem] gap-0 p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[24rem] overflow-y-auto p-1.5">
          {isLoading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : preview.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <BellOff className="h-4 w-4 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">You&rsquo;re all caught up</p>
              <p className="text-xs text-muted-foreground">
                Assignments, comments and task changes land here.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {preview.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onOpen={open}
                />
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              render={<Link href="/notifications" />}
              onClick={() => setIsOpen(false)}
            >
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
