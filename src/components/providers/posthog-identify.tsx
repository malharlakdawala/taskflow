"use client";

import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import type { SessionUser } from "@/lib/types";

/**
 * Links the anonymous visitor id PostHog already assigned to this real
 * account, so events from before and after login join up as one person.
 * Mounted once in the dashboard layout — every authenticated page gets it
 * for free, logged-out pages never do.
 */
export function PostHogIdentify({ user }: { user: SessionUser }) {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }, [posthog, user.id, user.email, user.name, user.role]);

  return null;
}
