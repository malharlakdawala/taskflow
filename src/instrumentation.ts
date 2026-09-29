import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

export function register() {
  // Same options for the Node.js and Edge runtimes.
  Sentry.init(sentryOptions(process.env.SENTRY_DSN));
}

/** Reports unhandled errors from route handlers, server components and actions. */
export const onRequestError = Sentry.captureRequestError;
