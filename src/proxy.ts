import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next.js 16 renamed the `middleware` file convention to `proxy`.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - ingest (PostHog proxy — a signed-out visitor's analytics would
     *   otherwise be redirected to /login and never arrive)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - static image assets
     */
    "/((?!ingest/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
