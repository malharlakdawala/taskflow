import type { NextConfig } from "next";
import path from "node:path";

// `cf:build` sets this so the Worker gets the `runtime = "cloudflare"` Prisma
// client (static WASM import, see prisma/schema.prisma) instead of the
// default one, which compiles its WASM query compiler at request time —
// something Workers refuses to run. Vercel/local dev never set this, so they
// keep using the default client, unchanged. Aliased for both bundlers since
// which one actually runs depends on --webpack/--turbopack on the `build`
// script invocation.
const isCloudflareBuild = process.env.TASKFLOW_BUILD_TARGET === "cloudflare";

const nextConfig: NextConfig = {
  // OpenNext's Node.js-middleware bundling step copies traced files into
  // `.next/standalone/...`, which only exists when this is set. Turbopack
  // builds apparently produce it by some other path; the `--webpack` build
  // used for the Cloudflare target (see cf:next-build — Turbopack hangs on
  // the Prisma `runtime = "cloudflare"` client's static WASM import) does
  // not, so OpenNext's copy step throws ENOENT without it.
  output: isCloudflareBuild ? "standalone" : undefined,
  turbopack: isCloudflareBuild
    ? {
        resolveAlias: {
          "@/generated/prisma/client": "@/generated/prisma-cloudflare/client",
        },
      }
    : undefined,
  webpack: isCloudflareBuild
    ? (config, { isServer }) => {
        // Keyed on the resolved absolute path, not the "@/..." specifier:
        // Next's own `@` -> `src` alias resolves first, so a literal
        // "@/generated/prisma/client" key here never matches anything.
        config.resolve.alias[path.resolve(__dirname, "src/generated/prisma/client")] = path.resolve(
          __dirname,
          "src/generated/prisma-cloudflare/client"
        );
        if (isServer) {
          // Leave the client's `import("./query_compiler_fast_bg.wasm?module")`
          // untouched (as an absolute path) instead of letting webpack parse
          // it. OpenNext's wrangler-externals plugin then hands it to
          // wrangler, which ships it as a precompiled WebAssembly.Module.
          config.externals.push(
            (
              { request, context }: { request?: string; context?: string },
              callback: (err?: Error | null, result?: string) => void
            ) => {
              if (request?.endsWith(".wasm?module") && context) {
                const file = path.resolve(context, request.slice(0, -"?module".length));
                return callback(null, `import ${file.replaceAll("\\", "/")}?module`);
              }
              callback();
            }
          );
        }
        return config;
      }
    : undefined,
};

export default nextConfig;

// Lets `next dev` resolve Cloudflare bindings (e.g. the HYPERDRIVE binding
// src/lib/prisma.ts reads via getCloudflareContext()) against the values in
// .dev.vars / wrangler.jsonc, instead of only working once deployed.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
