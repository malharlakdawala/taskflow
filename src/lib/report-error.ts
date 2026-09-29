import * as Sentry from "@sentry/nextjs";

/**
 * Report an error that the caller catches and handles (returns a 500, swallows
 * as best-effort, etc.). Sentry only sees errors that escape uncaught, so
 * every "catch, log, carry on" path calls this or it is invisible to alerting.
 *
 * `context` is a stable label ("cron.due-soon", "email.brevo-rejected") used as
 * a tag, for grouping and for throttling. It must not contain user data.
 *
 * NOTE: Sentry scrubs any text containing words like password, credentials,
 * token or secret (it shows "[Filtered]"), so keep summaries free of them.
 *
 * Every event carries: severity (critical | error | warning), area, impact and a
 * plain-English summary, so an alert says what broke, how bad it is and what
 * users experience. Alert rules filter on `severity`.
 *
 * Throttled per context+message: a database outage would otherwise send one
 * event per failing request and burn the free-tier quota in minutes.
 */

export type Severity = "critical" | "error" | "warning";
type Impact = "client-facing" | "internal";

interface Meta {
  severity: Severity;
  area: string;
  impact: Impact;
  summary: string;
}

/** Defaults by context prefix; the first matching prefix wins. */
const META: Array<[string, Meta]> = [
  ["cron.due-soon", { severity: "critical", area: "cron", impact: "client-facing", summary: "The daily due-soon digest failed, so no reminder emails went out today." }],
  ["cron.", { severity: "error", area: "cron", impact: "internal", summary: "A scheduled job failed." }],
  ["email.", { severity: "error", area: "email", impact: "client-facing", summary: "An email could not be sent, so users may not receive invites or notifications." }],
  ["notify.", { severity: "error", area: "notifications", impact: "client-facing", summary: "In-app or email notifications for a task event failed." }],
  ["notifications.", { severity: "error", area: "notifications", impact: "client-facing", summary: "A notification could not be saved." }],
  ["invitations.", { severity: "error", area: "invitations", impact: "client-facing", summary: "A workspace invitation failed." }],
  ["mcp.", { severity: "error", area: "mcp", impact: "internal", summary: "An MCP tool call failed for a connected AI client." }],
  ["members.", { severity: "warning", area: "members", impact: "internal", summary: "A background member update failed." }],
];

const FALLBACK: Meta = {
  severity: "error",
  area: "app",
  impact: "internal",
  summary: "An error was caught and handled but should be looked at.",
};

/** A failure to reach or authenticate to the database is always critical. */
const DB_FAILURE = /prisma|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|password authentication|tenant\/user|too many (clients|connections)|connection.*(closed|terminated)|XX000|P100[0-9]|P1017/i;

const LEVEL = { critical: "fatal", error: "error", warning: "warning" } as const;

const THROTTLE_MS = 60_000;
const lastSent = new Map<string, number>();

export function reportError(
  context: string,
  error: unknown,
  options: { severity?: Severity; extra?: Record<string, string | number | boolean> } = {}
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${context}:${err.message.slice(0, 120)}`;
  const now = Date.now();

  if (now - (lastSent.get(key) ?? 0) < THROTTLE_MS) return;
  lastSent.set(key, now);
  // Keep the map from growing without bound on long-lived instances.
  if (lastSent.size > 200) lastSent.clear();

  const base = META.find(([prefix]) => context.startsWith(prefix))?.[1] ?? FALLBACK;
  const dbDown = DB_FAILURE.test(`${err.name} ${err.message}`);
  const meta: Meta = dbDown
    ? {
        severity: "critical",
        area: "database",
        impact: "client-facing",
        summary:
          "The app cannot connect to its database. Users will see errors and background jobs fail until this is fixed. Check the database connection settings and that the Supabase project is running.",
      }
    : base;
  const severity = options.severity ?? meta.severity;

  Sentry.withScope((scope) => {
    scope.setLevel(LEVEL[severity]);
    scope.setTags({ context, severity, area: meta.area, impact: meta.impact });
    scope.setContext("what_this_means", { summary: meta.summary, ...options.extra });
    // A database outage is ONE issue however many callers hit it (one alert, not
    // one per route); everything else groups by stack within its context.
    scope.setFingerprint(dbDown ? ["database-unreachable"] : ["{{ default }}", context]);
    Sentry.captureException(err);
  });
}
