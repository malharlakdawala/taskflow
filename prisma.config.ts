import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local, but the Prisma CLI does not, so load it explicitly.
// Without this, `npx prisma ...` would silently fall back to a different
// DATABASE_URL than the running app uses.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Not prisma's env(): it throws when unset, and `prisma generate` (run on
    // every install, including CI with no database) doesn't need a URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
