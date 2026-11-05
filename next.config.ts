import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Lets `next dev` resolve Cloudflare bindings (e.g. the HYPERDRIVE binding
// src/lib/prisma.ts reads via getCloudflareContext()) against the values in
// .dev.vars / wrangler.jsonc, instead of only working once deployed.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
