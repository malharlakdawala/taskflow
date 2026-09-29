import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Shared Sentry options for server, edge and browser.
 *
 * Errors only: tracing/replay are off so the free-tier event quota is spent on
 * real failures. Nothing is sent unless a DSN is configured, so local dev and
 * CI stay silent. Set SENTRY_DSN (server/edge) and NEXT_PUBLIC_SENTRY_DSN
 * (browser) in Vercel; NEXT_PUBLIC_* is inlined at build time.
 */
export function sentryOptions(dsn: string | undefined) {
  const environment =
    process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV;

  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrub,
  };
}

/** Drop query strings from URLs (they can carry invite/auth tokens). */
function scrub(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) event.request.url = event.request.url.split("?")[0];
  if (event.request) {
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.headers;
  }
  return event;
}
