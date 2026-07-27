import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * TaskFlow's tables live in the `taskflow` schema rather than `public`, so the
 * adapter has to be told which schema to qualify generated queries with.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Locally: copy .env.example to .env.local and fill " +
        "in the Supabase connection string (Dashboard → Connect → ORMs → Prisma). " +
        "On Vercel: add it under Settings → Environment Variables."
    );
  }

  const adapter = new PrismaPg({ connectionString }, { schema: "taskflow" });
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Deliberately lazy. `next build` imports every route module to collect page
 * data, so constructing the client at module scope would turn a missing
 * DATABASE_URL into a build failure rather than a request-time error. The proxy
 * defers construction until the first actual query.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
