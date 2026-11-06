import "server-only";

import type { Instrumentation } from "next";
import { PostHog } from "posthog-node";

/**
 * Server-side capture — for events that happen in an API route, where there
 * is no browser to run posthog-js. A serverless function has no long-running
 * process to batch-flush in the background, so captureImmediate() is used at
 * every call site instead of the default queue-and-flush-later behavior.
 */
export function getPostHogServerClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  return new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  });
}

type RequestContext = { get(): { waitUntil?: (promise: Promise<unknown>) => void } | undefined };

/**
 * A server component that throws reaches the browser only as React's minified
 * #441, with a digest and no stack. Capturing the real error here under the
 * session id from the posthog-js cookie puts the server cause in the same
 * PostHog session as that browser exception.
 *
 * React reports render errors through a synchronous callback, so Next does not
 * await onRequestError on that path. waitUntil (provided by both OpenNext on
 * Workers and Vercel) keeps the request alive until the event is sent.
 */
export function captureRequestError(
  ...[error, request, context]: Parameters<Instrumentation.onRequestError>
): Promise<void> {
  const client = getPostHogServerClient();
  if (!client) return Promise.resolve();

  const { distinctId, sessionId } = browserIdentity(request.headers.cookie);
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;

  const sent = client
    .captureExceptionImmediate(error, distinctId, {
      $session_id: sessionId,
      digest,
      // Query strings can carry invite and auth tokens (see sentry.ts).
      path: request.path.split("?")[0],
      method: request.method,
      route_path: context.routePath,
      route_type: context.routeType,
      render_source: context.renderSource,
      revalidate_reason: context.revalidateReason,
    })
    // A failure to report must never become a second error in the handler.
    .catch(() => {});

  const requestContext = (globalThis as Record<symbol, RequestContext | undefined>)[
    Symbol.for("@next/request-context")
  ];
  requestContext?.get()?.waitUntil?.(sent);
  return sent;
}

/** distinct_id and session id from the `ph_<key>_posthog` cookie posthog-js sets. */
function browserIdentity(cookieHeader: string | string[] | undefined): {
  distinctId?: string;
  sessionId?: string;
} {
  const name = `ph_${process.env.NEXT_PUBLIC_POSTHOG_KEY}_posthog=`;
  const cookie = [cookieHeader ?? []]
    .flat()
    .flatMap((header) => header.split(/;\s*/))
    .find((part) => part.startsWith(name));
  if (!cookie) return {};

  try {
    const value = JSON.parse(decodeURIComponent(cookie.slice(name.length)));
    return {
      distinctId: typeof value.distinct_id === "string" ? value.distinct_id : undefined,
      // $sesid is [last activity timestamp, session id, session start timestamp].
      sessionId: Array.isArray(value.$sesid) && typeof value.$sesid[1] === "string" ? value.$sesid[1] : undefined,
    };
  } catch {
    return {};
  }
}
