"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { AppNotification } from "@/lib/types";

/**
 * One feed, shared by everything that renders it.
 *
 * The bell in the sidebar and the /notifications page show the same data, and
 * opening a notification in one has to update the badge in the other. A module
 * store subscribed to with useSyncExternalStore keeps them in step without a
 * provider wrapping the whole app, and means navigating between pages doesn't
 * refetch a feed that is already in memory.
 */

const PAGE_SIZE = 20;
/**
 * Slow on purpose. Notifications are not a chat: a minute late is fine, and a
 * tighter loop would have every open tab querying the database all day. Focus
 * and tab-visibility changes cover the case that actually matters — someone
 * coming back to the app expects it to be current.
 */
const POLL_INTERVAL_MS = 60_000;

export interface FeedState {
  items: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
  /** True only for the very first load, so the panel can show a skeleton once. */
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

const EMPTY: FeedState = {
  items: [],
  unreadCount: 0,
  nextCursor: null,
  isLoading: true,
  isLoadingMore: false,
  error: null,
};

let state: FeedState = EMPTY;
const listeners = new Set<() => void>();

function setState(patch: Partial<FeedState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
/** Nothing is fetched on the server, so the first paint is the empty feed. */
const getServerSnapshot = () => EMPTY;

/** Newest first, id breaking ties — the same order the API returns. */
function compare(a: AppNotification, b: AppNotification): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

interface FeedPage {
  items: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
}

async function fetchPage(cursor?: string): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(`/api/notifications?${params}`);
  if (!response.ok) throw new Error("Could not load notifications");
  return response.json();
}

/** Stops a slow poll from clobbering a fresher result, and avoids stacking up. */
let inFlight = false;

export async function refreshNotifications(): Promise<void> {
  if (inFlight) return;
  inFlight = true;

  try {
    const page = await fetchPage();

    // Anything already loaded that sits *past* this page is kept, so a refresh
    // does not collapse a list the user has paged through. Anything inside the
    // window and missing from the response has been deleted, and is dropped.
    const last = page.items[page.items.length - 1];
    const tail =
      page.nextCursor && last
        ? state.items.filter((item) => compare(item, last) > 0)
        : [];

    setState({
      items: [...page.items, ...tail],
      unreadCount: page.unreadCount,
      nextCursor: page.nextCursor,
      isLoading: false,
      error: null,
    });
  } catch (error) {
    console.error("Failed to load notifications:", error);
    setState({
      isLoading: false,
      error: error instanceof Error ? error.message : "Could not load",
    });
  } finally {
    inFlight = false;
  }
}

export async function loadMoreNotifications(): Promise<void> {
  const cursor = state.nextCursor;
  if (!cursor || state.isLoadingMore) return;

  setState({ isLoadingMore: true });
  try {
    const page = await fetchPage(cursor);
    const known = new Set(state.items.map((item) => item.id));
    setState({
      items: [
        ...state.items,
        ...page.items.filter((item) => !known.has(item.id)),
      ],
      unreadCount: page.unreadCount,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    console.error("Failed to load more notifications:", error);
  } finally {
    setState({ isLoadingMore: false });
  }
}

/**
 * Marks read optimistically.
 *
 * Clicking a notification navigates away in the same tick, so waiting for the
 * server before greying the row would mean the change is never seen. The
 * request still runs; if it fails the next poll puts the badge back.
 */
export function markNotificationsRead(ids: string[]): void {
  const targets = new Set(
    state.items
      .filter((item) => ids.includes(item.id) && item.readAt === null)
      .map((item) => item.id)
  );
  if (targets.size === 0) return;

  const readAt = new Date().toISOString();
  setState({
    items: state.items.map((item) =>
      targets.has(item.id) ? { ...item, readAt } : item
    ),
    unreadCount: Math.max(0, state.unreadCount - targets.size),
  });

  void post("/api/notifications/read", { ids: [...targets] });
}

export function markAllNotificationsRead(): void {
  if (state.unreadCount === 0) return;

  const readAt = new Date().toISOString();
  setState({
    items: state.items.map((item) =>
      item.readAt ? item : { ...item, readAt }
    ),
    unreadCount: 0,
  });

  void post("/api/notifications/read", { all: true });
}

export function clearAllNotifications(): void {
  if (state.items.length === 0) return;

  setState({ items: [], unreadCount: 0, nextCursor: null });
  void post("/api/notifications", { all: true }, "DELETE");
}

async function post(url: string, body: unknown, method = "POST") {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(String(response.status));

    // Trust the server's count over the optimistic one — another tab may have
    // read something in the meantime.
    const payload = await response.json();
    if (typeof payload?.unreadCount === "number") {
      setState({ unreadCount: payload.unreadCount });
    }
  } catch (error) {
    console.error(`Notification update failed (${url}):`, error);
    void refreshNotifications();
  }
}

/**
 * Subscribes to the feed and keeps one poll running for as long as at least one
 * component is mounted — the bell and the page share the same timer.
 */
let mounted = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function useNotifications(): FeedState {
  const feed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    mounted += 1;
    if (mounted === 1) {
      void refreshNotifications();
      timer = setInterval(() => {
        // A hidden tab does not need a current badge, and polling one for hours
        // is pure waste. The visibility listener catches it up on return.
        if (document.visibilityState === "visible") {
          void refreshNotifications();
        }
      }, POLL_INTERVAL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      mounted -= 1;
      if (mounted === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return feed;
}

/** The actions, stable across renders so they can sit in dependency arrays. */
export function useNotificationActions() {
  return {
    refresh: useCallback(() => refreshNotifications(), []),
    loadMore: useCallback(() => loadMoreNotifications(), []),
    markRead: useCallback((ids: string[]) => markNotificationsRead(ids), []),
    markAllRead: useCallback(() => markAllNotificationsRead(), []),
    clearAll: useCallback(() => clearAllNotifications(), []),
  };
}
