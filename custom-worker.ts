// Imported as scoped types, not `/// <reference types="@cloudflare/workers-types" />`:
// that directive merges Workers' generic `json<T>(): Promise<T>` globally over
// the whole program, which silently changes every unrelated `response.json()`
// call in browser-side code from `Promise<any>` (DOM lib) to `Promise<unknown>`.
import type { ExportedHandler, ExecutionContext } from "@cloudflare/workers-types";

// @ts-expect-error: .open-next/worker.js only exists after `opennextjs-cloudflare build`.
import { default as openNextWorker } from "./.open-next/worker.js";

/**
 * Cloudflare Cron Triggers need a `scheduled` export on the Worker, which the
 * generated `.open-next/worker.js` doesn't have — it only exports `fetch`. This
 * file wraps that generated worker to add one, and becomes the real `main`
 * entry in wrangler.jsonc instead of the generated file directly.
 *
 * Replaces vercel.json's cron (30 2 * * * = 08:00 IST, see wrangler.jsonc).
 * The handler calls the existing /api/cron/due-soon route in-process (through
 * the same generated fetch handler, no network hop) with the real CRON_SECRET
 * bearer token, so the route's own auth check — not this file — stays the one
 * source of truth for who's allowed to trigger the digest.
 */

interface Env {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

export default {
  fetch: openNextWorker.fetch,

  async scheduled(_event, env: Env, ctx) {
    ctx.waitUntil(runDueSoonDigest(env, ctx));
  },
} satisfies ExportedHandler<Env>;

async function runDueSoonDigest(env: Env, ctx: ExecutionContext) {
  const baseUrl = env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    console.error("[cron] NEXT_PUBLIC_APP_URL is not set; cannot run the due-soon digest.");
    return;
  }

  const request = new Request(new URL("/api/cron/due-soon", baseUrl), {
    headers: { Authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
  });

  const response = await openNextWorker.fetch(request, env, ctx);

  if (!response.ok) {
    console.error(`[cron] due-soon digest returned ${response.status}`);
  }
}

// No DOQueueHandler/DOShardedTagCache re-export here: TaskFlow has no
// ISR/revalidation (see open-next.config.ts), so the generated worker doesn't
// export those names, and re-exporting a name that doesn't exist is a hard
// ESM build error, not a harmless no-op.
