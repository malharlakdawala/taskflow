import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { sentryOptions } from "@/lib/sentry";
import { captureRequestError } from "@/lib/posthog-server";

export function register() {
  // Same options for the Node.js and Edge runtimes.
  Sentry.init(sentryOptions(process.env.SENTRY_DSN));
}

/** Reports unhandled errors from route handlers, server components and actions. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  Sentry.captureRequestError(error, request, context);
  return captureRequestError(error, request, context);
};
