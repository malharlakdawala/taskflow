import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js reads .env.local, but the Prisma CLI does not, so load it explicitly.
// Without this, `npx prisma ...` would silently fall back to a different
// DATABASE_URL than the running app uses.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
