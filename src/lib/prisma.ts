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
type RequestContext = { env: WorkerEnv; ctx: object };

// Throws outside a Worker and `next dev` (e.g. on Vercel or `next start`),
// where there are no bindings and process.env is the source.
function cloudflareContext(): RequestContext | null {
  try {
    return getCloudflareContext() as unknown as RequestContext;
  } catch {
    return null;
  }
}

function createPrismaClient(env: WorkerEnv) {
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
 * One client per request on Workers, keyed on that request's ExecutionContext.
 * Not one per isolate: workerd refuses to let a request use sockets opened by
 * a different request ("Cannot perform I/O on behalf of a different request").
 * Not one per query either: each client opens its own connection and
 * instantiates the WASM query compiler, and a request may only hold 6
 * connections open, so a page firing queries in parallel would stall.
 *
 * Outside Workers (Vercel, `next start`) one shared client is the normal setup.
 *
 * Lazy so `next build`, which imports every route module, doesn't fail on a
 * missing connection string.
 */
const perRequest = new WeakMap<object, PrismaClient>();
let shared: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  const context = cloudflareContext();
  if (!context) {
    return (shared ??= createPrismaClient({}));
  }
  let client = perRequest.get(context.ctx);
  if (!client) {
    client = createPrismaClient(context.env);
    perRequest.set(context.ctx, client);
  }
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
