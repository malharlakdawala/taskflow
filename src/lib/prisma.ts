import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * TaskFlow's tables live in the `taskflow` schema rather than `public`, so the
 * adapter has to be told which schema to qualify generated queries with.
 *
 * The connection string comes from the Hyperdrive binding, not `DATABASE_URL`
 * directly: on Cloudflare Workers, Hyperdrive keeps the real pool of
 * connections to Supabase (Tokyo) open on Cloudflare's side, so each fresh
 * client here is a fast local hop rather than a fresh cross-ocean TCP+TLS
 * handshake. `env.DATABASE_URL` is kept as a fallback for any environment
 * without the Hyperdrive binding configured (e.g. a plain `next build` check).
 */
type WorkerEnv = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string };

// Throws outside a Worker and `next dev` (e.g. on Vercel or `next start`),
// where there are no bindings and process.env is the source.
function cloudflareEnv(): WorkerEnv {
  try {
    return getCloudflareContext().env as unknown as WorkerEnv;
  } catch {
    return {};
  }
}

function createPrismaClient() {
  const env = cloudflareEnv();
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "No database connection string available. Locally: copy .env.example to " +
        ".dev.vars and fill in the Supabase connection string (Dashboard → " +
        "Connect → ORMs → Prisma). In production: the HYPERDRIVE binding in " +
        "wrangler.jsonc, backed by the DATABASE_URL secret."
    );
  }

  const adapter = new PrismaPg({ connectionString }, { schema: "taskflow" });
  return new PrismaClient({ adapter });
}

/**
 * Deliberately NOT cached on `globalThis`. On Cloudflare Workers, a request
 * can't reuse I/O (open sockets, pending promises) created during a *different*
 * request's execution context — workerd throws "Cannot perform I/O on behalf
 * of a different request" the moment it's tried. A module-level singleton
 * would do exactly that the first time two requests landed on the same warm
 * isolate. Building a fresh client on every property access costs a little
 * more than strictly necessary within a single request that makes several
 * calls, but it's the only option that can't silently reintroduce that crash
 * — and Hyperdrive is what keeps "fresh client" cheap instead of slow.
 *
 * The lazy Proxy shape itself is kept for the same reason as before: `next
 * build` imports every route module to collect page data, so constructing a
 * client at module scope would turn a missing connection string into a build
 * failure rather than a request-time error.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = createPrismaClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
