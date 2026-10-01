"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    /** Console-debugging convenience only — app code should use usePostHog(). */
    posthog?: typeof posthog;
  }
}

// Module scope, not inside the component: runs once per client bundle load,
// so Strict Mode's double-invoked effects can't double-init it the way an
// effect-based guard would need extra bookkeeping to avoid.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  window.posthog = posthog;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    // The App Router doesn't do full page loads on navigation, so posthog-js's
    // own history-based pageview capture misses client-side route changes —
    // captured manually by PostHogPageview below instead.
    capture_pageview: false,
    // Anonymous visitors (the login/signup screens) are still worth knowing
    // traffic volume for, without creating a billable person profile for
    // every one — only identify() (see PostHogIdentify) does that.
    person_profiles: "identified_only",
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthogClient = usePostHog();

  useEffect(() => {
    if (!pathname || !posthogClient) return;
    const url = searchParams.toString()
      ? `${window.origin}${pathname}?${searchParams.toString()}`
      : `${window.origin}${pathname}`;
    posthogClient.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, posthogClient]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
