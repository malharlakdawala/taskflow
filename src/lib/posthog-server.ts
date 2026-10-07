import "server-only";

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
