import type { NextConfig } from "next";

const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

const nextConfig: NextConfig = {
  // posthog-js sends to /ingest on our own origin rather than straight to
  // PostHog, because ad blockers list the *.i.posthog.com hosts and silently
  // drop pageviews, exceptions and replays for anyone running one.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${posthogHost.replace(".i.posthog.com", "-assets.i.posthog.com")}/static/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${posthogHost}/:path*`,
      },
    ];
  },
  // PostHog's API paths end in a slash (/ingest/e/, /ingest/flags/); Next's
  // trailing-slash redirect would bounce every one of them.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
