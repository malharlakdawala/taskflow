import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * TaskFlow has no ISR/SSG pages — every route is either an auth-gated
 * dashboard page or an API route marked `force-dynamic` (see
 * src/app/(auth)/layout.tsx and the API routes). There's nothing to
 * incrementally cache or revalidate, so no incrementalCache/tagCache/queue
 * override is configured: SSR works out of the box without one, and adding
 * R2/KV/D1 here would just be unused plumbing (R2 isn't enabled on this
 * Cloudflare account anyway).
 */
export default defineCloudflareConfig();
